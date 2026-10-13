// The Floor: six small things a day, four to count. Data lives in this browser's localStorage only.
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmt = (k, opts) => parseKey(k).toLocaleDateString('en-GB', opts || { weekday: 'short', day: 'numeric', month: 'short' });
let today = keyOf(new Date());

const ITEMS = [
  { id: 'light', t: 'Up and outside', d: 'Daylight within an hour of waking. Sets the clock for tonight.' },
  { id: 'walk', t: 'Walk', d: 'Any walk counts. Log the steps.', steps: true },
  { id: 'meal', t: 'One proper meal', d: 'Protein first. Steak and eggs counts.' },
  { id: 'brick', t: 'One brick', d: '', text: true },
  { id: 'girls', t: 'Something for the girls', d: 'A message, a plan for next visit, something to teach them.' },
  { id: 'lights', t: 'Screens off on time', d: '', bed: true },
];

const DEFAULT_META = () => ({ steps: 15000, bed: '23:00', oneProject: '', contacts: [], parked: [], name: '', brickWhat: '' });
const blankDay = () => ({ checks: {}, steps: '', brick: '', mood: 0, pain: 0, sleep: '', did: '' });
let S = { meta: DEFAULT_META(), days: {} };

function day(k) { return S.days[k] || (S.days[k] = blankDay()); }
function score(k) { const d = S.days[k]; if (!d || !d.checks) return 0; return ITEMS.filter((i) => d.checks[i.id]).length; }

/* ---------- storage ---------- */
// Same key the artifact version used, so nothing is lost if the data ever shares an origin.
const LS = 'the-floor-v1';
function normalise(o) {
  const meta = Object.assign(DEFAULT_META(), (o && o.meta) || {});
  if (!Array.isArray(meta.contacts)) meta.contacts = [];
  if (!Array.isArray(meta.parked)) meta.parked = [];
  const days = {};
  const src = (o && o.days) || {};
  for (const k of Object.keys(src)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !src[k] || typeof src[k] !== 'object') continue;
    const d = Object.assign(blankDay(), src[k]);
    delete d.date;
    if (!d.checks || typeof d.checks !== 'object') d.checks = {};
    days[k] = d;
  }
  return { meta, days };
}
let lastRaw = null; // the stored data as this window last read or wrote it, to spot a change made by Daily
function lsLoad() { try { const v = localStorage.getItem(LS); lastRaw = v; if (v) S = normalise(JSON.parse(v)); } catch (e) { /* keep defaults */ } }
function lsWrite() { const v = JSON.stringify(S); localStorage.setItem(LS, v); lastRaw = v; }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { lsWrite(); setSaved('Saved on this phone'); }
    catch (e) { setSaved('Couldn\'t save. Storage may be full or blocked.'); }
  }, 150);
}
function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; try { lsWrite(); } catch (e) {} } }
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
function setSaved(t) { $('saveState').textContent = t; }
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 1800); }

/* ---------- render: today ---------- */
function renderItems() {
  const d = day(today);
  $('items').innerHTML = '';
  ITEMS.forEach((it) => {
    const row = document.createElement('div'); row.className = 'item';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'tick'; b.innerHTML = TICK;
    b.dataset.item = it.id;
    b.setAttribute('aria-pressed', d.checks[it.id] ? 'true' : 'false'); b.setAttribute('aria-label', it.t);
    b.onclick = () => {
      d.checks[it.id] = !d.checks[it.id];
      b.setAttribute('aria-pressed', d.checks[it.id] ? 'true' : 'false');
      renderScore(); save();
      if (score(today) === 4 && d.checks[it.id]) toast('Day counts.');
    };
    const body = document.createElement('div'); body.className = 'body';
    let desc = it.d;
    if (it.bed) desc = 'By ' + S.meta.bed + '. Sleep is the variable that moves the rest.';
    if (it.text) desc = 'One concrete action on ' + (S.meta.brickWhat.trim() || 'money, admin, or the one project') + '.';
    body.innerHTML = '<div class="t"></div><div class="d"></div>';
    body.querySelector('.t').textContent = it.t; body.querySelector('.d').textContent = desc;
    if (it.steps) {
      const inp = document.createElement('input'); inp.type = 'number'; inp.id = 'steps'; inp.min = '0'; inp.step = '100'; inp.inputMode = 'numeric'; inp.placeholder = 'Steps today'; inp.value = d.steps;
      const bar = document.createElement('div'); bar.className = 'bar'; bar.innerHTML = '<i></i>';
      const lab = document.createElement('div'); lab.className = 'label';
      const upd = () => { const n = +inp.value || 0; bar.firstChild.style.width = Math.min(100, n / S.meta.steps * 100) + '%'; lab.textContent = n.toLocaleString('en-GB') + ' of ' + (+S.meta.steps).toLocaleString('en-GB'); };
      inp.oninput = () => {
        d.steps = inp.value;
        if ((+inp.value || 0) > 0 && !d.checks.walk) { d.checks.walk = true; b.setAttribute('aria-pressed', 'true'); renderScore(); }
        upd(); save();
      };
      upd(); body.append(inp, bar, lab);
    }
    if (it.text) {
      const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'brick'; inp.placeholder = 'Name the brick'; inp.value = d.brick;
      inp.oninput = () => { d.brick = inp.value; save(); }; body.append(inp);
    }
    row.append(b, body); $('items').append(row);
  });
}
function renderScore() {
  const s = score(today); $('scoreNum').textContent = s;
  $('scoreWord').textContent = s >= 6 ? 'Full set' : s >= 4 ? 'Day counts' : (4 - s) + ' more and the day counts';
  const strip = $('strip'); strip.innerHTML = ''; let counted = 0;
  for (let i = 13; i >= 0; i--) {
    const k = keyOf(addDays(parseKey(today), -i)); const v = score(k); const sp = document.createElement('span');
    if (v >= 4) { sp.className = 'ok'; counted++; } else if (v > 0) sp.className = 'part';
    if (k === today) sp.classList.add('today');
    sp.title = fmt(k) + ': ' + v + '/6'; strip.append(sp);
  }
  $('stripWord').textContent = counted + ' of the last 14 days counted. Aim for 10.';
}
function renderScale(id, field) {
  const d = day(today), box = $(id); box.innerHTML = '';
  for (let n = 1; n <= 5; n++) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = n; b.setAttribute('aria-pressed', d[field] === n ? 'true' : 'false');
    b.setAttribute('aria-label', field + ' ' + n);
    b.onclick = () => { d[field] = d[field] === n ? 0 : n; renderScale(id, field); renderSupport(); save(); };
    box.append(b);
  }
}
function renderSupport() { const d = day(today); $('support').hidden = !(d.mood && d.mood <= 2); }
function renderRecovery() {
  const t = parseKey(today);
  const y = keyOf(addDays(t, -1)), y2 = keyOf(addDays(t, -2));
  const anyHistory = Object.keys(S.days).some((k) => k < today);
  const el = $('recovery');
  if (!anyHistory) { el.hidden = false; el.innerHTML = '<b>Day one.</b> Six things, four to count. Small on purpose. Your own rule: when a day slips, the next day is just the floor. No making up for it.'; return; }
  if (score(y) < 4) {
    el.hidden = false;
    el.innerHTML = score(y2) < 4
      ? '<b>Two days down.</b> Don\'t plan a comeback. Tick one box in the next ten minutes. Up and outside is the easiest.'
      : '<b>Yesterday slipped.</b> That\'s fine. Today is just the floor. Never miss twice.';
    return;
  }
  el.hidden = true;
}
function renderEvening() {
  const d = day(today); $('sleep').value = d.sleep; $('did').value = d.did;
  $('tomorrowBrick').value = (S.days[keyOf(addDays(parseKey(today), 1))] || {}).brick || '';
}

/* ---------- girls ---------- */
const TYPE_LABEL = { planned: 'Planned', happened: 'Happened', changed: 'Changed', 'cancelled-them': 'Cancelled by them', 'cancelled-me': 'Cancelled by me' };
function renderGirls() {
  const c = S.meta.contacts.slice().sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);
  const list = $('gList'); list.innerHTML = '';
  if (!c.length) list.innerHTML = '<div class="empty">No entries yet. Add the next arranged visit as Planned, then mark what actually happened on the day.</div>';
  c.forEach((e) => {
    const r = document.createElement('div'); r.className = 'entry';
    r.innerHTML = '<div class="mono" style="font-size:13px"></div><div class="note"><span class="pill"></span> <span></span></div><button class="btn ghost small" type="button">Remove</button>';
    r.children[0].textContent = fmt(e.date, { day: '2-digit', month: 'short', year: '2-digit' });
    const p = r.querySelector('.pill'); p.textContent = TYPE_LABEL[e.type] || e.type; p.classList.add(e.type);
    r.querySelector('.note span:last-child').textContent = e.note || '';
    const rm = r.querySelector('button');
    rm.onclick = () => {
      if (rm.dataset.arm) { S.meta.contacts = S.meta.contacts.filter((x) => x.at !== e.at); save(); renderGirls(); renderNext(); }
      else { rm.dataset.arm = 1; rm.textContent = 'Sure?'; setTimeout(() => { rm.dataset.arm = ''; rm.textContent = 'Remove'; }, 3000); }
    };
    list.append(r);
  });
  const since = keyOf(addDays(parseKey(today), -90));
  const recent = S.meta.contacts.filter((e) => e.date >= since && e.date <= today);
  const n = (t) => recent.filter((e) => e.type === t).length;
  $('gStats').textContent = 'Last 90 days: ' + n('happened') + ' happened · ' + n('cancelled-them') + ' cancelled by them · ' + n('cancelled-me') + ' cancelled by me';
}
function renderNext() {
  const fut = S.meta.contacts.filter((e) => e.type === 'planned' && e.date >= today).sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!fut) { $('nextGirls').textContent = 'Nothing booked'; return; }
  const days = Math.round((parseKey(fut.date) - parseKey(today)) / 864e5);
  $('nextGirls').textContent = fmt(fut.date, { weekday: 'long', day: 'numeric', month: 'short' }) + ' · ' + (days === 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days');
}
function girlsText() {
  const who = S.meta.name.trim();
  return 'Contact record' + (who ? ', ' + who : '') + ' (generated ' + fmt(today, { day: 'numeric', month: 'long', year: 'numeric' }) + ')\n\n' +
    S.meta.contacts.slice().sort((a, b) => a.date.localeCompare(b.date) || a.at - b.at).map((e) =>
      fmt(e.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ' | ' + (TYPE_LABEL[e.type] || e.type) + (e.note ? ' | ' + e.note : '') +
      ' | logged ' + new Date(e.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })).join('\n');
}

/* ---------- parked ---------- */
function renderParked() {
  $('oneProject').value = S.meta.oneProject || '';
  const list = $('pList'); list.innerHTML = '';
  const ps = S.meta.parked.slice().sort((a, b) => a.at - b.at);
  if (!ps.length) list.innerHTML = '<div class="empty">Empty. Next time a shiny idea turns up, it goes here instead of into your afternoon.</div>';
  ps.forEach((p) => {
    const unlock = keyOf(addDays(new Date(p.at), 7)); const ready = today >= unlock;
    const r = document.createElement('div'); r.className = 'entry';
    r.innerHTML = '<span class="pill"></span><div class="note"><div></div><div class="label"></div></div><div class="row" style="flex-wrap:nowrap;gap:6px"></div>';
    const pill = r.querySelector('.pill'); pill.textContent = ready ? 'Decide' : 'Locked'; pill.classList.add(ready ? 'ready' : 'locked');
    r.querySelector('.note div').textContent = p.text;
    r.querySelector('.note .label').textContent = ready ? 'Parked ' + fmt(keyOf(new Date(p.at))) + '. Still want it?' : 'Opens ' + fmt(unlock);
    const acts = r.querySelector('.row');
    const kill = document.createElement('button'); kill.className = 'btn ghost small'; kill.type = 'button'; kill.textContent = 'Drop';
    kill.onclick = () => { S.meta.parked = S.meta.parked.filter((x) => x.at !== p.at); save(); renderParked(); toast('Dropped. One less thing.'); };
    acts.append(kill);
    if (ready) {
      const sw = document.createElement('button'); sw.className = 'btn small'; sw.type = 'button'; sw.textContent = 'Make it the one';
      sw.onclick = () => {
        if (sw.dataset.arm) {
          const old = S.meta.oneProject; S.meta.oneProject = p.text; S.meta.parked = S.meta.parked.filter((x) => x.at !== p.at);
          if (old) S.meta.parked.push({ text: old, at: Date.now() });
          save(); renderParked(); toast(old ? 'Swapped. The old one is parked.' : 'Set as the one project.');
        } else { sw.dataset.arm = 1; sw.textContent = S.meta.oneProject ? 'Replace current?' : 'Confirm'; setTimeout(() => { sw.dataset.arm = ''; sw.textContent = 'Make it the one'; }, 3000); }
      };
      acts.append(sw);
    }
    list.append(r);
  });
}

/* ---------- backup ---------- */
function backupJSON() { return JSON.stringify({ app: 'the-floor', v: 1, exported: new Date().toISOString(), meta: S.meta, days: S.days }, null, 1); }
function exportBackup() {
  flush();
  const blob = new Blob([backupJSON()], { type: 'application/json' });
  const name = 'the-floor-backup-' + today + '.json';
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) {
    navigator.share({ files: [file], title: 'The Floor backup' }).catch(() => {});
    return;
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup saved.');
}
// Merge, never wipe: entries are matched by their timestamp, and a day already on this phone wins
// unless it is empty.
function mergeIn(raw) {
  const inc = normalise(raw);
  const hasDays = Object.keys(inc.days).length, hasMeta = inc.meta.contacts.length || inc.meta.parked.length || inc.meta.oneProject;
  if (!hasDays && !hasMeta) throw new Error('empty');
  const isEmptyDay = (d) => !d || (!Object.values(d.checks || {}).some(Boolean) && !d.steps && !d.brick && !d.mood && !d.pain && !d.sleep && !d.did);
  let addedDays = 0;
  for (const [k, d] of Object.entries(inc.days)) { if (isEmptyDay(S.days[k])) { S.days[k] = d; addedDays++; } }
  const byAt = (arr, more) => { const seen = new Set(arr.map((x) => x.at)); more.forEach((x) => { if (x && x.at && !seen.has(x.at)) { arr.push(x); seen.add(x.at); } }); };
  const before = S.meta.contacts.length + S.meta.parked.length;
  byAt(S.meta.contacts, inc.meta.contacts.filter((e) => e.date && e.type));
  byAt(S.meta.parked, inc.meta.parked.filter((p) => p.text));
  const addedEntries = S.meta.contacts.length + S.meta.parked.length - before;
  if (!S.meta.oneProject && inc.meta.oneProject) S.meta.oneProject = inc.meta.oneProject;
  if (!S.meta.name && inc.meta.name) S.meta.name = inc.meta.name;
  flush(); try { lsWrite(); } catch (e) {}
  renderAll();
  return { addedDays, addedEntries };
}
function restoreFrom(text) {
  try {
    const r = mergeIn(JSON.parse(text));
    toast('Restored ' + r.addedDays + ' days and ' + r.addedEntries + ' entries.');
  } catch (e) { toast('That doesn\'t look like a Floor backup.'); }
}

/* ---------- wiring ---------- */
function showTab(name) {
  ['today', 'girls', 'parked'].forEach((n) => { $('panel-' + n).hidden = n !== name; $('tab-' + n).setAttribute('aria-selected', n === name ? 'true' : 'false'); });
  try { localStorage.setItem('the-floor-tab', name); } catch (e) {}
}
['today', 'girls', 'parked'].forEach((n) => { $('tab-' + n).onclick = () => showTab(n); });
$('goGirls').onclick = () => showTab('girls');
$('sleep').oninput = (e) => { day(today).sleep = e.target.value; save(); };
$('did').oninput = (e) => { day(today).did = e.target.value; save(); };
$('tomorrowBrick').oninput = (e) => { day(keyOf(addDays(parseKey(today), 1))).brick = e.target.value; save(); };
$('gAdd').onclick = () => {
  const date = $('gDate').value; if (!date) { toast('Pick a date first.'); return; }
  S.meta.contacts.push({ date, type: $('gType').value, note: $('gNote').value.trim(), at: Date.now() });
  $('gNote').value = ''; save(); renderGirls(); renderNext(); toast('Added to the record.');
};
$('gCopy').onclick = () => {
  const t = girlsText();
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(() => toast('Copied.'), () => fallback(t));
  else fallback(t);
};
function fallback(t) { const ta = document.createElement('textarea'); ta.value = t; ta.style.minHeight = '200px'; $('gList').before(ta); ta.select(); toast('Selected. Copy it from the box.'); }
$('pAdd').onclick = () => { const t = $('pText').value.trim(); if (!t) return; S.meta.parked.push({ text: t, at: Date.now() }); $('pText').value = ''; save(); renderParked(); toast('Parked for 7 days.'); };
$('pText').onkeydown = (e) => { if (e.key === 'Enter') $('pAdd').click(); };
$('oneProject').oninput = (e) => { S.meta.oneProject = e.target.value; save(); };
$('setSteps').onchange = (e) => { S.meta.steps = Math.max(1000, +e.target.value || 15000); save(); renderItems(); };
$('setBed').onchange = (e) => { S.meta.bed = e.target.value || '23:00'; save(); renderItems(); };
$('setName').oninput = (e) => { S.meta.name = e.target.value; save(); };
$('setBrick').onchange = (e) => { S.meta.brickWhat = e.target.value; save(); renderItems(); };
$('exportBtn').onclick = exportBackup;
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; f.text().then(restoreFrom); e.target.value = ''; };
$('pasteBtn').onclick = () => { const t = $('pasteBox').value.trim(); if (!t) return; restoreFrom(t); $('pasteBox').value = ''; };

function renderAll() {
  $('dow').textContent = parseKey(today).toLocaleDateString('en-GB', { weekday: 'long' });
  $('date').textContent = parseKey(today).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  $('setSteps').value = S.meta.steps; $('setBed').value = S.meta.bed; $('setName').value = S.meta.name; $('setBrick').value = S.meta.brickWhat;
  if (!$('gDate').value) $('gDate').value = today;
  renderItems(); renderScore(); renderScale('mood', 'mood'); renderScale('pain', 'pain'); renderSupport(); renderRecovery(); renderEvening(); renderGirls(); renderNext(); renderParked();
}

// An installed app can stay open past midnight: roll over to the new day when it comes back.
function checkRollover() { const k = keyOf(new Date()); if (k !== today) { today = k; $('gDate').value = today; renderAll(); } }
// Daily (daily/) ticks boxes in this data while this app may be open in the background: pick that up
// before anything is saved over it. Changes still waiting to be saved here stay and win.
function reloadIfChanged() {
  let v; try { v = localStorage.getItem(LS); } catch (e) { return false; }
  if (saveTimer || !v || v === lastRaw) return false;
  lsLoad(); renderAll(); return true;
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { reloadIfChanged(); checkRollover(); } });
window.addEventListener('storage', (e) => { if (e.key === LS) reloadIfChanged(); });
setInterval(checkRollover, 60000);

lsLoad();
try { const t = localStorage.getItem('the-floor-tab'); if (t && $('panel-' + t)) showTab(t); } catch (e) {}
renderAll(); setSaved('Saved on this phone');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.__floor = { state: () => S, restoreFrom, backupJSON };
})();
