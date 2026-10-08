"""Executor agent: turns approved orders into fills.

``PaperExecutor`` simulates swaps against a constant-product pool model:
    effective price = mid price * (1 +/- (base slippage + 2 * size / liquidity))
plus a percentage swap fee and a flat network fee per transaction.

Adding a real connector
-----------------------
Implement ``Executor`` in a new class (see ``LiveExecutorStub`` for the
contract and a checklist), then return it from ``build_executor``. Keep these
rules:
  * The executor reports what *actually* happened (real fill qty, price and
    fees from the confirmed transaction), never what was requested.
  * It must raise on failure rather than return a partial/guessed Fill; the
    orchestrator logs the error and leaves the portfolio untouched.
  * Private keys never live in config files or logs. Load them from a
    hardware wallet, OS keychain or a dedicated signer process.
  * Start with tiny sizes and keep the paper bot running side by side.
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Optional

from ..config import (BotConfig, ExecutionConfig, LIVE_TRADING_ENV_VALUE,
                      LIVE_TRADING_ENV_VAR)
from ..models import Fill, Position, TokenSnapshot


class Executor(ABC):
    name = "executor"
    mode = "abstract"

    @abstractmethod
    def buy(self, snap: TokenSnapshot, usd_amount: float, now: float) -> Fill:
        """Spend ``usd_amount`` (before fees) on ``snap``'s token."""

    @abstractmethod
    def sell(self, pos: Position, snap: Optional[TokenSnapshot], now: float) -> Fill:
        """Sell the whole position. ``snap`` may be None if no quote exists."""


class PaperExecutor(Executor):
    mode = "paper"

    def __init__(self, cfg: ExecutionConfig):
        self.cfg = cfg

    def _slippage(self, usd: float, liquidity: float) -> float:
        return min(0.99, self.cfg.base_slippage_pct + 2 * usd / max(liquidity, 1.0))

    def buy(self, snap: TokenSnapshot, usd_amount: float, now: float) -> Fill:
        if usd_amount <= 0 or snap.price_usd <= 0:
            raise ValueError("Invalid buy")
        slip = self._slippage(usd_amount, snap.liquidity_usd)
        price = snap.price_usd * (1 + slip)
        swap_fee = usd_amount * self.cfg.fee_pct
        qty = (usd_amount - swap_fee) / price
        return Fill("buy", snap.address, snap.symbol, qty, price,
                    gross_usd=usd_amount - swap_fee,
                    fee_usd=swap_fee + self.cfg.network_fee_usd,
                    slippage_pct=slip, timestamp=now, mode=self.mode)

    def sell(self, pos: Position, snap: Optional[TokenSnapshot], now: float) -> Fill:
        if snap is not None:
            mid, liq = snap.price_usd, snap.liquidity_usd
            extra = 0.0
        else:
            # No quote: assume the worst we reasonably can. Last price, the
            # liquidity we saw at entry, and a 10% haircut.
            mid, liq, extra = pos.last_price, pos.entry_liquidity_usd, 0.10
        est_value = pos.qty * mid
        slip = min(0.99, self._slippage(est_value, liq) + extra)
        price = mid * (1 - slip)
        gross = pos.qty * price
        swap_fee = gross * self.cfg.fee_pct
        return Fill("sell", pos.address, pos.symbol, pos.qty, price,
                    gross_usd=gross, fee_usd=swap_fee + self.cfg.network_fee_usd,
                    slippage_pct=slip, timestamp=now, mode=self.mode)


class LiveExecutorStub(Executor):
    """Placeholder for a real on-chain executor. Deliberately unimplemented.

    A Solana implementation would typically:
      1. Get a quote from an aggregator (e.g. Jupiter /quote) with a strict
         slippageBps that matches risk.max_price_impact_pct.
      2. Re-check the quote's price impact against the risk limit and abort
         if it is worse than when the risk manager approved the trade.
      3. Build the swap transaction (Jupiter /swap), sign it with a signer
         that never exposes the key to this process, and send it with a
         sensible priority fee.
      4. Wait for confirmation, then read the actual token balance change and
         SOL/USDC spent from the confirmed transaction to build the Fill.
      5. Raise on timeout or failure (the caller leaves the portfolio as is).
    """

    mode = "live"

    def buy(self, snap: TokenSnapshot, usd_amount: float, now: float) -> Fill:
        raise NotImplementedError("Live trading is not implemented. See LiveExecutorStub.")

    def sell(self, pos: Position, snap: Optional[TokenSnapshot], now: float) -> Fill:
        raise NotImplementedError("Live trading is not implemented. See LiveExecutorStub.")


class LiveTradingNotAllowed(RuntimeError):
    pass


def build_executor(cfg: BotConfig) -> Executor:
    """Paper unless BOTH config mode is 'live' AND the env var opt-in is set."""
    if cfg.mode == "paper":
        return PaperExecutor(cfg.execution)
    if os.environ.get(LIVE_TRADING_ENV_VAR) != LIVE_TRADING_ENV_VALUE:
        raise LiveTradingNotAllowed(
            f'mode is "live" but {LIVE_TRADING_ENV_VAR} is not set to '
            f'{LIVE_TRADING_ENV_VALUE}. Refusing to start.')
    return LiveExecutorStub()
