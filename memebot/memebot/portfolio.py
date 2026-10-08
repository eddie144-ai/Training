"""Virtual account: cash, open positions, closed trades and risk state.

The portfolio is the single source of truth for money. Only the orchestrator
mutates it, and only with Fill records produced by an executor, so a paper
executor and a future live executor update it the same way.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional

from .models import Fill, Position, TokenSnapshot, Trade


def utc_day(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


class Portfolio:
    def __init__(self, starting_capital: float, now: float):
        self.starting_capital = starting_capital
        self.cash = starting_capital
        self.positions: Dict[str, Position] = {}
        self.trades: List[Trade] = []
        self._trade_dicts: List[dict] = []      # cached serialisation of trades
        self.peak_equity = starting_capital
        self.day = utc_day(now)
        self.day_start_equity = starting_capital
        self.daily_halt = False            # daily loss limit hit (resets next day)
        self.paused = False                # drawdown stop hit (manual resume)
        self.pause_reason = ""
        self.cooldowns: Dict[str, float] = {}   # address -> no re-entry before ts
        self.fees_paid = 0.0
        self.created_at = now

    # ------------------------------------------------------------ valuation
    def exposure(self) -> float:
        return sum(p.market_value for p in self.positions.values())

    def equity(self) -> float:
        return self.cash + self.exposure()

    def drawdown(self) -> float:
        return 1 - self.equity() / self.peak_equity if self.peak_equity > 0 else 0.0

    def day_pnl(self) -> float:
        return self.equity() - self.day_start_equity

    def held_addresses(self) -> List[str]:
        return [p.address for p in self.positions.values()]

    def position_for(self, address: str) -> Optional[Position]:
        for p in self.positions.values():
            if p.address == address:
                return p
        return None

    def mark(self, quotes: Dict[str, TokenSnapshot], now: float) -> None:
        """Update open positions with fresh prices; count missed quotes."""
        for pos in self.positions.values():
            q = quotes.get(pos.address)
            if q is None:
                pos.missing_quotes += 1
                continue
            pos.last_price = q.price_usd
            pos.high_price = max(pos.high_price, q.price_usd)
            pos.last_quote_at = now
            pos.missing_quotes = 0
        self.peak_equity = max(self.peak_equity, self.equity())

    # ------------------------------------------------------------- mutation
    def open_position(self, fill: Fill, snap: TokenSnapshot, score: float) -> Position:
        total_cost = fill.gross_usd + fill.fee_usd
        if total_cost > self.cash + 1e-9:
            raise ValueError("Insufficient cash for fill")
        self.cash -= total_cost
        self.fees_paid += fill.fee_usd
        pos = Position(
            id=uuid.uuid4().hex[:10],
            address=fill.address,
            symbol=fill.symbol,
            chain=snap.chain,
            qty=fill.qty,
            entry_price=fill.price,
            cost_usd=total_cost,
            opened_at=fill.timestamp,
            entry_liquidity_usd=snap.liquidity_usd,
            entry_score=score,
            last_price=snap.price_usd,
            high_price=snap.price_usd,
            last_quote_at=fill.timestamp,
            fees_usd=fill.fee_usd,
        )
        self.positions[pos.id] = pos
        return pos

    def close_position(self, pos: Position, fill: Fill, reason: str,
                       cooldown_minutes: float) -> Trade:
        proceeds = max(0.0, fill.gross_usd - fill.fee_usd)
        self.cash += proceeds
        self.fees_paid += fill.fee_usd
        pnl = proceeds - pos.cost_usd
        trade = Trade(
            id=pos.id,
            address=pos.address,
            symbol=pos.symbol,
            chain=pos.chain,
            opened_at=pos.opened_at,
            closed_at=fill.timestamp,
            entry_price=pos.entry_price,
            exit_price=fill.price,
            qty=pos.qty,
            cost_usd=round(pos.cost_usd, 6),
            proceeds_usd=round(proceeds, 6),
            pnl_usd=round(pnl, 6),
            pnl_pct=round(pnl / pos.cost_usd, 6) if pos.cost_usd else 0.0,
            fees_usd=round(pos.fees_usd + fill.fee_usd, 6),
            exit_reason=reason,
            hold_minutes=round((fill.timestamp - pos.opened_at) / 60, 2),
            entry_score=round(pos.entry_score, 4),
            mode=fill.mode,
        )
        del self.positions[pos.id]
        self.trades.append(trade)
        self._trade_dicts.append(trade.to_dict())
        self.cooldowns[pos.address] = fill.timestamp + cooldown_minutes * 60
        return trade

    # ---------------------------------------------------------------- stats
    def stats(self) -> dict:
        wins = [t for t in self.trades if t.pnl_usd > 0]
        losses = [t for t in self.trades if t.pnl_usd <= 0]
        gross_win = sum(t.pnl_usd for t in wins)
        gross_loss = -sum(t.pnl_usd for t in losses)
        n = len(self.trades)
        eq = self.equity()
        return {
            "equity": round(eq, 4),
            "cash": round(self.cash, 4),
            "exposure": round(self.exposure(), 4),
            "starting_capital": self.starting_capital,
            "total_return_pct": round(eq / self.starting_capital - 1, 4),
            "realized_pnl": round(sum(t.pnl_usd for t in self.trades), 4),
            "unrealized_pnl": round(sum(p.unrealized_pnl for p in self.positions.values()), 4),
            "peak_equity": round(self.peak_equity, 4),
            "drawdown_pct": round(self.drawdown(), 4),
            "day_pnl": round(self.day_pnl(), 4),
            "trades": n,
            "wins": len(wins),
            "losses": len(losses),
            "win_rate": round(len(wins) / n, 4) if n else 0.0,
            "avg_win": round(gross_win / len(wins), 4) if wins else 0.0,
            "avg_loss": round(-gross_loss / len(losses), 4) if losses else 0.0,
            "profit_factor": round(gross_win / gross_loss, 3) if gross_loss else None,
            "expectancy": round((gross_win - gross_loss) / n, 4) if n else 0.0,
            "best_trade": round(max((t.pnl_usd for t in self.trades), default=0.0), 4),
            "worst_trade": round(min((t.pnl_usd for t in self.trades), default=0.0), 4),
            "fees_paid": round(self.fees_paid, 4),
            "open_positions": len(self.positions),
        }

    # ---------------------------------------------------------- persistence
    def to_dict(self) -> dict:
        return {
            "starting_capital": self.starting_capital,
            "cash": self.cash,
            "positions": [p.to_dict() for p in self.positions.values()],
            "trades": list(self._trade_dicts),
            "peak_equity": self.peak_equity,
            "day": self.day,
            "day_start_equity": self.day_start_equity,
            "daily_halt": self.daily_halt,
            "paused": self.paused,
            "pause_reason": self.pause_reason,
            "cooldowns": self.cooldowns,
            "fees_paid": self.fees_paid,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Portfolio":
        p = cls(d["starting_capital"], d.get("created_at", 0.0))
        p.cash = d["cash"]
        p.positions = {x["id"]: Position(**x) for x in d.get("positions", [])}
        p.trades = [Trade(**x) for x in d.get("trades", [])]
        p._trade_dicts = [t.to_dict() for t in p.trades]
        p.peak_equity = d.get("peak_equity", p.starting_capital)
        p.day = d.get("day", p.day)
        p.day_start_equity = d.get("day_start_equity", p.cash)
        p.daily_halt = d.get("daily_halt", False)
        p.paused = d.get("paused", False)
        p.pause_reason = d.get("pause_reason", "")
        p.cooldowns = d.get("cooldowns", {})
        p.fees_paid = d.get("fees_paid", 0.0)
        return p


__all__ = ["Portfolio", "utc_day"]
