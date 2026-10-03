/* Data feeds: live odds and scores from The Odds API (the-odds-api.com, needs a key),
   past football results from football-data.co.uk, and results CSVs for other sports.
   `fetchFn` is injectable for tests. */

const ODDS_API = 'https://api.the-odds-api.com/v4';

/** Odds API sport key → football-data.co.uk division code and label. */
export const LEAGUES = {
  soccer_epl: { div: 'E0', name: 'Premier League' },
  soccer_efl_champ: { div: 'E1', name: 'Championship' },
  soccer_england_league1: { div: 'E2', name: 'League One' },
  soccer_england_league2: { div: 'E3', name: 'League Two' },
  soccer_spl: { div: 'SC0', name: 'Scottish Premiership' },
  soccer_spain_la_liga: { div: 'SP1', name: 'La Liga' },
  soccer_italy_serie_a: { div: 'I1', name: 'Serie A' },
  soccer_germany_bundesliga: { div: 'D1', name: 'Bundesliga' },
  soccer_france_ligue_one: { div: 'F1', name: 'Ligue 1' },
  soccer_netherlands_eredivisie: { div: 'N1', name: 'Eredivisie' },
  soccer_portugal_primeira_liga: { div: 'P1', name: 'Primeira Liga' },
};

/** Season codes for football-data.co.uk: the current season and the one before (e.g. 2627, 2526). */
export function seasonCodes(date = new Date()) {
  const y = date.getUTCFullYear() % 100;
  const start = date.getUTCMonth() >= 6 ? y : y - 1; // seasons start in July/August
  const code = (s) => `${String(s).padStart(2, '0')}${String((s + 1) % 100).padStart(2, '0')}`;
  return [code(start), code(start - 1)];
}

export const resultsUrl = (season, div) => `https://www.football-data.co.uk/mmz4281/${season}/${div}.csv`;

async function getJson(fetchFn, url) {
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).host}: ${(await res.text()).slice(0, 200)}`);
  const remaining = res.headers?.get?.('x-requests-remaining');
  return { data: await res.json(), remaining: remaining == null ? null : Number(remaining) };
}

/**
 * Upcoming fixtures with the best price per outcome across the allowed bookmakers.
 * Spreads and totals use the main line: the one most bookmakers quote.
 * Returns [{ id, sport, league, commence, home, away, prices: { h2h?, spreads?, totals? } }].
 */
export async function fetchOdds(fetchFn, apiKey, sport, { regions = 'uk', bookmakers = [], markets = ['h2h', 'spreads', 'totals'], label } = {}) {
  const url = `${ODDS_API}/sports/${sport}/odds?apiKey=${encodeURIComponent(apiKey)}&regions=${regions}&markets=${markets.join(',')}&oddsFormat=decimal&dateFormat=iso`;
  const { data, remaining } = await getJson(fetchFn, url);
  const fixtures = data.map((ev) => ({
    id: ev.id, sport, league: label ?? LEAGUES[sport]?.name ?? sport, commence: ev.commence_time,
    home: ev.home_team, away: ev.away_team, prices: bestPrices(ev, bookmakers),
  }));
  return { fixtures, remaining };
}

/** Best price per outcome from one Odds API event. Exported for tests. */
export function bestPrices(ev, bookmakers = []) {
  const allow = bookmakers.length ? new Set(bookmakers) : null;
  const books = (ev.bookmakers ?? []).filter((bk) => !allow || allow.has(bk.key));
  const best = {};
  const take = (slot, price, book) => { if (!best[slot] || price > best[slot].price) best[slot] = { price, book }; };
  const mainLine = (key, pick) => {
    const counts = new Map();
    for (const bk of books) for (const m of bk.markets ?? []) if (m.key === key) {
      const pt = pick(m.outcomes ?? []);
      if (pt != null) counts.set(pt, (counts.get(pt) ?? 0) + 1);
    }
    return [...counts].sort((a, b) => b[1] - a[1] || Math.abs(a[0]) - Math.abs(b[0]))[0]?.[0];
  };
  const spreadLine = mainLine('spreads', (os) => os.find((o) => o.name === ev.home_team)?.point);
  const totalLine = mainLine('totals', (os) => os.find((o) => o.name === 'Over')?.point);
  for (const bk of books) {
    for (const m of bk.markets ?? []) {
      for (const oc of m.outcomes ?? []) {
        const side = oc.name === ev.home_team ? 'home' : oc.name === ev.away_team ? 'away' : null;
        if (m.key === 'h2h') {
          const slot = side ?? (oc.name === 'Draw' ? 'draw' : null);
          if (slot) take(`h2h.${slot}`, oc.price, bk.title);
        } else if (m.key === 'spreads' && side) {
          const onLine = side === 'home' ? oc.point === spreadLine : oc.point === -spreadLine;
          if (onLine) take(`spreads.${side}`, oc.price, bk.title);
        } else if (m.key === 'totals' && oc.point === totalLine) {
          take(`totals.${oc.name === 'Over' ? 'over' : 'under'}`, oc.price, bk.title);
        }
      }
    }
  }
  const pick = (market, slots) => {
    if (!slots.every((x) => best[`${market}.${x}`])) return null;
    const out = { books: {} };
    for (const x of slots) { out[x] = best[`${market}.${x}`].price; out.books[x] = best[`${market}.${x}`].book; }
    return out;
  };
  const prices = {};
  const h2h = pick('h2h', best['h2h.draw'] ? ['home', 'draw', 'away'] : ['home', 'away']);
  if (h2h) prices.h2h = h2h;
  const spreads = spreadLine != null && pick('spreads', ['home', 'away']);
  if (spreads) prices.spreads = { line: spreadLine, ...spreads };
  const totals = totalLine != null && pick('totals', ['over', 'under']);
  if (totals) prices.totals = { line: totalLine, ...totals };
  return prices;
}

/** Every in-season sport key. Free: doesn't count against the request quota. */
export async function fetchSports(fetchFn, apiKey) {
  const { data } = await getJson(fetchFn, `${ODDS_API}/sports?apiKey=${encodeURIComponent(apiKey)}`);
  return data.filter((x) => x.active && !x.has_outrights).map((x) => ({ key: x.key, group: x.group, title: x.title }));
}

/** Results history rows from scores: [{ id, date, home, away, hg, ag }] for completed events. */
export function scoresToResults(scores) {
  return scores
    .filter((s) => s.completed && Number.isFinite(s.hg) && Number.isFinite(s.ag))
    .map((s) => ({ id: s.id, date: (s.commence ?? new Date().toISOString()).slice(0, 10), home: s.home, away: s.away, hg: s.hg, ag: s.ag }));
}

/** Parses a generic results CSV: date, home, away, home_score, away_score (header row optional). */
export function parseGenericResults(text) {
  const out = [];
  for (const line of String(text).replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const c = line.split(',').map((x) => x.trim());
    if (c.length < 5 || !/^\d{4}-\d{2}-\d{2}/.test(c[0])) continue;
    const hg = Number(c[3]), ag = Number(c[4]);
    if (!c[1] || !c[2] || !Number.isFinite(hg) || !Number.isFinite(ag)) continue;
    out.push({ id: `csv:${c[0]}:${c[1]}:${c[2]}`, date: c[0].slice(0, 10), home: c[1], away: c[2], hg, ag });
  }
  return out;
}

/** Scores for the last `daysFrom` days (max 3). Returns [{ id, completed, home, away, hg, ag }]. */
export async function fetchScores(fetchFn, apiKey, sport, daysFrom = 3) {
  const url = `${ODDS_API}/sports/${sport}/scores?apiKey=${encodeURIComponent(apiKey)}&daysFrom=${daysFrom}&dateFormat=iso`;
  const { data, remaining } = await getJson(fetchFn, url);
  const scores = data.map((ev) => {
    const s = Object.fromEntries((ev.scores ?? []).map((x) => [x.name, Number(x.score)]));
    return { id: ev.id, completed: !!ev.completed, commence: ev.commence_time, home: ev.home_team, away: ev.away_team, hg: s[ev.home_team], ag: s[ev.away_team] };
  });
  return { scores, remaining };
}

/** Raw results CSV text for one season and division. */
export async function fetchResultsCsv(fetchFn, season, div) {
  const res = await fetchFn(resultsUrl(season, div));
  if (!res.ok) throw new Error(`${res.status} fetching ${div} ${season} results`);
  return res.text();
}
