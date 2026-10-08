"""Plain data records passed between agents.

All percentages are fractions (0.05 = 5%). All money is USD. All times are
Unix epoch seconds (simulated time in simulator mode).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import List, Optional


@dataclass
class TokenSnapshot:
    """One token's market and safety data at a point in time.

    Market fields come from the scan. Safety fields start as None ("unknown")
    and are filled by ``MarketDataSource.enrich_safety`` only for candidates
    the scout picked, since those lookups are slow or rate limited.
    """

    address: str
    symbol: str
    chain: str
    price_usd: float
    liquidity_usd: float
    timestamp: float
    pair_address: str = ""
    volume_5m: float = 0.0
    volume_1h: float = 0.0
    volume_24h: float = 0.0
    price_change_5m: float = 0.0
    price_change_1h: float = 0.0
    price_change_24h: float = 0.0
    buys_5m: int = 0
    sells_5m: int = 0
    market_cap: Optional[float] = None
    created_at: Optional[float] = None
    # --- safety data (None = unknown) ---
    lp_locked_pct: Optional[float] = None          # locked or burned share of LP
    mint_authority_revoked: Optional[bool] = None
    freeze_authority_revoked: Optional[bool] = None
    top10_holder_pct: Optional[float] = None
    top_holder_pct: Optional[float] = None
    holder_count: Optional[int] = None
    is_honeypot: Optional[bool] = None
    sell_tax_pct: Optional[float] = None
    safety_source: str = ""

    @property
    def buy_sell_ratio(self) -> float:
        return self.buys_5m / max(self.sells_5m, 1)

    def age_minutes(self, now: float) -> Optional[float]:
        if self.created_at is None:
            return None
        return max(0.0, (now - self.created_at) / 60.0)

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Signal:
    """A scout pick: a token worth sending to the safety filter."""

    snapshot: TokenSnapshot
    score: float
    reasons: List[str] = field(default_factory=list)


@dataclass
class SafetyVerdict:
    passed: bool
    failures: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


@dataclass
class SizingDecision:
    approved: bool
    usd_amount: float = 0.0
    est_price_impact_pct: float = 0.0
    reason: str = ""


@dataclass
class Fill:
    """Result of an executed (or simulated) swap."""

    side: str                 # "buy" or "sell"
    address: str
    symbol: str
    qty: float                # token units
    price: float              # effective price per token incl. slippage
    gross_usd: float          # qty * price
    fee_usd: float            # swap fee + network fee
    slippage_pct: float
    timestamp: float
    mode: str = "paper"


@dataclass
class Position:
    id: str
    address: str
    symbol: str
    chain: str
    qty: float
    entry_price: float        # effective fill price
    cost_usd: float           # total cash spent incl. fees
    opened_at: float
    entry_liquidity_usd: float
    entry_score: float
    last_price: float
    high_price: float         # highest mark since entry (for trailing stop)
    last_quote_at: float
    missing_quotes: int = 0
    fees_usd: float = 0.0

    @property
    def market_value(self) -> float:
        return self.qty * self.last_price

    @property
    def unrealized_pnl(self) -> float:
        return self.market_value - self.cost_usd

    @property
    def unrealized_pct(self) -> float:
        return self.last_price / self.entry_price - 1 if self.entry_price else 0.0

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class Trade:
    """A closed round trip."""

    id: str
    address: str
    symbol: str
    chain: str
    opened_at: float
    closed_at: float
    entry_price: float
    exit_price: float
    qty: float
    cost_usd: float
    proceeds_usd: float
    pnl_usd: float
    pnl_pct: float
    fees_usd: float
    exit_reason: str
    hold_minutes: float
    entry_score: float
    mode: str = "paper"

    def to_dict(self) -> dict:
        return asdict(self)
