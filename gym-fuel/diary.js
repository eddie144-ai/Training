'use strict';
/* Cut diary. The video and voice files live in IndexedDB (database `gymfuel-diary`).
   They are not part of the JSON backup. The backup keeps the small record only: when, the
   day's weight, the cut day, the title, the note, and a YouTube link if one was saved. */
const Diary = (() => {
  const DB = 'gymfuel-diary';
  const STORE = 'clips';
  const CUT_START = '2026-11-08'; // Gironda cut. This date is day 1.

  function cutDay(date, start = CUT_START) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return null;
    const [y, m, d] = date.split('-').map(Number);
    const [sy, sm, sd] = String(start).split('-').map(Number);
    return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(sy, sm - 1, sd)) / 86400000) + 1;
  }

  function weightKg(weights, date) {
    const row = (weights || []).find((w) => w && w.date === date && Number.isFinite(Number(w.kg)));
    return row ? Math.round(Number(row.kg) * 10) / 10 : null;
  }

  // Title and description for a video Eddie chooses to upload. Privacy is always private
  // until he picks something else on the form.
  function youtubeDraft(entry) {
    const e = entry || {};
    const day = Number.isFinite(Number(e.cutDay)) ? Math.round(Number(e.cutDay)) : null;
    const hasWeight = e.weight != null && e.weight !== '' && Number.isFinite(Number(e.weight));
    const weight = hasWeight ? Math.round(Number(e.weight) * 10) / 10 : null;
    const dayBit = day != null && day >= 1 ? `Day ${day}` : 'Cut diary';
    const custom = String(e.title || '').trim();
    const title = (custom || (weight != null ? `${dayBit} · ${weight} kg` : dayBit)).slice(0, 100);
    const lines = [];
    lines.push(day != null && day >= 1 ? `Day ${day} of the cut to 75 kg. Gironda started 8 Nov 2026.` : 'Cut diary.');
    lines.push(weight != null ? `Weight that day: ${weight} kg.` : 'No weigh-in logged that day.');
    if (e.date) lines.push(String(e.date));
    if (String(e.note || '').trim()) lines.push(String(e.note).trim());
    return { title, description: lines.join('\n').slice(0, 5000), privacy: 'private' };
  }

  // The JSON YouTube asks for. An unknown or missing privacy stays private.
  function uploadBody(draft) {
    const privacy = ['private', 'unlisted', 'public'].includes(draft?.privacy) ? draft.privacy : 'private';
    return {
      snippet: {
        title: String(draft?.title || 'Cut diary').slice(0, 100),
        description: String(draft?.description || '').slice(0, 5000),
        categoryId: '22',
      },
      status: { privacyStatus: privacy, selfDeclaredMadeForKids: false },
    };
  }

  function youtubeProblem(status, body) {
    const reason = String(body?.error?.errors?.[0]?.reason || body?.error?.status || '');
    const message = String(body?.error?.message || body?.error_description || '');
    const blob = `${reason} ${message}`;
    const low = blob.toLowerCase();
    if (status === 401 || reason === 'authError' || low.includes('invalid_token') || low.includes('login required')) {
      return { code: 'auth', text: 'Google sign-in expired. Tap Upload now and sign in again. Nothing new was published.' };
    }
    if (reason === 'accessNotConfigured' || reason === 'SERVICE_DISABLED' || low.includes('accessnotconfigured') || low.includes('youtube data api')) {
      return { code: 'setup', text: 'YouTube Data API v3 isn’t turned on for this Google Cloud project. Enable it, then try the upload again.' };
    }
    if (reason === 'quotaExceeded' || reason === 'dailyLimitExceeded' || reason === 'rateLimitExceeded' || status === 429 || low.includes('quota')) {
      return { code: 'quota', text: 'YouTube’s daily upload limit for this project is used up. A free project allows about 6 uploads a day. Try again tomorrow.' };
    }
    if (reason === 'youtubeSignupRequired') {
      return { code: 'channel', text: 'This Google account doesn’t have a YouTube channel yet. Open YouTube, create a channel, then try again.' };
    }
    if (/insufficient.*scope|access_token_scope_insufficient|invalid_scope/i.test(blob)) {
      return { code: 'scope', text: 'Google refused the YouTube permission. On the consent screen add https://www.googleapis.com/auth/youtube.upload, and add this Gmail as a test user while the app is in Testing.' };
    }
    if (status === 403 || reason === 'forbidden' || reason === 'insufficientPermissions') {
      return { code: 'forbidden', text: 'YouTube refused the upload. Sign in with the channel’s Google account. While the app is in Testing, that Gmail has to be a test user.' };
    }
    if (!status) return { code: 'network', text: 'The upload didn’t reach YouTube. Check the connection and try again. Nothing was published.' };
    return { code: 'http', text: 'YouTube didn’t accept the upload. Nothing was published.' };
  }

  // Metadata only. A blob, a token, or a made-up YouTube address is dropped.
  function cleanEntry(x) {
    if (!x || typeof x !== 'object' || typeof x.id !== 'string' || !x.id) return null;
    if (x.kind !== 'video' && x.kind !== 'audio') return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(x.date || ''))) return null;
    const at = new Date(x.at);
    const weight = x.weight != null && x.weight !== '' && Number.isFinite(Number(x.weight)) ? Math.round(Number(x.weight) * 10) / 10 : null;
    const out = {
      id: x.id.slice(0, 40),
      at: Number.isNaN(at.getTime()) ? new Date(0).toISOString() : at.toISOString(),
      date: x.date,
      kind: x.kind,
      title: String(x.title || '').trim().slice(0, 100),
      note: String(x.note || '').trim().slice(0, 2000),
      weight,
      cutDay: Number.isFinite(Number(x.cutDay)) ? Math.round(Number(x.cutDay)) : cutDay(x.date),
      mime: String(x.mime || '').slice(0, 80),
      bytes: Math.max(0, Math.round(Number(x.bytes) || 0)),
    };
    const yid = x.youtube && typeof x.youtube.id === 'string' ? x.youtube.id : '';
    if (/^[A-Za-z0-9_-]{11}$/.test(yid)) {
      const privacy = ['private', 'unlisted', 'public'].includes(x.youtube.privacy) ? x.youtube.privacy : 'private';
      out.youtube = { id: yid, url: `https://www.youtube.com/watch?v=${yid}`, privacy };
    }
    return out;
  }

  function extFor(mime, kind) {
    const m = String(mime || '');
    if (m.includes('mp4')) return 'mp4';
    if (m.includes('mpeg') || m.includes('mp3')) return 'mp3';
    if (m.includes('wav')) return 'wav';
    if (m.includes('ogg')) return 'ogg';
    return kind === 'audio' ? 'webm' : 'webm';
  }

  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const root = typeof indexedDB === 'undefined' ? null : indexedDB;
      if (!root) { reject(new Error('unavailable')); return; }
      const req = root.open(DB, 1);
      req.onupgradeneeded = () => { req.result.createObjectStore(STORE, { keyPath: 'id' }); };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    dbp.catch(() => { dbp = null; });
    return dbp;
  }
  function tx(mode, fn) {
    return db().then((d) => new Promise((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result ?? out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error || new Error('aborted'));
    }));
  }

  return {
    CUT_START,
    cutDay,
    weightKg,
    youtubeDraft,
    uploadBody,
    youtubeProblem,
    cleanEntry,
    extFor,
    async put(id, blob, mime) {
      const rec = { id, blob, mime: mime || blob.type || '' };
      await tx('readwrite', (s) => s.put(rec));
      return rec;
    },
    async get(id) {
      const rec = await tx('readonly', (s) => s.get(id));
      return rec || null;
    },
    async remove(id) { await tx('readwrite', (s) => s.delete(id)); },
    async clear() { await tx('readwrite', (s) => s.clear()); },
  };
})();
