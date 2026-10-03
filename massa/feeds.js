/* Data feeds: live odds and scores from The Odds API (the-odds-api.com, needs a key),
   and past results from football-data.co.uk for ratings. `fetchFn` is injectable for tests. */

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
 * Returns [{ id, sport, league, commence, home, away, prices: { h2h?, totals? } }].
 */
export async function fetchOdds(fetchFn, apiKey, sport, { regions = 'uk', bookmakers = [] } = {}) {
  const url = `${ODDS_API}/sports/${sport}/odds?apiKey=${encodeURIComponent(apiKey)}&regions=${regions}&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`;
  const { data, remaining } = await getJson(fetchFn, url);
  const allow = bookmakers.length ? new Set(bookmakers) : null;
  const fixtures = data.map((ev) => {
    const best = {};
    const take = (slot, price, book) => { if (!best[slot] || price > best[slot].price) best[slot] = { price, book }; };
    for (const bk of ev.bookmakers ?? []) {
      if (allow && !allow.has(bk.key)) continue;
      for (const m of bk.markets ?? []) {
        for (const oc of m.outcomes ?? []) {
          if (m.key === 'h2h') {
            const slot = oc.name === ev.home_team ? 'home' : oc.name === ev.away_team ? 'away' : oc.name === 'Draw' ? 'draw' : null;
            if (slot) take(slot, oc.price, bk.title);
          } else if (m.key === 'totals' && oc.point === 2.5) {
            take(oc.name === 'Over' ? 'over' : 'under', oc.price, bk.title);
          }
        }
      }
    }
    const prices = {};
    if (best.home && best.draw && best.away) {
      prices.h2h = { home: best.home.price, draw: best.draw.price, away: best.away.price,
        books: { home: best.home.book, draw: best.draw.book, away: best.away.book } };
    }
    if (best.over && best.under) {
      prices.totals = { line: 2.5, over: best.over.price, under: best.under.price,
        books: { over: best.over.book, under: best.under.book } };
    }
    return { id: ev.id, sport, league: LEAGUES[sport]?.name ?? sport, commence: ev.commence_time, home: ev.home_team, away: ev.away_team, prices };
  });
  return { fixtures, remaining };
}

/** Scores for the last `daysFrom` days (max 3). Returns [{ id, completed, home, away, hg, ag }]. */
export async function fetchScores(fetchFn, apiKey, sport, daysFrom = 3) {
  const url = `${ODDS_API}/sports/${sport}/scores?apiKey=${encodeURIComponent(apiKey)}&daysFrom=${daysFrom}&dateFormat=iso`;
  const { data, remaining } = await getJson(fetchFn, url);
  const scores = data.map((ev) => {
    const s = Object.fromEntries((ev.scores ?? []).map((x) => [x.name, Number(x.score)]));
    return { id: ev.id, completed: !!ev.completed, home: ev.home_team, away: ev.away_team, hg: s[ev.home_team], ag: s[ev.away_team] };
  });
  return { scores, remaining };
}

/** Raw results CSV text for one season and division. */
export async function fetchResultsCsv(fetchFn, season, div) {
  const res = await fetchFn(resultsUrl(season, div));
  if (!res.ok) throw new Error(`${res.status} fetching ${div} ${season} results`);
  return res.text();
}
