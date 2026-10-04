'use strict';
/* Coach: the therapist/coach side of Council.
   - Talk: an AI coach (Claude or Gemini, with your own key, called straight from the phone) in five modes.
     With no key it still works: Copy for Claude puts the whole session on the clipboard for claude.ai.
   - Interviews: structured, offline question sets (intake, PHQ-9, GAD-7, GROW, change talk, slip analysis,
     life story, values), saved on the phone and one tap from a reflection with the coach.
   - Self-Authoring: Past, Present (faults and virtues) and Future, in the suite's structure.
   - Prompts: the prompt library from Drive.
   Loaded before app.js; uses its globals (S, ui, save, commit, render, esc, seg, why, toast, copyText, addCommit, aiBriefing). */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------
function coachFresh() {
  return {
    share: true,
    chats: [],      // { id, mode, title, started, ended, messages: [{ role: 'user'|'assistant', text, at }], summary, action }
    runs: [],       // interview runs: { id, iid, date, at, answers: [], done, score }
    author: { past: [], faults: [], virtues: [], future: { oneyear: '', ideal: {}, avoid: '', goals: [] } },
  };
}
function coachNormalise(c) {
  const d = coachFresh();
  if (!c || typeof c !== 'object') return d;
  const a = c.author && typeof c.author === 'object' ? c.author : {};
  return {
    share: c.share !== false,
    chats: Array.isArray(c.chats) ? c.chats : [],
    runs: Array.isArray(c.runs) ? c.runs : [],
    author: {
      past: Array.isArray(a.past) ? a.past : [],
      faults: Array.isArray(a.faults) ? a.faults : [],
      virtues: Array.isArray(a.virtues) ? a.virtues : [],
      future: { ...d.author.future, ...(a.future && typeof a.future === 'object' ? a.future : {}) },
    },
  };
}
const C = () => (S.coach = S.coach && S.coach.author ? S.coach : coachNormalise(S.coach));
const cui = () => (ui.coach ||= { mode: 'talk', chatId: null, run: null, author: 'past', open: null, busy: false });

// ---------------------------------------------------------------------------
// AI engines. Keys are shared with Deliberation Council (same site, same storage keys) and stay on the phone.
// ---------------------------------------------------------------------------
const AI_KEYS = { claude: 'anthropic_api_key', gemini: 'gemini_api_key', provider: 'council.provider', geminiModel: 'council.geminiModel' };
const CLAUDE_MODEL = 'claude-opus-5-5';
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { if (v) localStorage.setItem(k, v); else localStorage.removeItem(k); } catch { /* blocked */ } };
function aiConfig() {
  const claude = lsGet(AI_KEYS.claude), gemini = lsGet(AI_KEYS.gemini);
  let provider = lsGet(AI_KEYS.provider);
  if (provider !== 'claude' && provider !== 'gemini') provider = claude ? 'claude' : 'gemini';
  const key = provider === 'claude' ? claude : gemini;
  return { provider, key, claude, gemini, geminiModel: lsGet(AI_KEYS.geminiModel) || 'gemini-3.8-flash', ready: !!key };
}
const engineName = (cfg) => (cfg.provider === 'claude' ? 'Claude Opus 5.5' : `Gemini (${cfg.geminiModel})`);

// Streams the reply into onText; resolves with the full text.
async function callClaude(key, system, messages, onText, signal) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      'anthropic-beta': 'server-side-fallback-2026-07-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: CLAUDE_MODEL, max_tokens: 16000, stream: true, system, messages,
      thinking: { type: 'adaptive' }, output_config: { effort: 'medium' }, fallbacks: 'default',
    }),
  });
  if (!res.ok) {
    let msg = ''; try { msg = (await res.json()).error?.message || ''; } catch { /* not JSON */ }
    if (res.status === 401) throw new Error('Claude rejected the key. Check it in Coach settings.');
    if (res.status === 429) throw new Error('Claude rate limit. Wait a minute and try again.');
    throw new Error(`Claude error ${res.status}${msg ? `: ${msg}` : ''}`);
  }
  let full = '', stop = null, buf = '';
  const reader = res.body.getReader(), dec = new TextDecoder();
  const handle = (ev) => {
    const data = ev.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
    if (!data) return;
    let j; try { j = JSON.parse(data); } catch { return; }
    if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') { full += j.delta.text; onText(full); }
    else if (j.type === 'message_delta') stop = j.delta?.stop_reason || stop;
    else if (j.type === 'error') throw new Error(j.error?.message || 'Claude stream error');
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true }).replace(/\r\n/g, '\n');
    let cut;
    while ((cut = buf.indexOf('\n\n')) !== -1) { handle(buf.slice(0, cut)); buf = buf.slice(cut + 2); }
  }
  if (buf.trim()) handle(buf);
  if (stop === 'refusal' && !full) throw new Error('Claude declined to answer this one. Try rephrasing.');
  if (stop === 'max_tokens') full += '\n\n(cut off)';
  return full.trim();
}
async function callGemini(key, model, system, messages, onText, signal) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });
  if (!res.ok) {
    let msg = ''; try { msg = (await res.json()).error?.message || ''; } catch { /* not JSON */ }
    if (res.status === 429) throw new Error('Gemini free-tier limit. Wait a minute and try again.');
    throw new Error(`Gemini error ${res.status}${msg ? `: ${msg}` : ''}`);
  }
  const j = await res.json();
  const text = (j.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim();
  if (!text) throw new Error('Gemini returned nothing. Try again.');
  onText(text);
  return text;
}
function callAI(system, messages, onText, signal) {
  const cfg = aiConfig();
  if (!cfg.ready) return Promise.reject(new Error('No AI key yet. Add one in Coach settings, or use Copy for Claude.'));
  return cfg.provider === 'claude' ? callClaude(cfg.key, system, messages, onText, signal) : callGemini(cfg.key, cfg.geminiModel, system, messages, onText, signal);
}

// ---------------------------------------------------------------------------
// What the coach knows: the Council briefing, Self-Authoring and recent interviews.
// ---------------------------------------------------------------------------
const clip = (s, n) => (String(s || '').length > n ? `${String(s).slice(0, n)}…` : String(s || ''));
function authoringSummary() {
  const a = C().author;
  const out = [];
  if (a.faults.length) {
    out.push('Faults he chose (Self-Authoring, Present):');
    for (const f of a.faults) {
      out.push(`- [${f.domain || 'other'}] ${f.text}`);
      const an = f.analysis || {};
      if (an.experience || an.alternative || an.guidelines) out.push(`  His analysis. Experience: ${clip(an.experience, 500)} | Better outcome: ${clip(an.alternative, 300)} | His guidelines: ${clip(an.guidelines, 400)}`);
    }
  }
  if (a.virtues.length) out.push('Virtues:', ...a.virtues.map((v) => `- ${v.text}${v.analysis?.more ? `: ${clip(v.analysis.more, 200)}` : ''}`));
  if (a.past.length) out.push('Past (key experiences):', ...a.past.map((p) => `- ${p.epoch}: ${p.title}. ${clip(p.learn || p.shaped || p.what, 250)}`));
  const fu = a.future;
  if (fu.oneyear) out.push(`One-year vision: ${clip(fu.oneyear, 500)}`);
  const ideal = Object.entries(fu.ideal || {}).filter(([, v]) => v);
  if (ideal.length) out.push('Ideal future:', ...ideal.map(([k, v]) => `- ${(FUTURE_AREAS.find(([x]) => x === k) || [k, k])[1]}: ${clip(v, 250)}`));
  if (fu.avoid) out.push(`Future to avoid: ${clip(fu.avoid, 400)}`);
  if (fu.goals?.length) out.push('Future goals:', ...fu.goals.map((g) => `- ${g.what}${g.why ? ` (why: ${clip(g.why, 150)})` : ''}${g.measure ? ` [measure: ${clip(g.measure, 100)}]` : ''}`));
  return out.join('\n');
}
function interviewSummary() {
  const lines = [];
  for (const iv of INTERVIEWS) {
    const r = [...C().runs].filter((x) => x.iid === iv.id && x.done).sort((a, b) => b.at.localeCompare(a.at))[0];
    if (!r) continue;
    if (iv.score) lines.push(`- ${iv.name} on ${r.date}: ${r.score} (${band(iv.score, r.score)})`);
    else lines.push(`- ${iv.name} on ${r.date}: ${iv.qs.map(([q], i) => (r.answers[i] != null && r.answers[i] !== '' ? `${q} → ${clip(r.answers[i], 200)}` : '')).filter(Boolean).join(' | ')}`);
  }
  return lines.join('\n');
}
function coachSystem(modeId) {
  const mode = COACH_MODES.find((m) => m.id === modeId) || COACH_MODES[0];
  let s = `${COACH_BASE}\n\n${mode.prompt}\n\nToday is ${fmtDate(today())}.`;
  if (C().share) {
    const brief = aiBriefing().replace(/\nMy question:\s*$/, '').trim();
    const auth = authoringSummary(), ivs = interviewSummary();
    s += `\n\n--- His Council data ---\n${brief}`;
    if (auth) s += `\n\n--- His Self-Authoring ---\n${auth}`;
    if (ivs) s += `\n\n--- His recent interviews ---\n${ivs}`;
  }
  return s;
}

// ---------------------------------------------------------------------------
// Talk
// ---------------------------------------------------------------------------
const chatById = (id) => C().chats.find((c) => c.id === id);
const crisisIn = (msgs) => msgs.some((m) => m.role === 'user' && CRISIS_WORDS.test(m.text));
const crisisCard = () => `<div class="verdict bad" role="alert"><b>You don't have to handle this alone.</b><span class="small">${esc(CRISIS_TEXT)}</span><div class="btns"><a class="btn" href="tel:116123">Call Samaritans</a><a class="btn" href="tel:111">Call 111</a></div></div>`;
const fmtMsg = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,3} (.+)$/gm, '<b>$1</b>').replace(/\n/g, '<br>');

function startChat(modeId, first) {
  const mode = COACH_MODES.find((m) => m.id === modeId) || COACH_MODES[0];
  const chat = { id: uid(), mode: mode.id, title: first ? clip(first, 50) : mode.name, started: new Date().toISOString(), messages: [] };
  C().chats.push(chat);
  cui().chatId = chat.id;
  save();
  if (first) sendChat(first); else render();
}

function sendChat(text) {
  const chat = chatById(cui().chatId);
  text = (text || '').trim();
  if (!chat || !text || cui().busy) return;
  chat.messages.push({ role: 'user', text, at: new Date().toISOString() });
  if (chat.messages.length === 1) chat.title = clip(text, 50);
  ui.coachDraft = '';
  save();
  if (!aiConfig().ready) { render(); return; }
  replyTo(chat);
}

function replyTo(chat, extra) {
  const msgs = chat.messages.map((m) => ({ role: m.role, content: m.text }));
  if (extra) msgs.push({ role: 'user', content: extra });
  const live = { role: 'assistant', text: '', at: new Date().toISOString(), live: true };
  if (!extra) chat.messages.push(live);
  cui().busy = true; cui().error = null;
  render();
  const ctrl = new AbortController(); cui().abort = ctrl;
  return callAI(coachSystem(chat.mode), msgs, (t) => {
    if (extra) return;
    live.text = t;
    const el = document.getElementById('live-msg');
    if (el) { el.innerHTML = fmtMsg(t); el.scrollIntoView({ block: 'end' }); }
  }, ctrl.signal).then((full) => {
    if (extra) return full;
    live.text = full; delete live.live;
    return full;
  }).catch((err) => {
    if (!extra) chat.messages = chat.messages.filter((m) => m !== live);
    cui().error = ctrl.signal.aborted ? null : err.message;
    return null;
  }).finally(() => { cui().busy = false; cui().abort = null; save(); render(); });
}

function endChat() {
  const chat = chatById(cui().chatId);
  if (!chat) return;
  if (!aiConfig().ready || !chat.messages.some((m) => m.role === 'assistant')) { chat.ended = new Date().toISOString(); cui().chatId = null; commit(); return; }
  replyTo(chat, 'We are finishing. Summarise this session in 3 lines, then give exactly these three lines:\nDECISION: ...\nACTION: (one concrete thing)\nWHEN: today, tomorrow or this week').then((txt) => {
    if (!txt) return;
    chat.summary = txt;
    chat.action = (txt.match(/ACTION:\s*(.+)/i) || [])[1]?.trim() || '';
    const when = ((txt.match(/WHEN:\s*(.+)/i) || [])[1] || '').toLowerCase();
    chat.when = when.includes('tomorrow') ? 'tomorrow' : when.includes('week') ? 'week' : 'today';
    chat.ended = new Date().toISOString();
    commit();
  });
}

function chatTranscript(chat) {
  const mode = COACH_MODES.find((m) => m.id === chat.mode);
  return `${coachSystem(chat.mode)}\n\n--- Conversation so far (${mode?.name}) ---\n${chat.messages.map((m) => `${m.role === 'user' ? 'Me' : 'Coach'}: ${m.text}`).join('\n\n')}\n\nContinue as my coach.`;
}

function renderTalk() {
  const u = cui(), cfg = aiConfig();
  const chat = u.chatId ? chatById(u.chatId) : null;
  if (chat && !chat.ended) {
    const mode = COACH_MODES.find((m) => m.id === chat.mode) || COACH_MODES[0];
    return `<section class="card focus">
      <div class="row between"><h2>${esc(mode.name)}</h2><button class="small-btn ghost" data-act="co-leave">Back</button></div>
      ${crisisIn(chat.messages) ? crisisCard() : ''}
      <div class="chat">${chat.messages.length ? chat.messages.map((m) => `<div class="msg ${m.role}"${m.live ? ' id="live-msg"' : ''}>${m.live && !m.text ? '<span class="muted">Thinking…</span>' : fmtMsg(m.text)}</div>`).join('') : `<p class="small muted">${esc(mode.tag)}. Say what's on your mind, or say "start".</p>`}</div>
      ${u.error ? `<p class="small danger">${esc(u.error)}</p>` : ''}
      ${cfg.ready ? '' : '<p class="small warn-text">No AI key on this phone, so the coach can\'t reply here. Tap <b>Copy for Claude</b> and paste into the Claude app, or add a key in Coach settings below.</p>'}
      <label class="field"><span class="sr">Message</span><textarea id="co-input" data-co="draft" rows="3" placeholder="Type, or use the keyboard's microphone">${esc(ui.coachDraft || '')}</textarea></label>
      <div class="btns">
        ${u.busy ? '<button data-act="co-stop">Stop</button>' : `<button class="primary" data-act="co-send">${cfg.ready ? 'Send' : 'Save message'}</button>`}
        <button data-act="co-copy">Copy for Claude</button>
      </div>
      <button class="small-btn" data-act="co-end" ${u.busy ? 'disabled' : ''}>End session: decision and action</button>
    </section>`;
  }
  const done = chat && chat.ended ? chat : null;
  const past = [...C().chats].filter((c) => c.messages.length).sort((a, b) => b.started.localeCompare(a.started)).slice(0, 15);
  return `${done && done.summary ? `<section class="card focus"><h2>Session closed</h2><div class="pre small">${fmtMsg(done.summary)}</div>
      ${done.action && !done.committed ? `<button class="primary" data-act="co-commit" data-id="${done.id}">Add to commitments: ${esc(clip(done.action, 60))}</button>` : done.committed ? '<p class="small good-text">✓ Added to your commitments.</p>' : ''}
      <button class="small-btn ghost" data-act="co-dismiss">Done</button></section>` : ''}
    <section class="card"><h2>Talk it through</h2>
      <p class="small">A coach that knows your profile, your Self-Authoring and the last two weeks of Council. One question at a time; every session ends with a decision and an action.</p>
      <div class="modes">${COACH_MODES.map((m) => `<button class="modecard" data-act="co-start" data-v="${m.id}"><b>${esc(m.name)}</b><span class="small muted">${esc(m.tag)}</span></button>`).join('')}</div>
      ${why('Talking to a coach that remembers your own words beats starting from scratch each time. You can still paste anything into the Claude app with Copy for Claude.')}
    </section>
    ${past.length ? `<section class="card"><h2>Past sessions</h2><div class="list">${past.map((c) => `<div class="row between"><button class="linkish grow" data-act="co-open" data-id="${c.id}" style="text-align:left;background:transparent;border:0;padding:6px 0;font-weight:400"><b>${esc((COACH_MODES.find((m) => m.id === c.mode) || {}).name || 'Session')}</b>: ${esc(c.title)}<br><span class="small muted">${esc(fmtShort(c.started.slice(0, 10)))} · ${c.messages.length} messages${c.ended ? ' · closed' : ''}</span></button><button class="icon ghost" data-act="co-del" data-id="${c.id}" aria-label="Delete session">✕</button></div>`).join('')}</div></section>` : ''}
    ${renderCoachSettings(cfg)}`;
}

function renderCoachSettings(cfg) {
  return `<section class="card"><details ${cfg.ready ? '' : 'open'}><summary><b>Coach settings</b> <span class="small muted">· ${cfg.ready ? `using ${esc(engineName(cfg))}` : 'no AI key yet'}</span></summary>
    <div class="row between"><span>Engine</span>${seg([['claude', 'Claude'], ['gemini', 'Gemini (free)']], cfg.provider, 'co-engine')}</div>
    ${cfg.provider === 'claude'
      ? `<label class="field">Claude API key <span class="small muted">console.anthropic.com → API keys. Set a monthly spend limit.</span><input type="password" autocomplete="off" data-co="key-claude" value="${cfg.claude ? '••••••••' : ''}" placeholder="sk-ant-…"></label>`
      : `<label class="field">Gemini API key <span class="small muted">aistudio.google.com/apikey. Free tier: a few requests a minute; Google may use free-tier prompts for training.</span><input type="password" autocomplete="off" data-co="key-gemini" value="${cfg.gemini ? '••••••••' : ''}" placeholder="AIza…"></label>
         <label class="field">Gemini model<input data-co="gemini-model" value="${esc(cfg.geminiModel)}"></label>`}
    <div class="row between"><span>Share my Council data with the coach</span>${seg([['on', 'On'], ['off', 'Off']], C().share ? 'on' : 'off', 'co-share')}</div>
    <p class="small muted">Keys and sessions stay on this phone (shared with Deliberation Council on this site, never in backups). When you send a message, it goes straight from the phone to ${esc(cfg.provider === 'claude' ? 'Anthropic' : 'Google')} with your key${C().share ? ', with your profile, Self-Authoring, interviews and last 14 days' : ''}. ${cfg.claude || cfg.gemini ? '<button class="linkish inline small" data-act="co-forget">Remove saved keys</button>' : ''}</p>
  </details></section>`;
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------
const band = (kind, score) => { let b = ''; for (const [min, name] of SCREEN_BANDS[kind]) if (score >= min) b = name; return b; };
const runScore = (iv, r) => (iv.score ? r.answers.reduce((a, v) => a + (Number(v) || 0), 0) : null);
const riskIn = (iv, r) => (iv.id === 'intake' && /often|plan/i.test(r.answers[iv.qs.length - 1] || '')) || (iv.id === 'phq9' && Number(r.answers[8]) > 0) || r.answers.some((a) => typeof a === 'string' && CRISIS_WORDS.test(a));

function renderInterviews() {
  const u = cui();
  const run = u.run ? C().runs.find((r) => r.id === u.run) : null;
  if (run) {
    const iv = INTERVIEWS.find((x) => x.id === run.iid);
    if (run.done) {
      const sc = run.score;
      return `<section class="card focus"><div class="row between"><h2>${esc(iv.name)}</h2><button class="small-btn ghost" data-act="iv-close">Back</button></div>
        <p class="small muted">${esc(fmtDate(run.date))}</p>
        ${riskIn(iv, run) ? crisisCard() : ''}
        ${iv.score ? `<div class="verdict ${sc >= 10 ? 'bad' : sc >= 5 ? 'warn' : 'good'}"><b>${sc} · ${esc(band(iv.score, sc))}</b><span class="small">${sc >= 10 ? 'A score of 10 or more is worth taking to your GP. It is a screen, not a diagnosis, and it is treatable.' : 'Re-check in two weeks; the trend matters more than one score.'}</span></div>` : ''}
        <div class="list">${iv.qs.map(([q, type], i) => `<div><span class="small muted">${esc(q)}</span><br>${type === 'phq' ? esc(FREQ[Number(run.answers[i])]?.[1] ?? '—') : esc(run.answers[i] ?? '—')}</div>`).join('')}</div>
        <div class="btns"><button class="primary" data-act="iv-reflect">Reflect on this with the coach</button><button data-act="iv-copy">Copy</button></div>
        <button class="small-btn ghost danger" data-act="iv-del">Delete this interview</button></section>`;
    }
    const i = run.i || 0, [q, type, opts] = iv.qs[i];
    const val = run.answers[i];
    let input;
    if (type === 'phq') input = `<div class="list">${FREQ.map(([v, l]) => `<button class="opt" data-act="iv-pick" data-v="${v}" aria-pressed="${String(val) === String(v)}">${esc(l)}</button>`).join('')}</div>`;
    else if (type === 'scale') input = `<div class="scale">${Array.from({ length: 11 }, (_, n) => `<button data-act="iv-pick" data-v="${n}" aria-pressed="${String(val) === String(n)}">${n}</button>`).join('')}</div>`;
    else if (type === 'choice') input = `<div class="list">${opts.map((o) => `<button class="opt" data-act="iv-pick" data-v="${esc(o)}" aria-pressed="${val === o}">${esc(o)}</button>`).join('')}</div>`;
    else input = `<textarea data-co="iv-answer" rows="5" placeholder="A sentence or two is enough">${esc(val || '')}</textarea>`;
    return `<section class="card focus"><div class="row between"><h2>${esc(iv.name)}</h2><span class="small muted">${i + 1} / ${iv.qs.length}</span></div>
      ${bar((i + 1) / iv.qs.length)}
      ${i === 0 ? `<p class="small muted">${esc(iv.intro)}</p>` : ''}
      <p><b>${esc(q)}</b></p>${input}
      ${(type === 'choice' && /plan|often/i.test(val || '')) || (iv.id === 'phq9' && i === 8 && Number(val) > 0) || (typeof val === 'string' && CRISIS_WORDS.test(val)) ? crisisCard() : ''}
      <div class="btns"><button data-act="iv-prev" ${i === 0 ? 'disabled' : ''}>Back</button><button class="primary" data-act="iv-next">${i === iv.qs.length - 1 ? 'Finish' : 'Next'}</button></div>
      <button class="small-btn ghost" data-act="iv-close">Save and leave</button></section>`;
  }
  const runs = [...C().runs].sort((a, b) => b.at.localeCompare(a.at));
  return `<section class="card"><h2>Interviews</h2>
      <p class="small">Structured question sets used by psychiatrists, psychologists and coaches. Work offline, saved on the phone. Afterwards, reflect on your answers with the coach.</p>
      <div class="list">${INTERVIEWS.map((iv) => { const last = runs.find((r) => r.iid === iv.id && r.done); const open = runs.find((r) => r.iid === iv.id && !r.done);
        return `<button class="modecard" data-act="iv-start" data-v="${iv.id}"><b>${esc(iv.name)}</b><span class="small muted">${esc(iv.tag)} · ${iv.mins} min${open ? ' · in progress' : last ? ` · last ${esc(fmtShort(last.date))}${iv.score ? ` (${last.score})` : ''}` : ''}</span></button>`; }).join('')}</div>
      ${why('The two screens (PHQ-9, GAD-7) are the ones GPs use. Re-take them every two weeks and watch the trend, especially through the cut.')}
    </section>
    ${runs.filter((r) => r.done).length ? `<section class="card"><h2>Done</h2><div class="list">${runs.filter((r) => r.done).slice(0, 20).map((r) => { const iv = INTERVIEWS.find((x) => x.id === r.iid); return `<button class="linkish" style="text-align:left;background:transparent;border:0;padding:6px 0;font-weight:400" data-act="iv-view" data-id="${r.id}"><b>${esc(iv?.name || r.iid)}</b>${iv?.score ? ` · ${r.score} ${esc(band(iv.score, r.score))}` : ''}<br><span class="small muted">${esc(fmtDate(r.date))}</span></button>`; }).join('')}</div></section>` : ''}`;
}
function interviewText(r) {
  const iv = INTERVIEWS.find((x) => x.id === r.iid);
  return `${iv.name} (${r.date})${iv.score ? `: score ${r.score}, ${band(iv.score, r.score)}` : ''}\n${iv.qs.map(([q, type], i) => `Q: ${q}\nA: ${type === 'phq' ? FREQ[Number(r.answers[i])]?.[1] ?? '—' : r.answers[i] ?? '—'}`).join('\n')}`;
}

// ---------------------------------------------------------------------------
// Self-Authoring
// ---------------------------------------------------------------------------
const AUTHOR_VIEWS = [['past', 'Past'], ['faults', 'Faults'], ['virtues', 'Virtues'], ['future', 'Future']];
const ta = (path, val, ph = '', rows = 4) => `<textarea data-co="a:${esc(path)}" rows="${rows}" placeholder="${esc(ph)}">${esc(val || '')}</textarea>`;

function renderAuthor() {
  const u = cui(), a = C().author, v = u.author;
  let body = '';
  if (v === 'past') {
    body = `<section class="card"><h2>Past Authoring</h2>
      <p class="small">Split your life into epochs. In each, write the few experiences that shaped you most, good or bad, then analyse each one. Writing about the past this way is what the research behind the suite found helps people stop carrying it.</p>
      ${EPOCHS.map(([id, label]) => { const items = a.past.filter((p) => p.epoch === id); return `<details class="lens" ${u.open === 'ep-' + id || items.some((p) => p.id === u.open) ? 'open' : ''}><summary><b>${esc(label)}</b> <span class="small muted">· ${items.length} experience${items.length === 1 ? '' : 's'}</span></summary>
        ${items.map((p) => `<div class="subcard"><input data-co="a:past.${p.id}.title" value="${esc(p.title)}" placeholder="Name this experience" aria-label="Experience title">
          ${PAST_QS.map(([k, q]) => `<label class="field small">${esc(q)}${ta(`past.${p.id}.${k}`, p[k], '', 3)}</label>`).join('')}
          <button class="small-btn ghost danger" data-act="au-del" data-k="past" data-id="${p.id}">Remove</button></div>`).join('')}
        <button class="small-btn" data-act="au-add-past" data-v="${id}">+ Experience</button></details>`; }).join('')}
    </section>`;
  } else if (v === 'faults' || v === 'virtues') {
    const list = a[v], Q = v === 'faults' ? FAULT_QS : VIRTUE_QS;
    body = `<section class="card"><h2>${v === 'faults' ? 'Present Authoring: faults' : 'Present Authoring: virtues'}</h2>
      <p class="small">${v === 'faults' ? 'The faults you chose, by personality domain. Pick the ones that cost you most and write them through: an experience, a better outcome, and guidelines for improvement.' : 'Your strengths, by domain. Write how each has helped, how to use it more, and how it can go too far.'}</p>
      ${TRAIT_DOMAINS.map((d) => { const items = list.filter((f) => (f.domain || '').toLowerCase().startsWith(d.toLowerCase().slice(0, 6))); return items.length ? `<h3 class="small muted">${esc(d)}</h3>${items.map((f) => { const an = f.analysis || {}; const written = Q.some(([k]) => an[k]); return `<details class="lens" ${u.open === f.id ? 'open' : ''}><summary>${written ? '✍ ' : ''}${esc(f.text)}</summary>
        ${Q.map(([k, q]) => `<label class="field small">${esc(q)}${ta(`${v}.${f.id}.analysis.${k}`, an[k], '', 4)}</label>`).join('')}
        <button class="small-btn ghost danger" data-act="au-del" data-k="${v}" data-id="${f.id}">Remove</button></details>`; }).join('')}` : ''; }).join('')}
      ${list.filter((f) => !TRAIT_DOMAINS.some((d) => (f.domain || '').toLowerCase().startsWith(d.toLowerCase().slice(0, 6)))).map((f) => `<details class="lens"><summary>${esc(f.text)}</summary>${Q.map(([k, q]) => `<label class="field small">${esc(q)}${ta(`${v}.${f.id}.analysis.${k}`, (f.analysis || {})[k], '', 4)}</label>`).join('')}<button class="small-btn ghost danger" data-act="au-del" data-k="${v}" data-id="${f.id}">Remove</button></details>`).join('')}
      <div class="row wrap"><select data-co="new-domain" aria-label="Domain">${TRAIT_DOMAINS.map((d) => `<option ${ui.coachNewDomain === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <input class="grow" data-co="new-item" value="${esc(ui.coachNewItem || '')}" placeholder="${v === 'faults' ? 'e.g. Often procrastinate' : 'e.g. Calm under pressure'}" aria-label="New ${v === 'faults' ? 'fault' : 'virtue'}">
        <button class="small-btn" data-act="au-add" data-k="${v}">Add</button></div>
    </section>`;
  } else {
    const f = a.future;
    body = `<section class="card"><h2>Future Authoring</h2>
      <p class="small">Write the future you want and the one you want to avoid, then turn it into goals. Specific and honest beats impressive.</p>
      <label class="field"><b>${esc(FUTURE_STEPS[0][1])}</b>${ta('future.oneyear', f.oneyear, 'Body, money, family, work, how you spend a Tuesday', 5)}</label>
      <details class="lens" ${u.open === 'ideal' ? 'open' : ''}><summary><b>Your ideal future, area by area</b></summary>${FUTURE_AREAS.map(([k, l]) => `<label class="field small">${esc(l)}${ta(`future.ideal.${k}`, (f.ideal || {})[k], '', 3)}</label>`).join('')}</details>
      <label class="field"><b>${esc(FUTURE_STEPS[2][1])}</b>${ta('future.avoid', f.avoid, 'Be specific. This is the fuel.', 5)}</label>
      <h3>Goals</h3>
      ${(f.goals || []).map((g, i) => `<details class="lens" ${u.open === g.id ? 'open' : ''}><summary><b>${i + 1}. ${esc(g.what || 'New goal')}</b></summary>
        ${GOAL_QS.map(([k, q]) => `<label class="field small">${esc(q)}${k === 'what' ? `<input data-co="a:future.goals.${g.id}.what" value="${esc(g.what || '')}">` : ta(`future.goals.${g.id}.${k}`, g[k], '', 3)}</label>`).join('')}
        <div class="btns"><button class="small-btn" data-act="au-goal-commit" data-id="${g.id}">Make the next step a commitment</button><button class="small-btn ghost danger" data-act="au-del" data-k="goals" data-id="${g.id}">Remove</button></div></details>`).join('')}
      <button class="small-btn" data-act="au-add-goal">+ Goal</button>
    </section>`;
  }
  const counts = { past: a.past.length, faults: a.faults.length, virtues: a.virtues.length, future: (a.future.goals || []).length };
  return `<div>${seg(AUTHOR_VIEWS.map(([k, l]) => [k, `${l}${counts[k] ? ` ${counts[k]}` : ''}`]), v, 'au-view')}</div>
    <p class="small muted" style="padding:0 4px">Based on the structure of Jordan Peterson's Self Authoring Suite. Your writing stays on this phone; the coach reads it when sharing is on.</p>
    ${body}
    <section class="card"><h2>Import or export</h2>
      <p class="small muted">Bring in your Self Authoring work (the private file from Claude, or one you exported), or save yours.</p>
      <div class="btns"><label class="btn">Import a file<input type="file" accept="application/json,.json" id="au-import" class="sr"></label><button data-act="au-export">Export</button></div>
    </section>`;
}

function setPath(path, value) {
  const a = C().author, parts = path.split('.');
  const [kind] = parts;
  if (kind === 'past' || kind === 'faults' || kind === 'virtues') {
    const item = a[kind].find((x) => x.id === parts[1]);
    if (!item) return;
    if (parts[2] === 'analysis') (item.analysis ||= {})[parts[3]] = value; else item[parts[2]] = value;
  } else if (kind === 'future') {
    if (parts[1] === 'ideal') (a.future.ideal ||= {})[parts[2]] = value;
    else if (parts[1] === 'goals') { const g = a.future.goals.find((x) => x.id === parts[2]); if (g) g[parts[3]] = value; }
    else a.future[parts[1]] = value;
  }
}

function importAuthoring(data) {
  const a = C().author;
  if (!data || data.kind !== 'self-authoring') { toast('That isn\'t a Self-Authoring file.'); return; }
  const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  let added = 0, written = 0;
  for (const kind of ['faults', 'virtues']) {
    for (const f of Array.isArray(data[kind]) ? data[kind] : []) {
      if (!f || typeof f.text !== 'string') continue;
      let cur = a[kind].find((x) => norm(x.text) === norm(f.text));
      if (!cur) { cur = { id: uid(), domain: f.domain || '', text: f.text, analysis: {} }; a[kind].push(cur); added++; }
      for (const [k, val] of Object.entries(f.analysis || {})) if (typeof val === 'string' && val && !cur.analysis?.[k]) { (cur.analysis ||= {})[k] = val; written++; }
    }
  }
  for (const p of Array.isArray(data.past) ? data.past : []) if (p && p.title && !a.past.some((x) => norm(x.title) === norm(p.title))) { a.past.push({ id: uid(), epoch: p.epoch || '18-24', title: p.title, what: p.what || '', felt: p.felt || '', shaped: p.shaped || '', learn: p.learn || '' }); added++; }
  if (data.future && typeof data.future === 'object') {
    for (const k of ['oneyear', 'avoid']) if (data.future[k] && !a.future[k]) a.future[k] = data.future[k];
    for (const g of Array.isArray(data.future.goals) ? data.future.goals : []) if (g?.what && !a.future.goals.some((x) => norm(x.what) === norm(g.what))) { a.future.goals.push({ id: uid(), ...g }); added++; }
  }
  commit();
  toast(`Imported ${added} item${added === 1 ? '' : 's'} and ${written} written answer${written === 1 ? '' : 's'}.`);
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------
function renderPrompts() {
  const groups = [...new Set(PROMPTS.map((p) => p[0]))];
  return `<section class="card"><h2>Prompt library</h2><p class="small">The prompts you saved in Drive, ready to run with the coach (which already knows your profile), or to copy into any AI.</p></section>
    ${groups.map((g) => `<section class="card"><h2>${esc(g)}</h2><div class="list">${PROMPTS.filter((p) => p[0] === g).map((p) => { const i = PROMPTS.indexOf(p); return `<div><b>${esc(p[1])}</b><p class="small muted" style="margin:4px 0">${esc(p[3])}</p><div class="btns"><button class="small-btn primary" data-act="pr-run" data-i="${i}">Run with coach</button><button class="small-btn" data-act="pr-copy" data-i="${i}">Copy</button></div></div>`; }).join('')}</div></section>`).join('')}`;
}

// ---------------------------------------------------------------------------
// The Coach tab
// ---------------------------------------------------------------------------
const COACH_TABS = [['talk', 'Talk'], ['interviews', 'Interviews'], ['author', 'Author'], ['prompts', 'Prompts']];
function renderCoach() {
  const u = cui();
  const body = u.mode === 'interviews' ? renderInterviews() : u.mode === 'author' ? renderAuthor() : u.mode === 'prompts' ? renderPrompts() : renderTalk();
  return `<div>${seg(COACH_TABS, u.mode, 'co-mode')}</div>${body}
    <p class="small muted" style="padding:0 4px">A coach, not a clinician. In crisis: Samaritans 116 123 · NHS 111 option 2 · 999.</p>`;
}

// Returns true when it handled the click.
function handleCoach(el) {
  const a = el.dataset.act, v = el.dataset.v, id = el.dataset.id, u = cui();
  switch (a) {
    case 'co-mode': u.mode = v; render(); window.scrollTo(0, 0); return true;
    case 'co-start': startChat(v); return true;
    case 'co-open': u.chatId = id; { const c = chatById(id); if (c) delete c.ended; } render(); return true;
    case 'co-leave': u.chatId = null; render(); return true;
    case 'co-del': ask('Delete this session?', [{ label: 'Cancel' }, { label: 'Delete', cls: 'danger', fn: () => { C().chats = C().chats.filter((c) => c.id !== id); commit(); } }]); return true;
    case 'co-send': sendChat(document.getElementById('co-input')?.value); return true;
    case 'co-stop': u.abort?.abort(); return true;
    case 'co-copy': { const c = chatById(u.chatId); if (c) copyText(chatTranscript(c)).then((ok) => toast(ok ? 'Copied. Paste it into the Claude app.' : 'Copy failed.')); return true; }
    case 'co-end': endChat(); return true;
    case 'co-commit': { const c = chatById(id); if (!c?.action) return true; const when = c.when || 'today'; addCommit({ text: c.action, date: when === 'tomorrow' ? addDays(today(), 1) : today(), domain: 'mind' }); c.committed = true; commit(); toast('Added to your commitments.'); return true; }
    case 'co-dismiss': u.chatId = null; render(); return true;
    case 'co-engine': lsSet(AI_KEYS.provider, v); render(); return true;
    case 'co-share': C().share = v === 'on'; commit(); return true;
    case 'co-forget': ask('Remove the saved AI keys from this phone? Deliberation Council uses the same keys.', [{ label: 'Cancel' }, { label: 'Remove', cls: 'danger', fn: () => { lsSet(AI_KEYS.claude, ''); lsSet(AI_KEYS.gemini, ''); render(); } }]); return true;
    // Interviews
    case 'iv-start': {
      const open = C().runs.find((r) => r.iid === v && !r.done);
      if (open) u.run = open.id;
      else { const r = { id: uid(), iid: v, date: today(), at: new Date().toISOString(), answers: [], i: 0, done: false }; C().runs.push(r); u.run = r.id; }
      save(); render(); window.scrollTo(0, 0); return true;
    }
    case 'iv-view': u.run = id; render(); window.scrollTo(0, 0); return true;
    case 'iv-close': u.run = null; save(); render(); return true;
    case 'iv-pick': { const r = C().runs.find((x) => x.id === u.run); r.answers[r.i || 0] = /^\d+$/.test(v) ? Number(v) : v; save(); render(); return true; }
    case 'iv-prev': { const r = C().runs.find((x) => x.id === u.run); r.i = Math.max(0, (r.i || 0) - 1); save(); render(); return true; }
    case 'iv-next': {
      const r = C().runs.find((x) => x.id === u.run), iv = INTERVIEWS.find((x) => x.id === r.iid);
      if ((r.i || 0) < iv.qs.length - 1) r.i = (r.i || 0) + 1;
      else { r.done = true; r.date = today(); r.at = new Date().toISOString(); r.score = runScore(iv, r); }
      save(); render(); window.scrollTo(0, 0); return true;
    }
    case 'iv-reflect': { const r = C().runs.find((x) => x.id === u.run); const iv = INTERVIEWS.find((x) => x.id === r.iid); u.run = null; u.mode = 'talk'; startChat(iv.id === 'intake' ? 'interview' : iv.id === 'grow' || iv.id === 'change' ? 'coach' : 'therapist', `I've just done this. Reflect on it with me: what stands out, what pattern do you see, and what is one thing to do next?\n\n${interviewText(r)}`); return true; }
    case 'iv-copy': { const r = C().runs.find((x) => x.id === u.run); copyText(interviewText(r)).then((ok) => toast(ok ? 'Copied.' : 'Copy failed.')); return true; }
    case 'iv-del': ask('Delete this interview?', [{ label: 'Cancel' }, { label: 'Delete', cls: 'danger', fn: () => { C().runs = C().runs.filter((x) => x.id !== u.run); u.run = null; commit(); } }]); return true;
    // Self-Authoring
    case 'au-view': u.author = v; render(); return true;
    case 'au-add-past': { const p = { id: uid(), epoch: v, title: '', what: '', felt: '', shaped: '', learn: '' }; C().author.past.push(p); u.open = p.id; commit(); return true; }
    case 'au-add': {
      const text = (ui.coachNewItem || '').trim();
      if (!text) { toast('Type it first.'); return true; }
      const f = { id: uid(), domain: ui.coachNewDomain || TRAIT_DOMAINS[0], text, analysis: {} };
      C().author[el.dataset.k].push(f); u.open = f.id; ui.coachNewItem = ''; commit(); return true;
    }
    case 'au-add-goal': { const g = { id: uid(), what: '' }; C().author.future.goals.push(g); u.open = g.id; commit(); return true; }
    case 'au-del': {
      const k = el.dataset.k;
      ask('Remove this and what you wrote for it?', [{ label: 'Cancel' }, { label: 'Remove', cls: 'danger', fn: () => {
        if (k === 'goals') C().author.future.goals = C().author.future.goals.filter((g) => g.id !== id);
        else C().author[k] = C().author[k].filter((x) => x.id !== id);
        commit();
      } }]);
      return true;
    }
    case 'au-goal-commit': {
      const g = C().author.future.goals.find((x) => x.id === id);
      openSheet('text', { title: 'Next step', label: `The next physical step toward: ${g?.what || 'this goal'}`, onSave: (txt) => { if (txt) { addCommit({ text: txt, date: today(), domain: 'mind' }); toast('Added to today.'); } } }, { text: '' });
      return true;
    }
    case 'au-export': {
      const blob = new Blob([JSON.stringify({ kind: 'self-authoring', v: 1, at: new Date().toISOString(), ...C().author, future: C().author.future }, null, 1)], { type: 'application/json' });
      const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = `self-authoring-${today()}.json`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 2000);
      return true;
    }
    // Prompts
    case 'pr-run': { const p = PROMPTS[Number(el.dataset.i)]; u.mode = 'talk'; startChat(p[2], p[3]); window.scrollTo(0, 0); return true; }
    case 'pr-copy': { const p = PROMPTS[Number(el.dataset.i)]; copyText(p[3]).then((ok) => toast(ok ? 'Copied.' : 'Copy failed.')); return true; }
  }
  return false;
}

// Typing: saved without re-rendering (which would drop focus).
let coachSaveTimer = null;
function onCoachField(el) {
  const k = el.dataset.co;
  if (!k) return false;
  if (k === 'draft') ui.coachDraft = el.value;
  else if (k === 'new-item') ui.coachNewItem = el.value;
  else if (k === 'new-domain') ui.coachNewDomain = el.value;
  else if (k === 'iv-answer') { const r = C().runs.find((x) => x.id === cui().run); if (r) r.answers[r.i || 0] = el.value; }
  else if (k === 'gemini-model') lsSet(AI_KEYS.geminiModel, el.value.trim());
  else if (k === 'key-claude' || k === 'key-gemini') { if (!el.value.includes('•')) lsSet(k === 'key-claude' ? AI_KEYS.claude : AI_KEYS.gemini, el.value.trim()); return true; }
  else if (k.startsWith('a:')) setPath(k.slice(2), el.value);
  clearTimeout(coachSaveTimer); coachSaveTimer = setTimeout(save, 400);
  return true;
}
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset?.co === 'key-claude' || t.dataset?.co === 'key-gemini') { render(); toast(t.value ? 'Key saved on this phone.' : 'Key removed.'); return; }
  if (t.dataset?.co === 'new-domain') { ui.coachNewDomain = t.value; return; }
  if (t.id !== 'au-import') return;
  const file = t.files?.[0];
  t.value = '';
  if (file) file.text().then((txt) => { let d; try { d = JSON.parse(txt); } catch { d = null; } importAuthoring(d); });
});
