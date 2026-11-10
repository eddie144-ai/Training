'use strict';
/* Opt-in Google Drive auto-backup. The user's own Drive, and only the files this app created
   (scope drive.file). No backend and no client secret: Google Identity Services returns an
   access token that stays in memory. It is never copied onto the app state, so a backup cannot
   contain it, and this file never touches browser storage.
   The client id below is a public OAuth web client (no secret). Auto-save stays off until
   the user turns it on, and Google's script loads only then. */
const Drive = (() => {
  // Public OAuth web client id. Authorised JavaScript origin: https://eddie144-ai.github.io. No redirect URI.
  const DRIVE_CLIENT_ID = '225800622965-hsm5f4941gmjs9a0f0pvqnrhhoee9hpj.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const GSI_SRC = 'https://accounts.google.com/gsi/client';
  const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';
  const DEBOUNCE_MS = 45000;
  const STALE_MS = 6 * 60 * 60 * 1000;
  const TOKEN_SKEW_MS = 60 * 1000;
  const SILENT_TIMEOUT_MS = 12000;
  const INTERACTIVE_TIMEOUT_MS = 120000;
  const BACKOFF_BASE_MS = 30000;
  const BACKOFF_MAX_MS = 15 * 60 * 1000;
  const RECONNECT_AFTER = 2;

  let host = null;
  let started = false;
  let listening = false;
  let lastSig = null;
  // Memory only. Never assign this onto the app state.
  let token = null;
  let client = null;
  let waiter = null;
  let gsiP = null;
  let silentFails = 0;
  let lastError = '';
  let busy = false;
  let inflight = null;
  let queued = false;
  let debounceTimer = null;
  let retryTimer = null;
  let retryAt = 0;
  let failStreak = 0;
  let debounceMs = DEBOUNCE_MS;
  let backoffBaseMs = BACKOFF_BASE_MS;

  const now = () => (host && host.now ? host.now() : Date.now());
  const today = () => (host && host.today ? host.today() : isoDay(new Date(now())));
  function isoDay(d) {
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function state() {
    try { return host && host.getState ? host.getState() : null; } catch { return null; }
  }
  function persist() {
    try { host.save(); } catch { /* a failed save must not break the logger */ }
  }
  function notify() {
    try { if (host && host.onStatus) host.onStatus(); } catch { /* painting status is optional */ }
  }
  const available = () => !!DRIVE_CLIENT_ID;
  function enabled() {
    const s = state();
    return available() && !!(s && s.settings && s.settings.driveAuto);
  }
  const recordCount = (s) => (s.workouts?.length || 0) + (s.weights?.length || 0) + (s.meals?.length || 0) + (s.measurements?.length || 0);
  // First upload waits for a log worth keeping: the same bar as the backup reminder.
  const hasHistory = (s) => (s.meals?.length || 0) + (s.workouts?.length || 0) + (s.weights?.length || 0) >= 5;
  // More than about 30% fewer records than the last successful upload.
  const shrunk = (s) => {
    const last = s.settings?.lastDriveCount || 0;
    return last > 0 && recordCount(s) * 10 < last * 7;
  };
  const shrinkBlocked = (s) => recordCount(s) > 0 && shrunk(s) && s.settings?.driveAllowShrink !== recordCount(s);
  function signature(s) {
    try { return JSON.stringify([s.workouts, s.weights, s.meals, s.measurements, s.fasts, s.fastDays, s.chains, s.mealPresets, s.labels]); } catch { return ''; }
  }
  function online() {
    try { return navigator.onLine !== false; } catch { return true; }
  }
  function clearTimer(id) {
    if (id) clearTimeout(id);
    return null;
  }

  function gsiReady() {
    try { return !!(google && google.accounts && google.accounts.oauth2 && google.accounts.oauth2.initTokenClient); }
    catch { return false; }
  }
  function loadGsi() {
    if (!DRIVE_CLIENT_ID) return Promise.reject(Object.assign(new Error('no client'), { code: 'unavailable' }));
    if (gsiReady()) return Promise.resolve();
    if (gsiP) return gsiP;
    gsiP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GSI_SRC;
      s.async = true;
      s.onload = () => (gsiReady() ? resolve() : reject(new Error('gsi')));
      s.onerror = () => { gsiP = null; reject(new Error('gsi')); };
      document.head.appendChild(s);
    });
    // Drop the cached promise on failure so a later attempt can load the script again,
    // without leaving the rejection unhandled when the caller also handles it.
    gsiP.then(() => {}, () => { gsiP = null; });
    return gsiP;
  }

  function dropWaiter(err) {
    const w = waiter;
    waiter = null;
    if (!w) return;
    clearTimeout(w.timer);
    if (!w.interactive) silentFails += 1;
    w.reject(err);
  }
  function getClient() {
    if (client) return client;
    client = google.accounts.oauth2.initTokenClient({
      client_id: DRIVE_CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        const w = waiter;
        waiter = null;
        if (resp && resp.access_token && !resp.error) {
          token = { value: resp.access_token, expiresAt: now() + ((resp.expires_in || 3600) * 1000) };
          silentFails = 0;
          if (w) { clearTimeout(w.timer); w.resolve(token.value); }
          return;
        }
        if (!w) return;
        clearTimeout(w.timer);
        if (!w.interactive) silentFails += 1;
        w.reject(Object.assign(new Error((resp && resp.error) || 'auth'), { code: 'auth' }));
      },
      error_callback: (err) => {
        dropWaiter(Object.assign(new Error((err && (err.message || err.type)) || 'auth'), { code: 'auth' }));
      },
    });
    return client;
  }
  function requestToken(interactive) {
    return new Promise((resolve, reject) => {
      const w = { resolve, reject, timer: null, interactive: !!interactive };
      w.timer = setTimeout(() => {
        dropWaiter(Object.assign(new Error('timeout'), { code: 'timeout' }));
      }, interactive ? INTERACTIVE_TIMEOUT_MS : SILENT_TIMEOUT_MS);
      if (w.timer && w.timer.unref) w.timer.unref();
      waiter = w;
      try {
        getClient().requestAccessToken(interactive ? { prompt: 'consent' } : { prompt: '' });
      } catch (e) {
        dropWaiter(e.code ? e : Object.assign(e, { code: 'auth' }));
      }
    });
  }
  const tokenFresh = () => !!(token && token.expiresAt - now() > TOKEN_SKEW_MS);
  async function ensureToken(interactive) {
    if (!interactive && tokenFresh()) return token.value;
    if (!interactive && silentFails >= RECONNECT_AFTER) throw Object.assign(new Error('reconnect'), { code: 'reconnect' });
    await loadGsi();
    return requestToken(interactive);
  }

  function multipart(name, json) {
    const boundary = `gymfuel${now().toString(36)}${Math.random().toString(36).slice(2)}`;
    const meta = JSON.stringify({ name, mimeType: 'application/json' });
    const body = [
      `--${boundary}`,
      'Content-Type: application/json; charset=UTF-8',
      '',
      meta,
      `--${boundary}`,
      'Content-Type: application/json',
      '',
      json,
      `--${boundary}--`,
      '',
    ].join('\r\n');
    return { body, type: `multipart/related; boundary=${boundary}` };
  }
  const httpError = (status) => Object.assign(new Error(`HTTP ${status}`), { status });
  async function authed(url, options) {
    const send = (tok) => fetch(url, {
      method: options.method,
      headers: { ...options.headers, Authorization: `Bearer ${tok}` },
      body: options.body,
    });
    let tok = await ensureToken(false);
    let res = await send(tok);
    if (res.status === 401) {
      token = null;
      tok = await ensureToken(false);
      res = await send(tok);
    }
    return res;
  }
  async function putOne(name, id, json) {
    if (id) {
      const res = await authed(`${UPLOAD}/${encodeURIComponent(id)}?uploadType=media`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: json,
      });
      if (res.status === 404) return putOne(name, '', json);
      if (res.status === 401) { token = null; silentFails += 1; }
      if (!res.ok) throw httpError(res.status);
      return id;
    }
    const built = multipart(name, json);
    const res = await authed(`${UPLOAD}?uploadType=multipart`, {
      method: 'POST',
      headers: { 'Content-Type': built.type },
      body: built.body,
    });
    if (res.status === 401) { token = null; silentFails += 1; }
    if (!res.ok) throw httpError(res.status);
    let data = null;
    try { data = await res.json(); } catch { data = null; }
    if (!data || !data.id) throw httpError(500);
    return data.id;
  }

  function armBackoff() {
    failStreak += 1;
    const wait = Math.min(BACKOFF_MAX_MS, backoffBaseMs * 2 ** (failStreak - 1));
    retryAt = now() + wait;
    retryTimer = clearTimer(retryTimer);
    retryTimer = setTimeout(() => {
      retryTimer = null;
      try {
        const s = state();
        if (enabled() && s?.settings?.drivePending && now() >= retryAt) return upload(false);
      } catch { return undefined; }
    }, wait);
    if (retryTimer && retryTimer.unref) retryTimer.unref();
  }
  function markPending(error) {
    const s = state();
    if (s && s.settings) s.settings.drivePending = true;
    lastError = error;
    persist();
    notify();
  }

  async function run(force) {
    debounceTimer = clearTimer(debounceTimer);
    if (!enabled()) return 'off';
    const s = state();
    if (!s || !s.settings) return 'off';
    const count = recordCount(s);
    if (count === 0 || (!s.settings.lastDriveUpload && !hasHistory(s))) {
      lastError = 'empty';
      if (s.settings.drivePending) { s.settings.drivePending = false; persist(); }
      notify();
      return 'empty';
    }
    if (shrinkBlocked(s)) {
      lastError = 'shrink';
      if (s.settings.drivePending) { s.settings.drivePending = false; persist(); }
      notify();
      return 'shrink';
    }
    if (!online()) return (markPending('offline'), 'offline');
    if (!force && now() < retryAt) return 'backoff';
    if (silentFails >= RECONNECT_AFTER) return (markPending('reconnect'), 'reconnect');

    busy = true;
    lastError = '';
    notify();
    try {
      const json = JSON.stringify({ kind: 'gym-fuel-backup', at: new Date().toISOString(), state: s });
      const latestId = await putOne('iron-and-eggs-latest.json', s.settings.driveLatestId || '', json);
      if (s.settings.driveLatestId !== latestId) {
        s.settings.driveLatestId = latestId;
        persist();
      }
      const day = today();
      const sameDay = s.settings.driveDailyOn === day && s.settings.driveDailyId;
      const dailyId = await putOne(`iron-and-eggs-${day}.json`, sameDay ? s.settings.driveDailyId : '', json);
      s.settings.driveDailyId = dailyId;
      s.settings.driveDailyOn = day;
      s.settings.lastBackup = day;
      s.settings.lastDriveUpload = new Date().toISOString();
      s.settings.lastDriveCount = count;
      s.settings.drivePending = false;
      delete s.settings.driveAllowShrink;
      lastError = '';
      failStreak = 0;
      retryAt = 0;
      retryTimer = clearTimer(retryTimer);
      persist();
      return 'ok';
    } catch (e) {
      const code = e && e.code;
      const status = e && e.status;
      if (status === 401 || code === 'reconnect' || code === 'auth' || code === 'timeout') token = null;
      if (!online()) lastError = 'offline';
      else if (silentFails >= RECONNECT_AFTER || code === 'reconnect') lastError = 'reconnect';
      else if (status === 401 || code === 'auth' || code === 'timeout') lastError = 'auth';
      else lastError = 'http';
      if (s.settings) s.settings.drivePending = true;
      if (lastError !== 'offline') armBackoff();
      persist();
      return 'error';
    } finally {
      busy = false;
      notify();
    }
  }

  function upload(force) {
    if (inflight) { queued = true; return inflight; }
    let p;
    p = run(!!force).catch(() => 'error').finally(() => {
      if (inflight === p) inflight = null;
      if (queued) { queued = false; return upload(false); }
    });
    inflight = p;
    return p;
  }

  function schedule() {
    debounceTimer = clearTimer(debounceTimer);
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      return upload(false);
    }, debounceMs);
    if (debounceTimer && debounceTimer.unref) debounceTimer.unref();
  }

  // Remember the log as it was when the app opened, before other apps' lifts are merged in,
  // so that merge still counts as a change worth backing up.
  function baseline(s) {
    lastSig = s ? signature(s) : '';
  }
  function afterSave() {
    if (!started) return;
    const s = state();
    if (!s) return;
    const sig = signature(s);
    const changed = lastSig !== null && sig !== lastSig;
    lastSig = sig;
    if (changed && enabled()) schedule();
  }
  function stale() {
    const iso = state()?.settings?.lastDriveUpload;
    if (!iso) return false;
    const t = new Date(iso).getTime();
    return Number.isFinite(t) && now() - t > STALE_MS;
  }
  function onOnline() {
    if (!enabled()) return Promise.resolve('off');
    if (state()?.settings?.drivePending) return upload(false);
    return Promise.resolve('idle');
  }
  function onVisible() {
    if (!enabled()) return Promise.resolve('off');
    const s = state();
    if (s?.settings?.drivePending || stale()) return upload(false);
    return Promise.resolve('idle');
  }
  function start(hooks) {
    host = hooks || {};
    if (host.debounceMs != null) debounceMs = host.debounceMs;
    if (host.backoffBaseMs != null) backoffBaseMs = host.backoffBaseMs;
    const s = state();
    const sig = s ? signature(s) : '';
    const changed = lastSig !== null && sig !== lastSig;
    lastSig = sig;
    started = true;
    if (!listening && typeof window !== 'undefined' && window.addEventListener) {
      listening = true;
      window.addEventListener('online', () => { try { return onOnline(); } catch { return undefined; } });
    }
    if (changed && enabled()) schedule();
    if (enabled() && (s?.settings?.drivePending || stale())) return upload(false);
  }

  async function enable() {
    if (!available()) return 'unavailable';
    const s = state();
    if (s && s.settings) s.settings.driveAuto = true;
    silentFails = 0;
    try { await ensureToken(true); }
    catch { lastError = 'auth'; notify(); return 'auth'; }
    return upload(true);
  }
  function disable() {
    debounceTimer = clearTimer(debounceTimer);
    retryTimer = clearTimer(retryTimer);
    token = null;
    silentFails = 0;
    retryAt = 0;
    failStreak = 0;
    lastError = '';
    const s = state();
    if (s && s.settings) {
      s.settings.driveAuto = false;
      s.settings.drivePending = false;
    }
    persist();
    notify();
  }
  function uploadNow() {
    if (!enabled()) return Promise.resolve('off');
    return upload(true);
  }
  function reconnect() {
    if (!available()) return Promise.resolve('unavailable');
    const s = state();
    if (s && s.settings) s.settings.driveAuto = true;
    token = null;
    silentFails = 0;
    retryAt = 0;
    return ensureToken(true).then(() => upload(true)).catch(() => { lastError = 'auth'; notify(); return 'auth'; });
  }
  function confirmShrink() {
    if (!enabled()) return Promise.resolve('off');
    const s = state();
    if (!s || !s.settings) return Promise.resolve('off');
    s.settings.driveAllowShrink = recordCount(s);
    persist();
    return upload(true);
  }

  function status() {
    const s = state();
    const settings = (s && s.settings) || {};
    return {
      available: available(),
      enabled: available() && !!settings.driveAuto,
      connected: tokenFresh() && silentFails < RECONNECT_AFTER,
      needsReconnect: available() && !!settings.driveAuto && silentFails >= RECONNECT_AFTER,
      pending: !!settings.drivePending,
      lastUpload: settings.lastDriveUpload || '',
      error: lastError,
      shrink: !!(s && shrinkBlocked(s)),
      busy,
    };
  }

  return {
    available, baseline, start, afterSave, onVisible, enable, disable, uploadNow, reconnect, confirmShrink, status,
  };
})();
