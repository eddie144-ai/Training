#!/usr/bin/env node
/* MASSA runner for cron or n8n (Execute Command node). State is one JSON file, the same format
   the app exports and imports, so you can move between them.

   node run.mjs init                      new state file
   node run.mjs deposit <amount> [real]   add capital (paper by default)
   node run.mjs withdraw <amount> [real]  take money out
   node run.mjs cycle                     settle, rate, price, stake, sweep
   node run.mjs status                    balances, open bets, gate
   node run.mjs set <key> <json-value>    change a setting, e.g. set sports '["soccer_epl","soccer_efl_champ"]'

   MASSA_STATE (default ./massa-state.json) and ODDS_API_KEY (overrides settings.apiKey). */

import { readFile, writeFile, rename } from 'node:fs/promises';
import { newState, deposit, withdraw, equity, validationGate, DEFAULT_SETTINGS } from './bankroll.js';
import { runCycle } from './pipeline.js';

const FILE = process.env.MASSA_STATE || './massa-state.json';

async function load() {
  try {
    const s = JSON.parse(await readFile(FILE, 'utf8'));
    s.settings = { ...DEFAULT_SETTINGS, ...s.settings };
    return s;
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

async function save(s) {
  await writeFile(`${FILE}.tmp`, JSON.stringify(s, null, 1));
  await rename(`${FILE}.tmp`, FILE);
}

function status(s) {
  const g = validationGate(s);
  const lines = [];
  for (const a of ['paper', 'real']) {
    const acc = s.accounts[a];
    lines.push(`${a.padEnd(5)} equity £${equity(s, a).toFixed(2)}  cash £${acc.cash.toFixed(2)}  principal £${acc.principal.toFixed(2)}${acc.halted ? `  HALTED: ${acc.halted}` : ''}`);
  }
  const open = s.bets.filter((b) => b.status === 'open' || b.status === 'pending');
  lines.push(`open/pending bets: ${open.length}`);
  for (const b of open) lines.push(`  [${b.account}/${b.status}] ${b.fixture} ${b.selection} @ ${b.odds} £${b.stake.toFixed(2)} (${b.book ?? ''})`);
  lines.push(`gate: ${g.passed ? 'PASSED' : 'locked'} — ${g.checks.map((c) => `${c.ok ? '✓' : '✗'} ${c.label} (${c.value})`).join(', ')}`);
  lines.push(`last run: ${s.lastRun ?? 'never'}  API requests left: ${s.apiRemaining ?? '?'}`);
  return lines.join('\n');
}

const [cmd, ...args] = process.argv.slice(2);
let s = await load();
if (cmd === 'init') {
  if (s) { console.error(`${FILE} already exists`); process.exit(1); }
  await save(newState());
  console.log(`Created ${FILE}`);
  process.exit(0);
}
if (!s) { console.error(`No state at ${FILE}. Run: node run.mjs init`); process.exit(1); }
if (process.env.ODDS_API_KEY) s.settings.apiKey = process.env.ODDS_API_KEY;

switch (cmd) {
  case 'deposit':
  case 'withdraw': {
    const amount = Number(args[0]);
    const acct = args[1] === 'real' ? 'real' : 'paper';
    (cmd === 'deposit' ? deposit : withdraw)(s, acct, amount);
    console.log(status(s));
    break;
  }
  case 'cycle': {
    const r = await runCycle(s, { fetchFn: fetch });
    for (const b of r.placed) {
      console.log(`${b.status === 'pending' ? 'PLACE' : 'paper'}: ${b.fixture} — ${b.selection} @ ${b.odds} (${b.book}) £${b.stake.toFixed(2)}, EV ${(b.ev * 100).toFixed(1)}%`);
    }
    for (const m of [...r.messages, ...r.errors]) console.log(m);
    console.log(`${r.settled} settled, ${r.placed.length} new`);
    if (r.errors.length) process.exitCode = 2;
    break;
  }
  case 'set': {
    const [key, raw] = args;
    if (!(key in DEFAULT_SETTINGS)) { console.error(`Unknown setting ${key}`); process.exit(1); }
    s.settings[key] = JSON.parse(raw);
    console.log(`${key} = ${JSON.stringify(s.settings[key])}`);
    break;
  }
  case 'status':
  case undefined:
    console.log(status(s));
    break;
  default:
    console.error(`Unknown command ${cmd}`);
    process.exit(1);
}
// The env key is never written to disk.
if (process.env.ODDS_API_KEY) s.settings.apiKey = (await load())?.settings.apiKey ?? '';
await save(s);
