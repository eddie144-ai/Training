/* Team ratings from past results: opponent-adjusted attack and defence multipliers
   (1.00 = league average; defence below 1 = concedes less), with time decay and shrinkage. */

/** Parses a football-data.co.uk results CSV (Date, HomeTeam, AwayTeam, FTHG, FTAG). */
export function parseResultsCsv(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  const col = (name) => head.indexOf(name);
  const iDate = col('Date'), iH = col('HomeTeam'), iA = col('AwayTeam'), iHG = col('FTHG'), iAG = col('FTAG');
  if ([iDate, iH, iA, iHG, iAG].some((i) => i < 0)) throw new Error('CSV needs Date, HomeTeam, AwayTeam, FTHG and FTAG columns');
  const out = [];
  for (const line of lines.slice(1)) {
    const c = line.split(',');
    const hg = Number(c[iHG]), ag = Number(c[iAG]);
    if (!c[iH] || !c[iA] || c[iHG] === '' || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    const date = parseDate(c[iDate]);
    if (!date) continue;
    out.push({ date, home: c[iH].trim(), away: c[iA].trim(), hg, ag });
  }
  return out;
}

/** dd/mm/yy or dd/mm/yyyy → ISO date, or null. */
function parseDate(s) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec((s || '').trim());
  if (!m) return null;
  const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/**
 * Fits ratings. Each match is weighted by 0.5^(age / halfLifeDays). `shrink` adds that many
 * matches' worth of league-average evidence to every team, so small samples stay near 1.00.
 */
export function fitRatings(matches, { asOf = new Date().toISOString().slice(0, 10), halfLifeDays = 180, shrink = 4, iterations = 20 } = {}) {
  const t0 = Date.parse(asOf);
  const rows = matches
    .filter((m) => Date.parse(m.date) <= t0)
    .map((m) => ({ ...m, w: 0.5 ** ((t0 - Date.parse(m.date)) / 86400000 / halfLifeDays) }));
  if (!rows.length) throw new Error('No results before the rating date');

  const W = rows.reduce((s, r) => s + r.w, 0);
  const avgHomeGoals = rows.reduce((s, r) => s + r.w * r.hg, 0) / W;
  const avgAwayGoals = rows.reduce((s, r) => s + r.w * r.ag, 0) / W;

  const teams = {};
  for (const r of rows) {
    for (const t of [r.home, r.away]) teams[t] ??= { attack: 1, defense: 1, games: 0 };
    teams[r.home].games += 1;
    teams[r.away].games += 1;
  }

  for (let it = 0; it < iterations; it++) {
    const acc = Object.fromEntries(Object.keys(teams).map((t) => [t, { gs: 0, xs: 0, ga: 0, xa: 0 }]));
    for (const r of rows) {
      const h = teams[r.home], a = teams[r.away];
      // Goals scored against what an average attack would score on this opponent, and vice versa.
      acc[r.home].gs += r.w * r.hg; acc[r.home].xs += r.w * avgHomeGoals * a.defense;
      acc[r.home].ga += r.w * r.ag; acc[r.home].xa += r.w * avgAwayGoals * a.attack;
      acc[r.away].gs += r.w * r.ag; acc[r.away].xs += r.w * avgAwayGoals * h.defense;
      acc[r.away].ga += r.w * r.hg; acc[r.away].xa += r.w * avgHomeGoals * h.attack;
    }
    const prior = shrink * (avgHomeGoals + avgAwayGoals) / 2;
    for (const [t, a] of Object.entries(acc)) {
      teams[t].attack = (a.gs + prior) / (a.xs + prior);
      teams[t].defense = (a.ga + prior) / (a.xa + prior);
    }
    // Keep the league mean at 1.00 so ratings stay multipliers of the league average.
    const n = Object.keys(teams).length;
    const ma = Object.values(teams).reduce((s, t) => s + t.attack, 0) / n;
    const md = Object.values(teams).reduce((s, t) => s + t.defense, 0) / n;
    for (const t of Object.values(teams)) { t.attack /= ma; t.defense /= md; }
  }

  return { asOf, league: { avgHomeGoals, avgAwayGoals }, teams, matches: rows.length };
}

// ---------------------------------------------------------------------------
// Team names: odds feeds and results files spell teams differently.
// ---------------------------------------------------------------------------

const ALIASES = {
  'manchester united': 'man united', 'manchester utd': 'man united', 'man utd': 'man united',
  'manchester city': 'man city',
  'tottenham hotspur': 'tottenham', 'spurs': 'tottenham',
  'wolverhampton wanderers': 'wolves', 'wolverhampton': 'wolves',
  'nottingham forest': "nott'm forest", 'nottm forest': "nott'm forest",
  'newcastle united': 'newcastle', 'west ham united': 'west ham', 'brighton and hove albion': 'brighton',
  'leicester city': 'leicester', 'leeds united': 'leeds', 'sheffield united': 'sheffield united',
  'sheffield wednesday': 'sheffield weds', 'west bromwich albion': 'west brom', 'queens park rangers': 'qpr',
  'atletico madrid': 'ath madrid', 'athletic bilbao': 'ath bilbao', 'real betis': 'betis', 'real sociedad': 'sociedad',
  'celta vigo': 'celta', 'rayo vallecano': 'vallecano', 'espanyol': 'espanol', 'deportivo alaves': 'alaves',
  'inter milan': 'inter', 'internazionale': 'inter', 'ac milan': 'milan', 'as roma': 'roma',
  'borussia dortmund': 'dortmund', 'borussia monchengladbach': "m'gladbach",
  'bayer leverkusen': 'leverkusen', 'eintracht frankfurt': 'ein frankfurt',
  'paris saint germain': 'paris sg', 'psg': 'paris sg', 'olympique marseille': 'marseille', 'olympique lyonnais': 'lyon',
};

export function normaliseTeam(name) {
  const base = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, 'and').replace(/[.\-]/g, ' ').replace(/\s+/g, ' ').trim();
  if (ALIASES[base]) return ALIASES[base];
  const stripped = base.replace(/\b(fc|afc|cf|sc|ssc|calcio)\b/g, '').replace(/\s+/g, ' ').trim();
  return ALIASES[stripped] ?? stripped;
}

/** Finds a team's ratings under any spelling, or null. */
export function findTeam(ratings, name) {
  const want = normaliseTeam(name);
  const entries = Object.entries(ratings.teams);
  const exact = entries.find(([t]) => normaliseTeam(t) === want);
  if (exact) return exact[1];
  const partial = entries.filter(([t]) => { const n = normaliseTeam(t); return n.includes(want) || want.includes(n); });
  return partial.length === 1 ? partial[0][1] : null;
}
