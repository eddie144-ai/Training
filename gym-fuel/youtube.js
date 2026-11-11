'use strict';
/* Upload one diary video to Eddie's YouTube channel. Nothing here runs until he taps
   Upload now. The sign-in token stays in memory and is never written onto the app state.
   The scope is youtube.upload only, and only for this feature. Drive keeps drive.file. */
const YouTube = (() => {
  // Same public web client as drive.js. Origin: https://eddie144-ai.github.io. No secret.
  const CLIENT_ID = '225800622965-hsm5f4941gmjs9a0f0pvqnrhhoee9hpj.apps.googleusercontent.com';
  const SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
  const GSI_SRC = 'https://accounts.google.com/gsi/client';
  const START = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

  let token = null; // memory only
  let client = null;
  let waiter = null;
  let gsiP = null;

  function fresh() {
    return !!(token && token.value && token.expires > Date.now() + 60 * 1000);
  }
  function loadGsi() {
    if (window.google?.accounts?.oauth2) return Promise.resolve();
    if (gsiP) return gsiP;
    gsiP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GSI_SRC;
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gsiP = null;
        reject(Object.assign(new Error('gsi'), { problem: { code: 'gsi', text: 'Google’s sign-in didn’t load. Check the connection and try again. Nothing was uploaded.' } }));
      };
      document.head.appendChild(s);
    });
    return gsiP;
  }
  function initClient() {
    if (client) return;
    client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      callback: (resp) => {
        const done = waiter;
        waiter = null;
        if (!done) return;
        if (resp && resp.access_token) {
          token = { value: resp.access_token, expires: Date.now() + (Number(resp.expires_in) || 3600) * 1000 };
          done.resolve(token.value);
        } else done.reject(Object.assign(new Error('no token'), { problem: Diary.youtubeProblem(401, resp) }));
      },
      error_callback: (err) => {
        const done = waiter;
        waiter = null;
        if (!done) return;
        const type = String(err?.type || '');
        const msg = String(err?.message || '');
        let text = 'Google sign-in didn’t finish. Nothing was uploaded.';
        if (type === 'popup_closed' || type === 'user_cancel') text = 'Sign-in was cancelled. Nothing was uploaded.';
        else if (type === 'popup_failed_to_open') text = 'The sign-in window was blocked. Allow popups for this site, then try again.';
        else if (/invalid_scope|access_denied/i.test(`${type} ${msg}`)) text = 'Google refused the YouTube permission. On the consent screen add https://www.googleapis.com/auth/youtube.upload, and add this Gmail as a test user while the app is in Testing.';
        done.reject(Object.assign(new Error(type || 'gsi'), { problem: { code: 'auth', text } }));
      },
    });
  }
  function requestToken() {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!waiter) return;
        waiter = null;
        reject(Object.assign(new Error('timeout'), { problem: { code: 'auth', text: 'Google sign-in didn’t finish. Nothing was uploaded.' } }));
      }, 120000);
      waiter = {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      };
      try { client.requestAccessToken({ prompt: fresh() ? '' : 'consent' }); }
      catch (e) {
        clearTimeout(timer);
        waiter = null;
        reject(Object.assign(e, { problem: { code: 'auth', text: 'Google sign-in didn’t open. Nothing was uploaded.' } }));
      }
    });
  }
  async function signIn() {
    await loadGsi();
    initClient();
    if (fresh()) return token.value;
    return requestToken();
  }

  function readError(res) {
    return res.json().then((body) => body).catch(() => null);
  }
  async function startSession(access, blob, body) {
    const res = await fetch(START, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access}`,
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Type': blob.type || 'video/webm',
        'X-Upload-Content-Length': String(blob.size),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const parsed = await readError(res);
      throw Object.assign(new Error('start'), { status: res.status, body: parsed, problem: Diary.youtubeProblem(res.status, parsed) });
    }
    const location = res.headers.get('Location');
    if (!location) throw Object.assign(new Error('no location'), { problem: { code: 'http', text: 'YouTube didn’t start the upload. Nothing was published.' } });
    return location;
  }
  function putBlob(url, blob, access, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', url);
      xhr.setRequestHeader('Content-Type', blob.type || 'video/webm');
      xhr.setRequestHeader('Authorization', `Bearer ${access}`);
      xhr.upload.onprogress = (ev) => {
        if (ev.lengthComputable && onProgress) onProgress(ev.loaded / ev.total);
      };
      xhr.onload = () => {
        let parsed = null;
        try { parsed = JSON.parse(xhr.responseText); } catch { parsed = null; }
        if (xhr.status >= 200 && xhr.status < 300 && parsed?.id) resolve(parsed);
        else reject(Object.assign(new Error('put'), { status: xhr.status, body: parsed, problem: Diary.youtubeProblem(xhr.status, parsed) }));
      };
      xhr.onerror = () => reject(Object.assign(new Error('network'), { problem: Diary.youtubeProblem(0, null) }));
      xhr.send(blob);
    });
  }

  // Called only from the Upload now button. `privacy` omitted or unknown stays private.
  async function send({ blob, title, description, privacy, onProgress }) {
    if (!blob || !blob.size) throw Object.assign(new Error('empty'), { problem: { code: 'empty', text: 'This clip is empty, so it wasn’t uploaded.' } });
    const body = Diary.uploadBody({ title, description, privacy });
    const access = await signIn();
    if (onProgress) onProgress(0);
    const location = await startSession(access, blob, body);
    const video = await putBlob(location, blob, access, onProgress);
    return { id: String(video.id), url: `https://www.youtube.com/watch?v=${video.id}`, privacy: body.status.privacyStatus };
  }

  return { send, SCOPE };
})();
