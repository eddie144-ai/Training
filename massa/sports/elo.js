/* Elo ratings for head-to-head sports (tennis, MMA, boxing, darts without stats, cricket and
   anything else with a two-way winner market). Fitted in date order from past results. */

export const ELO_DEFAULTS = { initial: 1500, k: 24, hfa: 0, scale: 400, mov: false };

/** P(A beats B). hfa is added to A's rating (A = home side in the feed). */
export const eloWinProb = (ra, rb, hfa = 0, scale = 400) => 1 / (1 + 10 ** (-(ra + hfa - rb) / scale));

/**
 * results: [{ date, home, away, hg, ag }] (a level score counts as a half win each).
 * mov scales updates by ln(|margin| + 1), for sports where the margin carries information.
 * Returns { players: { name: { rating, games } }, hfa, scale }.
 */
export function fitElo(results, opts = {}) {
  const o = { ...ELO_DEFAULTS, ...opts };
  const players = {};
  const get = (n) => (players[n] ??= { rating: o.initial, games: 0 });
  for (const r of [...results].sort((a, b) => a.date.localeCompare(b.date))) {
    const h = get(r.home), a = get(r.away);
    const exp = eloWinProb(h.rating, a.rating, o.hfa, o.scale);
    const score = r.hg > r.ag ? 1 : r.hg < r.ag ? 0 : 0.5;
    const mult = o.mov ? Math.log(Math.abs(r.hg - r.ag) + 1) || 1 : 1;
    const delta = o.k * mult * (score - exp);
    h.rating += delta; a.rating -= delta;
    h.games += 1; a.games += 1;
  }
  return { players, hfa: o.hfa, scale: o.scale };
}
