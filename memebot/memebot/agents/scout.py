"""Scout agent: finds short-term momentum candidates.

Runs on every token in the scan using only cheap market data (no extra API
calls). It looks for tokens that are moving up with buyers in control, but
not ones that have already gone vertical. Anything it passes still has to get
through the safety filter and the risk manager.
"""

from __future__ import annotations

import math
from typing import Dict, List, Tuple

from ..config import ScoutConfig
from ..models import Signal, TokenSnapshot
from ..portfolio import Portfolio


class ScoutAgent:
    name = "scout"

    def __init__(self, cfg: ScoutConfig, chains: List[str]):
        self.cfg = cfg
        self.chains = {c.lower() for c in chains}

    def _reject_reason(self, s: TokenSnapshot, portfolio: Portfolio, now: float) -> str:
        c = self.cfg
        if s.chain.lower() not in self.chains:
            return "chain_not_watched"
        if portfolio.position_for(s.address):
            return "already_held"
        if portfolio.cooldowns.get(s.address, 0) > now:
            return "cooldown"
        if s.price_usd <= 0:
            return "no_price"
        if s.liquidity_usd < c.min_liquidity_usd:
            return "low_liquidity"
        if s.volume_5m < c.min_volume_5m_usd:
            return "low_volume_5m"
        if not c.min_price_change_5m <= s.price_change_5m <= c.max_price_change_5m:
            return "5m_change_out_of_range"
        if not c.min_price_change_1h <= s.price_change_1h <= c.max_price_change_1h:
            return "1h_change_out_of_range"
        if s.buy_sell_ratio < c.min_buy_sell_ratio:
            return "weak_buy_pressure"
        return ""

    def score(self, s: TokenSnapshot) -> Tuple[float, List[str]]:
        """0..1-ish score. Rewards fresh momentum, buy pressure and turnover;
        penalises extended moves (the later you are, the worse the odds)."""
        c = self.cfg
        momentum = min(s.price_change_5m / c.max_price_change_5m, 1.0)
        pressure = min((s.buy_sell_ratio - 1) / 2, 1.0)
        turnover = min(s.volume_1h / max(s.liquidity_usd, 1) / 2, 1.0)
        extension = min(s.price_change_1h / c.max_price_change_1h, 1.0)
        depth = min(math.log10(max(s.liquidity_usd, 1)) / 6, 1.0)   # $1M = 1.0
        score = 0.35 * momentum + 0.25 * pressure + 0.2 * turnover + 0.2 * depth - 0.25 * extension
        reasons = [
            f"5m {s.price_change_5m:+.1%}",
            f"1h {s.price_change_1h:+.1%}",
            f"buy/sell {s.buy_sell_ratio:.2f}",
            f"vol1h/liq {s.volume_1h / max(s.liquidity_usd, 1):.2f}",
        ]
        return round(score, 4), reasons

    def scan(self, snapshots: List[TokenSnapshot], portfolio: Portfolio,
             now: float) -> Tuple[List[Signal], Dict[str, int]]:
        """Return the best candidates and a count of rejection reasons."""
        signals: List[Signal] = []
        rejected: Dict[str, int] = {}
        for s in snapshots:
            reason = self._reject_reason(s, portfolio, now)
            if reason:
                rejected[reason] = rejected.get(reason, 0) + 1
                continue
            sc, reasons = self.score(s)
            signals.append(Signal(snapshot=s, score=sc, reasons=reasons))
        signals.sort(key=lambda x: x.score, reverse=True)
        return signals[: self.cfg.max_candidates_per_tick], rejected
