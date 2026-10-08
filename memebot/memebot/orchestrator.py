"""Orchestrator: runs the agents in order, once per tick.

Each tick:
  1. Market data: scan the universe and quote open positions.
  2. Mark positions to market; roll the UTC day if needed.
  3. Exits first: the risk manager checks every open position (stop loss,
     trailing stop, take profit, time stop, liquidity pulled, no quote) and
     the executor closes the ones it flags.
  4. Circuit breakers: daily loss limit and drawdown pause.
  5. Entries (only if allowed): scout -> safety filter -> risk sizing ->
     executor, stopping as soon as the risk manager says no more.
  6. Logger saves state and an equity point; dashboard prints if due.

Exits always run before entries, and run even when the bot is paused or
halted for the day. Halts only ever block *new* risk.
"""

from __future__ import annotations

import logging
import threading
from collections import deque
from typing import Callable, Deque, Optional

from .agents import Journal, RiskManager, SafetyAgent, ScoutAgent, build_executor
from .agents.executor import Executor
from .agents.journal import iso
from .config import BotConfig
from .data import MarketDataSource
from .models import Position, TokenSnapshot
from .portfolio import Portfolio

log = logging.getLogger(__name__)


class Orchestrator:
    def __init__(self, cfg: BotConfig, source: MarketDataSource, journal: Journal,
                 executor: Optional[Executor] = None, resume: bool = True,
                 save_every_ticks: int = 1):
        self.cfg = cfg
        self.source = source
        self.journal = journal
        self.scout = ScoutAgent(cfg.scout, cfg.market.chains)
        self.safety = SafetyAgent(cfg.safety)
        self.risk = RiskManager(cfg.risk, cfg.execution.network_fee_usd)
        self.executor = executor or build_executor(cfg)
        self.tick = 0
        self.equity_curve: Deque[dict] = deque(maxlen=2000)
        self.lock = threading.Lock()       # guards `view` for the web dashboard
        self.view: dict = {}
        self.stop_requested = False
        self._last_block = ""
        # Writing state.json every tick is right for live runs; fast simulated
        # runs save less often and always on exit (see run()).
        self.save_every_ticks = max(1, save_every_ticks)
        self._config_dict = cfg.to_dict()

        state = journal.load_state() if resume else None
        if state and state.get("source") == source.name:
            self.portfolio = Portfolio.from_dict(state["portfolio"])
            self.tick = state.get("tick", 0)
            self._log("orchestrator", "resumed", cash=round(self.portfolio.cash, 4),
                      positions=len(self.portfolio.positions),
                      paused=self.portfolio.paused)
        else:
            self.portfolio = Portfolio(cfg.starting_capital, source.now())
            self._log("orchestrator", "started", starting_capital=cfg.starting_capital,
                      source=source.name, mode=cfg.mode)

    # ------------------------------------------------------------- helpers
    def _log(self, agent: str, event: str, symbol: str = "", address: str = "", **kw) -> None:
        self.journal.decision(self.source.now(), self.tick, agent, event, symbol, address, **kw)

    def status(self) -> str:
        p = self.portfolio
        if p.paused:
            return "PAUSED"
        if p.daily_halt:
            return "DAILY_HALT"
        return "ACTIVE"

    def _close(self, pos: Position, quote: Optional[TokenSnapshot], reason: str, now: float) -> None:
        try:
            fill = self.executor.sell(pos, quote, now)
        except Exception as e:  # never let one failed order kill the loop
            self._log("executor", "order_failed", pos.symbol, pos.address, side="sell",
                      reason=reason, error=str(e))
            return
        trade = self.portfolio.close_position(pos, fill, reason, self.cfg.risk.reentry_cooldown_minutes)
        self.journal.trade(trade)
        self._log("executor", "sell_filled", pos.symbol, pos.address, reason=reason,
                  qty=fill.qty, price=fill.price, proceeds=trade.proceeds_usd,
                  pnl_usd=trade.pnl_usd, pnl_pct=trade.pnl_pct,
                  slippage_pct=round(fill.slippage_pct, 5), fee_usd=round(fill.fee_usd, 6),
                  mode=fill.mode)

    # ------------------------------------------------------------- the tick
    def run_tick(self) -> None:
        now = self.source.now()
        p = self.portfolio

        # 1-2. Market data and marking.
        try:
            universe = self.source.scan()
        except Exception as e:
            universe = []
            self._log("scout", "scan_failed", error=str(e))
        try:
            quotes = self.source.quote(p.held_addresses()) if p.positions else {}
        except Exception as e:
            quotes = {}
            self._log("risk", "quote_failed", error=str(e))
        p.mark(quotes, now)
        day_event = self.risk.roll_day(p, now)
        if day_event:
            self._log("risk", "day_rollover", detail=day_event)

        # 3. Exits.
        for pos in list(p.positions.values()):
            reason = self.risk.exit_reason(pos, quotes.get(pos.address), now)
            if reason:
                self._log("risk", "exit_signal", pos.symbol, pos.address, reason=reason,
                          price=pos.last_price, entry=pos.entry_price,
                          change_pct=round(pos.unrealized_pct, 4))
                self._close(pos, quotes.get(pos.address), reason, now)

        # 4. Circuit breakers.
        for event in self.risk.evaluate_breakers(p):
            self._log("risk", "circuit_breaker", detail=event)
            if event.startswith("DRAWDOWN_PAUSE") and self.cfg.risk.flatten_on_pause:
                for pos in list(p.positions.values()):
                    self._close(pos, quotes.get(pos.address), "drawdown_pause", now)

        # 5. Entries.
        block = self.risk.entry_block_reason(p)
        if not block:
            signals, rejected = self.scout.scan(universe, p, now)
            self._log("scout", "scan_summary", universe=len(universe),
                      candidates=len(signals), rejected=rejected)
            if self.cfg.scout.log_rejections:
                for s in universe:
                    reason = self.scout._reject_reason(s, p, now)
                    if reason:
                        self._log("scout", "skip", s.symbol, s.address, reason=reason)
            for sig in signals:
                s = sig.snapshot
                self._log("scout", "candidate", s.symbol, s.address, score=sig.score,
                          reasons=sig.reasons, price=s.price_usd,
                          liquidity=round(s.liquidity_usd))
                try:
                    s = self.source.enrich_safety(s)
                except Exception as e:
                    self._log("safety", "enrich_failed", s.symbol, s.address, error=str(e))
                verdict = self.safety.check(s, now)
                self._log("safety", "pass" if verdict.passed else "reject", s.symbol, s.address,
                          failures=verdict.failures, warnings=verdict.warnings,
                          source=s.safety_source)
                if not verdict.passed:
                    continue
                sizing = self.risk.size_entry(sig, p)
                self._log("risk", "approve" if sizing.approved else "deny", s.symbol, s.address,
                          usd=round(sizing.usd_amount, 4),
                          est_impact_pct=round(sizing.est_price_impact_pct, 5),
                          reason=sizing.reason)
                if not sizing.approved:
                    if self.risk.entry_block_reason(p):
                        break            # portfolio-level block: stop looking
                    continue
                try:
                    fill = self.executor.buy(s, sizing.usd_amount, now)
                    pos = p.open_position(fill, s, sig.score)
                except Exception as e:
                    self._log("executor", "order_failed", s.symbol, s.address, side="buy",
                              error=str(e))
                    continue
                self._log("executor", "buy_filled", s.symbol, s.address, position_id=pos.id,
                          qty=fill.qty, price=fill.price, cost=round(pos.cost_usd, 6),
                          slippage_pct=round(fill.slippage_pct, 5),
                          fee_usd=round(fill.fee_usd, 6), mode=fill.mode)
        elif block and block != self._last_block:
            # Log blocks only when they change to keep the journal readable.
            self._log("risk", "entries_blocked", reason=block)
        self._last_block = block

        # 6. Persist and publish.
        stats = p.stats()
        status = self.status()
        self.journal.equity_point(now, self.tick, stats, status)
        self.equity_curve.append({"t": now, "equity": stats["equity"]})
        self._publish(now, stats, status, save=self.tick % self.save_every_ticks == 0)
        self.tick += 1

    def save(self) -> None:
        """Write the current state to disk now."""
        self.journal.save_state({k: v for k, v in self.get_view().items() if k != "equity_curve"})

    def _publish(self, now: float, stats: dict, status: str, save: bool = True) -> None:
        p = self.portfolio
        state = {
            "version": 1,
            "source": self.source.name,
            "mode": self.cfg.mode,
            "tick": self.tick + 1,          # ticks completed
            "time": iso(now),
            "status": status,
            "pause_reason": p.pause_reason,
            "stats": stats,
            "portfolio": p.to_dict(),
            "config": self._config_dict,
        }
        if save:
            self.journal.save_state(state)
        view = dict(state)
        view["equity_curve"] = list(self.equity_curve)
        with self.lock:
            self.view = view

    def get_view(self) -> dict:
        with self.lock:
            return self.view

    # ------------------------------------------------------------- the loop
    def run(self, max_ticks: Optional[int] = None,
            on_tick: Optional[Callable[["Orchestrator"], None]] = None) -> None:
        start = self.tick
        try:
            while not self.stop_requested:
                self.run_tick()
                if on_tick:
                    on_tick(self)
                if max_ticks is not None and self.tick - start >= max_ticks:
                    break
                self.source.wait_next_tick()
        finally:
            if self.view:
                self.save()
