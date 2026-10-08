"""Risk manager agent: position sizing, exits and circuit breakers.

The risk manager has the final say on every entry and owns every exit rule.
It never touches money itself; it returns decisions that the orchestrator
hands to the executor.

Circuit breakers (checked every tick):
  * Daily loss limit: equity down ``daily_loss_limit_pct`` from the start of
    the UTC day -> no new entries until the next day.
  * Drawdown stop: equity down ``max_drawdown_pct`` from its peak -> the bot
    is PAUSED (optionally closing all positions) and stays paused across
    restarts until you run ``python -m memebot resume``.
"""

from __future__ import annotations

import math
from typing import List, Optional

from ..config import RiskConfig
from ..models import Position, Signal, SizingDecision, TokenSnapshot
from ..portfolio import Portfolio, utc_day


class RiskManager:
    name = "risk"

    def __init__(self, cfg: RiskConfig, network_fee_usd: float):
        self.cfg = cfg
        self.network_fee_usd = network_fee_usd

    # ------------------------------------------------------ circuit breakers
    def roll_day(self, p: Portfolio, now: float) -> Optional[str]:
        day = utc_day(now)
        if day == p.day:
            return None
        p.day = day
        p.day_start_equity = p.equity()
        was_halted, p.daily_halt = p.daily_halt, False
        return f"new UTC day {day}; day start equity ${p.day_start_equity:.2f}" + (
            "; daily halt cleared" if was_halted else "")

    def evaluate_breakers(self, p: Portfolio) -> List[str]:
        """Trip breakers if limits are breached. Returns event descriptions."""
        events = []
        loss = -p.day_pnl()
        limit = self.cfg.daily_loss_limit_pct * p.day_start_equity
        if not p.daily_halt and loss >= limit:
            p.daily_halt = True
            events.append(f"DAILY_LOSS_LIMIT: down ${loss:.2f} today "
                          f"(limit ${limit:.2f}); no new entries until next UTC day")
        if not p.paused and p.drawdown() >= self.cfg.max_drawdown_pct:
            p.paused = True
            p.pause_reason = (f"drawdown {p.drawdown():.1%} from peak ${p.peak_equity:.2f} "
                              f">= {self.cfg.max_drawdown_pct:.0%}")
            events.append("DRAWDOWN_PAUSE: " + p.pause_reason)
        return events

    def entry_block_reason(self, p: Portfolio) -> str:
        """Why no new entry may be opened right now ('' = entries allowed)."""
        if p.paused:
            return "paused (drawdown stop) - run `python -m memebot resume`"
        if p.daily_halt:
            return "daily loss limit reached"
        if len(p.positions) >= self.cfg.max_concurrent_positions:
            return "max concurrent positions"
        eq = p.equity()
        if p.exposure() >= self.cfg.max_total_exposure_pct * eq - 1e-9:
            return "max total exposure"
        if p.cash < self.cfg.min_trade_usd + 2 * self.network_fee_usd:
            return "insufficient cash"
        return ""

    # ---------------------------------------------------------------- sizing
    def size_entry(self, sig: Signal, p: Portfolio) -> SizingDecision:
        c = self.cfg
        block = self.entry_block_reason(p)
        if block:
            return SizingDecision(False, reason=block)
        eq = p.equity()
        usd = c.risk_per_trade_pct * eq
        notes = [f"{c.risk_per_trade_pct:.1%} of equity ${eq:.2f} = ${usd:.2f}"]
        room = c.max_total_exposure_pct * eq - p.exposure()
        if usd > room:
            usd = room
            notes.append(f"capped by exposure room ${room:.2f}")
        # Keep enough cash for this buy's and the later sell's network fees.
        spendable = p.cash - 2 * self.network_fee_usd
        if usd > spendable:
            usd = spendable
            notes.append(f"capped by cash ${spendable:.2f}")
        # Price impact on a constant-product pool is roughly 2 * size / liquidity.
        liq = max(sig.snapshot.liquidity_usd, 1.0)
        impact = 2 * usd / liq
        if impact > c.max_price_impact_pct:
            usd = c.max_price_impact_pct * liq / 2
            impact = c.max_price_impact_pct
            notes.append("capped by max price impact")
        if usd < c.min_trade_usd:
            return SizingDecision(False, usd, impact,
                                  f"size ${usd:.2f} below min ${c.min_trade_usd:.2f}")
        usd = math.floor(usd * 1e6) / 1e6      # round down: never exceed the cap
        return SizingDecision(True, usd, impact, "; ".join(notes))

    # ----------------------------------------------------------------- exits
    def exit_reason(self, pos: Position, quote: Optional[TokenSnapshot], now: float) -> str:
        """Return why this position should close now ('' = hold)."""
        c = self.cfg
        if quote is None and pos.missing_quotes >= c.max_missing_quotes:
            return "no_quote"
        if quote is not None and quote.liquidity_usd < pos.entry_liquidity_usd * (1 - c.rug_liquidity_drop_pct):
            return "liquidity_pulled"
        change = pos.last_price / pos.entry_price - 1
        if change <= -c.stop_loss_pct:
            return "stop_loss"
        peak_gain = pos.high_price / pos.entry_price - 1
        if peak_gain >= c.trailing_activation_pct and pos.last_price <= pos.high_price * (1 - c.trailing_stop_pct):
            return "trailing_stop"
        if change >= c.take_profit_pct:
            return "take_profit"
        if (now - pos.opened_at) / 60 >= c.max_hold_minutes:
            return "time_stop"
        return ""
