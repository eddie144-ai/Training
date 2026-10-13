// AI 90: a 90-day plan for learning Claude, Gemini and Grok and making money with them.
// The plan is in data.js. Progress lives in this browser's localStorage only.
(function () {
'use strict';
const $ = (id) => document.getElementById(id);
const { TOOLS, LANES, PHASES, WEEKS, REVIEW, DAYS } = window.AI90;
const pad = (n) => String(n).padStart(2, '0');
const keyOf = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const fmt = (k, opts) => parseKey(k).toLocaleDateString('en-GB', opts || { weekday: 'short', day: 'numeric', month: 'short' });
const money = (n) => '£' + (Math.round(n * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STAGES = ['found', 'contacted', 'replied', 'talking', 'won', 'lost'];
const BOTS = ['claude', 'gemini', 'grok'];
let today = keyOf(new Date());

/* ---------- storage ---------- */
const LS = 'ai90-v1';
const DEFAULT_META = () => Object.assign({ start: '', lane: 'apps', goal: 1000 }, laneFields('apps'));
function laneFields(id) { const l = LANES[id] || LANES.apps; return { niche: l.niche, audience: l.audience, offer: l.offer, channel: l.channel, price: l.price }; }
let S = { meta: DEFAULT_META(), days: {}, income: [], leads: [] };

function normalise(o) {
  const meta = Object.assign(DEFAULT_META(), (o && o.meta) || {});
  if (!LANES[meta.lane]) meta.lane = 'apps';
  if (meta.start && !/^\d{4}-\d{2}-\d{2}$/.test(meta.start)) meta.start = '';
  meta.goal = Math.max(0, +meta.goal || 0);
  const days = {};
  const src = (o && o.days) || {};
  for (const k of Object.keys(src)) {
    const n = +k;
    if (!Number.isInteger(n) || n < 1 || n > DAYS || !src[k] || typeof src[k] !== 'object') continue;
    days[n] = { done: !!src[k].done, note: String(src[k].note || ''), winner: BOTS.includes(src[k].winner) ? src[k].winner : '' };
  }
  const income = (Array.isArray(o && o.income) ? o.income : []).filter((x) => x && +x.amount > 0 && x.at)
    .map((x) => ({ date: String(x.date || ''), amount: +x.amount, source: String(x.source || ''), at: x.at }));
  const leads = (Array.isArray(o && o.leads) ? o.leads : []).filter((x) => x && x.name && x.at)
    .map((x) => ({ name: String(x.name), where: String(x.where || ''), stage: STAGES.includes(x.stage) ? x.stage : 'found', at: x.at }));
  return { meta, days, income, leads };
}
function lsLoad() { try { const v = localStorage.getItem(LS); if (v) S = normalise(JSON.parse(v)); } catch (e) { /* keep defaults */ } }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { localStorage.setItem(LS, JSON.stringify(S)); setSaved('Saved on this phone'); }
    catch (e) { setSaved('Couldn\'t save. Storage may be full or blocked.'); }
  }, 150);
}
function flush() { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; } try { localStorage.setItem(LS, JSON.stringify(S)); } catch (e) {} }
window.addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
function setSaved(t) { $('saveState').textContent = t; }
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('on'), 1800); }

/* ---------- the plan ---------- */
// Day n of 90 → its week and slot. Slots 0–3 are tasks, 4 the bake-off, 5 ship day, 6 the review.
function dayInfo(n) {
  const w = Math.ceil(n / 7), slot = (n - 1) % 7, week = WEEKS[w - 1];
  const base = { n, w, week, slot };
  if (slot < 4) return Object.assign(base, { kind: 'Task', task: week.tasks[slot] });
  if (slot === 4) return Object.assign(base, { kind: 'Bake-off', task: { t: 'Bake-off: same job, all three', tool: 'all', min: 25, why: 'Give Claude, Gemini and Grok the exact same job and judge them side by side. This is how you learn which one to reach for.', do: ['Paste the prompt into all three', 'Read the answers side by side', 'Pick the winner and write why in your notes'], p: week.bake } });
  if (slot === 5) return Object.assign(base, { kind: n === DAYS ? 'Day 90' : 'Ship day', task: { t: week.ship.t, tool: 'you', min: 60, why: 'This week\'s deliverable. Finished beats perfect.', do: week.ship.do, p: '' } });
  return Object.assign(base, { kind: 'Review', task: { t: 'Week ' + w + ' review', tool: 'you', min: 15, why: 'Fifteen minutes looking back saves hours going the wrong way.', do: [], p: '' } });
}
function phaseOf(w) { return PHASES.find((p) => w >= p.weeks[0] && w <= p.weeks[1]); }
function fill(t) {
  const m = S.meta, lane = LANES[m.lane] || LANES.apps;
  return String(t).replace(/\{(offer|audience|niche|channel|price|lane)\}/g, (_, k) => (k === 'lane' ? lane.name.toLowerCase() : (m[k] || '').trim() || lane[k]));
}
function dayNumber() {
  if (!S.meta.start) return 1;
  return Math.round((parseKey(today) - parseKey(S.meta.start)) / 864e5) + 1;
}
const clampDay = (n) => Math.min(DAYS, Math.max(1, n));
function dateOfDay(n) { return keyOf(addDays(parseKey(S.meta.start || today), n - 1)); }
function rec(n) { return S.days[n] || (S.days[n] = { done: false, note: '', winner: '' }); }
let view = 1;

/* ---------- render: header ---------- */
function renderHeader() {
  const n = dayNumber(), shown = clampDay(n);
  $('dayNum').textContent = shown;
  const done = Object.values(S.days).filter((d) => d.done).length;
  $('progress').style.width = (done / DAYS * 100) + '%';
  const info = dayInfo(shown), ph = phaseOf(info.w);
  $('phaseLine').textContent = ph.name + '. ' + ph.line;
  const b = $('banner');
  if (n < 1) { b.hidden = false; b.textContent = 'Day 1 is ' + fmt(S.meta.start, { weekday: 'long', day: 'numeric', month: 'long' }) + '. Have a look around until then.'; }
  else if (n > DAYS) { b.hidden = false; b.textContent = '90 days done: ' + done + ' of 90 ticked off, ' + money(totalIncome()) + ' earned. Set a new Day 1 in Setup to go again.'; }
  else {
    // Never miss twice: point at the oldest unfinished day from the last three.
    const missed = [n - 1, n - 2].filter((d) => d >= 1 && !(S.days[d] && S.days[d].done));
    b.hidden = !missed.length;
    if (missed.length) b.textContent = (missed.length === 2 ? 'Two days behind. ' : 'Yesterday isn\'t ticked. ') + 'Do today\'s first, then catch up on day ' + Math.min(...missed) + ' if there is time. Never miss twice.';
  }
}

/* ---------- render: today ---------- */
function badge(tool) {
  if (tool === 'all') return BOTS.map((b) => '<span class="badge ' + b + '">' + TOOLS[b].short + '</span>').join('');
  if (tool === 'you') return '<span class="badge you">You</span>';
  return '<span class="badge ' + tool + '">' + TOOLS[tool].short + '</span>';
}
function renderDay() {
  const info = dayInfo(view), t = info.task, r = S.days[view] || {};
  const real = dayNumber();
  $('viewWeek').textContent = 'Week ' + info.w + ' · ' + info.week.theme;
  $('viewDate').textContent = 'Day ' + view + (S.meta.start ? ' · ' + fmt(dateOfDay(view)) : '');
  $('prevDay').disabled = view <= 1; $('nextDay').disabled = view >= DAYS;
  $('backToday').hidden = view === clampDay(real);
  $('kind').textContent = info.kind + (info.kind === 'Task' ? ' ' + (info.slot + 1) + ' of 4' : '');
  $('title').textContent = fill(t.t);
  $('badges').innerHTML = badge(t.tool) + '<span class="badge plain">~' + t.min + ' min</span>';
  $('why').textContent = info.kind === 'Review' ? 'This week\'s goal: ' + info.week.goal : fill(t.why);
  $('steps').innerHTML = t.do.map((s) => '<li>' + esc(fill(s)) + '</li>').join('');
  $('steps').hidden = !t.do.length;
  $('promptWrap').hidden = !t.p;
  $('prompt').textContent = t.p ? fill(t.p) : '';
  $('bakeWrap').hidden = info.slot !== 4;
  $('winner').innerHTML = BOTS.map((b) => '<button class="chip" data-bot="' + b + '" aria-pressed="' + (r.winner === b) + '">' + TOOLS[b].short + '</button>').join('');
  $('review').hidden = info.slot !== 6;
  if (info.slot === 6) {
    const wk = weekMoney(info.w);
    $('review').innerHTML = REVIEW.map((q) => '<li>' + esc(q) + '</li>').join('') +
      '<li class="mono">This week: ' + weekDone(info.w) + '/' + weekLen(info.w) + ' days done, ' + money(wk) + ' in.</li>';
  }
  if (document.activeElement !== $('note')) $('note').value = r.note || '';
  const b = $('doneBtn');
  b.textContent = r.done ? 'Done ✓ (tap to undo)' : 'Mark done';
  b.className = 'btn ' + (r.done ? 'done' : 'primary');
}
const weekLen = (w) => Math.min(DAYS, w * 7) - (w - 1) * 7;
function weekDone(w) { let c = 0; for (let n = (w - 1) * 7 + 1; n <= Math.min(DAYS, w * 7); n++) if (S.days[n] && S.days[n].done) c++; return c; }
function weekMoney(w) {
  if (!S.meta.start) return 0;
  const from = dateOfDay((w - 1) * 7 + 1), to = dateOfDay(w * 7);
  return S.income.filter((x) => x.date >= from && x.date <= to).reduce((a, x) => a + x.amount, 0);
}

/* ---------- render: plan ---------- */
function renderPlan() {
  const wins = { claude: 0, gemini: 0, grok: 0 };
  Object.values(S.days).forEach((d) => { if (d.winner) wins[d.winner]++; });
  $('tally').innerHTML = BOTS.map((b) => '<div><strong class="mono">' + wins[b] + '</strong><span class="badge ' + b + '">' + TOOLS[b].short + '</span></div>').join('');
  const real = dayNumber();
  let html = '';
  PHASES.forEach((p) => {
    html += '<div class="phase"><div class="label">' + esc(p.name) + '</div></div>';
    for (let w = p.weeks[0]; w <= p.weeks[1]; w++) {
      const wk = WEEKS[w - 1];
      let dots = '';
      for (let s = 0; s < 7; s++) {
        const n = (w - 1) * 7 + s + 1; if (n > DAYS) break;
        const cls = ['dot', S.days[n] && S.days[n].done ? 'done' : '', n === real ? 'today' : '', s === 5 ? 'ship' : ''].join(' ');
        dots += '<button class="' + cls + '" data-day="' + n + '" aria-label="Day ' + n + '">' + n + '</button>';
      }
      html += '<div class="week"><div><span class="label">Week ' + w + '</span><div class="t">' + esc(wk.theme) + '</div></div><span class="mono sub">' + weekDone(w) + '/' + weekLen(w) + '</span>' +
        '<div class="g">' + esc(wk.goal) + '</div><div class="dots" style="grid-column:1/-1">' + dots + '</div></div>';
    }
  });
  $('weeks').innerHTML = html;
}

/* ---------- render: tools ---------- */
function renderTools() {
  $('toolCards').innerHTML = BOTS.map((b) => {
    const t = TOOLS[b], li = (a) => a.map((x) => '<li>' + esc(fill(x)) + '</li>').join('');
    return '<div class="card"><div class="row"><h2 style="flex:1">' + t.name + '</h2><span class="badge ' + b + '" style="flex:0 0 auto">' + t.short + '</span></div>' +
      '<div><div class="label">Use it for</div><ul>' + li(t.good) + '</ul></div>' +
      '<div><div class="label">Reach for something else when</div><ul>' + li(t.weak) + '</ul></div>' +
      '<div><div class="label">Power moves</div><ul>' + li(t.moves) + '</ul></div></div>';
  }).join('');
}

/* ---------- render: money ---------- */
function totalIncome() { return S.income.reduce((a, x) => a + x.amount, 0); }
function renderMoney() {
  const tot = totalIncome();
  $('earned').textContent = money(tot);
  $('goalText').textContent = 'of ' + money(S.meta.goal);
  $('goalBar').style.width = (S.meta.goal ? Math.min(100, tot / S.meta.goal * 100) : 0) + '%';
  const inc = S.income.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.at - a.at);
  $('incomeList').innerHTML = inc.length ? inc.map((x) => '<div class="it"><div><strong class="mono">' + money(x.amount) + '</strong> ' + esc(x.source) +
    '<div class="m">' + (x.date ? fmt(x.date) : '') + '</div></div><button class="x" data-del-income="' + x.at + '" aria-label="Delete">×</button></div>').join('')
    : '<p class="empty">Nothing yet. The first £1 is the hardest one.</p>';
  const counts = {}; STAGES.forEach((s) => { counts[s] = 0; }); S.leads.forEach((l) => counts[l.stage]++);
  $('stageCounts').innerHTML = STAGES.map((s) => '<span>' + s + ' <b class="mono">' + counts[s] + '</b></span>').join(' · ');
  const order = (l) => STAGES.indexOf(l.stage);
  const leads = S.leads.slice().sort((a, b) => order(a) - order(b) || b.at - a.at);
  $('leadList').innerHTML = leads.length ? leads.map((l) => '<div class="it"><div>' + esc(l.name) + (l.where ? '<div class="m">' + esc(l.where) + '</div>' : '') + '</div>' +
    '<div class="row" style="flex-wrap:nowrap"><select data-lead="' + l.at + '" aria-label="Stage">' + STAGES.map((s) => '<option' + (s === l.stage ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>' +
    '<button class="x" data-del-lead="' + l.at + '" aria-label="Delete">×</button></div></div>').join('')
    : '<p class="empty">Week 9 has you list 30. You can start sooner.</p>';
}
function summaryText() {
  const tot = totalIncome(), n = clampDay(dayNumber());
  const bySrc = {}; S.income.forEach((x) => { const k = x.source || 'other'; bySrc[k] = (bySrc[k] || 0) + x.amount; });
  const counts = {}; S.leads.forEach((l) => { counts[l.stage] = (counts[l.stage] || 0) + 1; });
  const wins = { claude: 0, gemini: 0, grok: 0 }; Object.values(S.days).forEach((d) => { if (d.winner) wins[d.winner]++; });
  return ['AI 90 summary, day ' + n + ' of 90',
    'Selling: ' + fill('{offer} to {audience} at {price}, via {channel}'),
    'Days done: ' + Object.values(S.days).filter((d) => d.done).length + ' of 90',
    'Earned: ' + money(tot) + ' (goal ' + money(S.meta.goal) + ')',
    ...Object.entries(bySrc).map(([k, v]) => '  ' + k + ': ' + money(v)),
    'Leads: ' + (S.leads.length ? STAGES.filter((s) => counts[s]).map((s) => s + ' ' + counts[s]).join(', ') : 'none yet'),
    'Bake-off wins: Claude ' + wins.claude + ', Gemini ' + wins.gemini + ', Grok ' + wins.grok].join('\n');
}

/* ---------- render: setup ---------- */
function renderSetup() {
  const m = S.meta;
  $('setStart').value = m.start; $('setGoal').value = m.goal;
  $('setLane').innerHTML = Object.entries(LANES).map(([id, l]) => '<option value="' + id + '"' + (id === m.lane ? ' selected' : '') + '>' + esc(l.name) + '</option>').join('');
  ['niche', 'audience', 'offer', 'channel', 'price'].forEach((k) => { const el = $('set' + k[0].toUpperCase() + k.slice(1)); if (document.activeElement !== el) el.value = m[k]; });
}

/* ---------- copy ---------- */
function copy(t, after) {
  const done = () => toast('Copied. Paste it in.');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, () => fallback(t, after));
  else fallback(t, after);
}
function fallback(t, after) { const ta = document.createElement('textarea'); ta.value = t; ta.style.minHeight = '160px'; after.after(ta); ta.select(); toast('Selected. Copy it from the box.'); }

/* ---------- backup ---------- */
function backupJSON() { flush(); return JSON.stringify({ app: 'ai90', v: 1, exported: new Date().toISOString(), meta: S.meta, days: S.days, income: S.income, leads: S.leads }, null, 1); }
function exportBackup() {
  const blob = new Blob([backupJSON()], { type: 'application/json' });
  const name = 'ai90-backup-' + today + '.json';
  const file = typeof File === 'function' ? new File([blob], name, { type: 'application/json' }) : null;
  if (file && navigator.canShare && navigator.canShare({ files: [file] })) { navigator.share({ files: [file], title: 'AI 90 backup' }).catch(() => {}); return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup saved.');
}
// Merge, never wipe: a day on this phone wins unless it is empty; money and leads are matched by timestamp.
function mergeIn(raw) {
  if (!raw || raw.app !== 'ai90') throw new Error('not ours');
  const inc = normalise(raw);
  let added = 0;
  for (const [n, d] of Object.entries(inc.days)) {
    const mine = S.days[n];
    if (!mine || (!mine.done && !mine.note && !mine.winner)) { S.days[n] = d; added++; }
  }
  const byAt = (arr, more) => { const seen = new Set(arr.map((x) => x.at)); more.forEach((x) => { if (!seen.has(x.at)) { arr.push(x); seen.add(x.at); added++; } }); };
  byAt(S.income, inc.income); byAt(S.leads, inc.leads);
  if (!S.meta.start && inc.meta.start) S.meta = inc.meta;
  flush(); renderAll();
  return added;
}
function restoreFrom(text) {
  try { const n = mergeIn(JSON.parse(text)); toast('Restored ' + n + ' entries.'); }
  catch (e) { toast('That doesn\'t look like an AI 90 backup.'); }
}

/* ---------- wiring ---------- */
const TABS = ['today', 'plan', 'tools', 'money', 'setup'];
function showTab(name) {
  TABS.forEach((n) => { $('panel-' + n).hidden = n !== name; $('tab-' + n).setAttribute('aria-selected', n === name ? 'true' : 'false'); });
  try { localStorage.setItem('ai90-tab', name); } catch (e) {}
}
TABS.forEach((n) => { $('tab-' + n).onclick = () => showTab(n); });
function go(n) { view = clampDay(n); renderDay(); }
$('prevDay').onclick = () => go(view - 1);
$('nextDay').onclick = () => go(view + 1);
$('backToday').onclick = () => go(dayNumber());
$('copyPrompt').onclick = () => copy($('prompt').textContent, $('prompt'));
$('note').oninput = (e) => { rec(view).note = e.target.value; save(); };
$('doneBtn').onclick = () => {
  const r = rec(view); r.done = !r.done; save();
  renderDay(); renderHeader(); renderPlan();
  if (r.done) toast(view === DAYS ? 'Day 90. You did it.' : 'Day ' + view + ' done.');
};
$('winner').onclick = (e) => {
  const b = e.target.closest('[data-bot]'); if (!b) return;
  const r = rec(view); r.winner = r.winner === b.dataset.bot ? '' : b.dataset.bot; save(); renderDay(); renderPlan();
};
$('weeks').onclick = (e) => { const b = e.target.closest('[data-day]'); if (!b) return; go(+b.dataset.day); showTab('today'); window.scrollTo(0, 0); };

$('inAdd').onclick = () => {
  const amount = Math.round(parseFloat($('inAmount').value) * 100) / 100;
  if (!(amount > 0)) { toast('Enter an amount.'); return; }
  S.income.push({ date: $('inDate').value || today, amount, source: $('inSource').value.trim(), at: Date.now() });
  $('inAmount').value = ''; $('inSource').value = ''; save(); renderMoney(); renderHeader();
  toast(S.income.length === 1 ? 'First money in. That changes everything.' : 'Logged ' + money(amount) + '.');
};
$('incomeList').onclick = (e) => {
  const b = e.target.closest('[data-del-income]'); if (!b || !confirm('Delete this entry?')) return;
  S.income = S.income.filter((x) => String(x.at) !== b.dataset.delIncome); save(); renderMoney();
};
$('leadAdd').onclick = () => {
  const name = $('leadName').value.trim(); if (!name) { toast('Add a name first.'); return; }
  S.leads.push({ name, where: $('leadWhere').value.trim(), stage: 'found', at: Date.now() });
  $('leadName').value = ''; save(); renderMoney();
};
$('leadName').onkeydown = (e) => { if (e.key === 'Enter') $('leadAdd').click(); };
$('leadList').onchange = (e) => {
  const s = e.target.closest('[data-lead]'); if (!s) return;
  const l = S.leads.find((x) => String(x.at) === s.dataset.lead); if (l) { l.stage = s.value; save(); renderMoney(); }
};
$('leadList').onclick = (e) => {
  const b = e.target.closest('[data-del-lead]'); if (!b || !confirm('Delete this lead?')) return;
  S.leads = S.leads.filter((x) => String(x.at) !== b.dataset.delLead); save(); renderMoney();
};
$('copySummary').onclick = () => copy(summaryText(), $('copySummary'));

$('setStart').onchange = (e) => { if (!e.target.value) { e.target.value = S.meta.start; return; } S.meta.start = e.target.value; save(); view = clampDay(dayNumber()); renderAll(); };
$('setGoal').onchange = (e) => { S.meta.goal = Math.max(0, +e.target.value || 0); save(); renderMoney(); };
$('setLane').onchange = (e) => { S.meta.lane = e.target.value; Object.assign(S.meta, laneFields(S.meta.lane)); save(); renderAll(); toast('Lane set. Every prompt now uses it.'); };
['niche', 'audience', 'offer', 'channel', 'price'].forEach((k) => {
  $('set' + k[0].toUpperCase() + k.slice(1)).oninput = (e) => { S.meta[k] = e.target.value; save(); renderDay(); renderTools(); };
});
$('resetLane').onclick = () => { Object.assign(S.meta, laneFields(S.meta.lane)); save(); renderAll(); };
$('exportBtn').onclick = exportBackup;
$('importBtn').onclick = () => $('importFile').click();
$('importFile').onchange = (e) => { const f = e.target.files && e.target.files[0]; if (!f) return; f.text().then(restoreFrom); e.target.value = ''; };
$('pasteBtn').onclick = () => { const t = $('pasteBox').value.trim(); if (!t) return; restoreFrom(t); $('pasteBox').value = ''; };

function renderAll() {
  if (!$('inDate').value) $('inDate').value = today;
  renderHeader(); renderDay(); renderPlan(); renderTools(); renderMoney(); renderSetup();
}

// An installed app can stay open past midnight: roll over to the new day when it comes back.
function checkRollover() {
  const k = keyOf(new Date()); if (k === today) return;
  const wasOnToday = view === clampDay(dayNumber());
  today = k; $('inDate').value = today;
  if (wasOnToday) view = clampDay(dayNumber());
  renderAll();
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkRollover(); });
setInterval(checkRollover, 60000);

lsLoad();
if (!S.meta.start) { S.meta.start = today; save(); }
view = clampDay(dayNumber());
try { const t = localStorage.getItem('ai90-tab'); if (t && TABS.includes(t)) showTab(t); } catch (e) {}
renderAll(); setSaved('Saved on this phone');

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
window.__ai90 = { state: () => S, restoreFrom, backupJSON, dayInfo, summaryText };
})();
