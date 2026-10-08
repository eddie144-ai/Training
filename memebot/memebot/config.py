"""Configuration for the paper-trading bot.

Every tunable lives here as a dataclass with a safe default. A JSON file
(see ``config.example.json``) only needs the keys you want to change; anything
missing falls back to these defaults.

Some limits are *hard caps* defined as module constants below. They are not
configurable on purpose: a typo in a config file must never let the bot risk
50% of the balance on one memecoin.
"""

from __future__ import annotations

import json
import os
from dataclasses import asdict, dataclass, field, fields, is_dataclass
from typing import Any, List

# ---------------------------------------------------------------------------
# Hard caps (not configurable). Config values above these are rejected.
# ---------------------------------------------------------------------------
HARD_MAX_RISK_PER_TRADE = 0.05      # never more than 5% of balance in one trade
HARD_MAX_DAILY_LOSS = 0.25          # daily loss limit can't be set above 25%
HARD_MAX_DRAWDOWN = 0.50            # drawdown stop can't be set above 50%
HARD_MAX_CONCURRENT_POSITIONS = 10

# Live trading needs this environment variable set to exactly this value, in
# addition to ``mode: "live"`` in the config. See memebot/agents/executor.py.
LIVE_TRADING_ENV_VAR = "MEMEBOT_ENABLE_LIVE_TRADING"
LIVE_TRADING_ENV_VALUE = "I_ACCEPT_THE_RISK"


@dataclass
class MarketConfig:
    """Where market data comes from and which markets to watch."""

    # "simulated" runs offline against a synthetic memecoin market (fast, good
    # for testing the logic). "dexscreener" polls the public DexScreener API
    # for real prices and RugCheck for Solana safety data.
    source: str = "simulated"
    # Chains to trade (DexScreener chain ids: solana, base, ethereum, bsc...).
    chains: List[str] = field(default_factory=lambda: ["solana"])
    # Extra token addresses to always watch (live source only).
    watchlist: List[str] = field(default_factory=list)
    # Seconds between ticks for the live source. The simulator ignores this
    # and advances one simulated minute per tick.
    poll_interval_seconds: float = 30.0
    # HTTP timeout for live APIs.
    http_timeout_seconds: float = 10.0
    # Simulator settings.
    sim_seed: int = 42
    sim_initial_tokens: int = 30
    sim_new_tokens_per_hour: float = 6.0


@dataclass
class ScoutConfig:
    """Scout agent: finds short-term momentum candidates (cheap, no API calls)."""

    min_liquidity_usd: float = 15_000      # pre-filter before the costly safety check
    min_volume_5m_usd: float = 2_000
    min_price_change_5m: float = 0.02      # fractions: 0.02 = +2%
    max_price_change_5m: float = 0.25      # skip vertical candles (likely to snap back)
    min_price_change_1h: float = 0.03
    max_price_change_1h: float = 1.50      # skip tokens already up >150% this hour
    min_buy_sell_ratio: float = 1.2        # buys / sells over the last 5 minutes
    max_candidates_per_tick: int = 3
    # Log every token the scout skips (very noisy; off by default, a per-tick
    # summary is always logged).
    log_rejections: bool = False


@dataclass
class SafetyConfig:
    """Safety filter: every check must pass before any entry.

    Unknown data fails the check ("fail closed") unless the check is listed in
    ``allow_unknown``. Holder and LP percentages are fractions (0.35 = 35%).
    """

    min_liquidity_usd: float = 20_000
    min_lp_locked_pct: float = 0.90        # LP tokens locked or burned
    require_mint_authority_revoked: bool = True
    require_freeze_authority_revoked: bool = True
    max_top10_holder_pct: float = 0.35
    max_single_holder_pct: float = 0.10
    min_holder_count: int = 300
    min_token_age_minutes: float = 30
    max_token_age_hours: float = 24 * 7
    min_volume_24h_usd: float = 50_000
    max_sell_tax_pct: float = 0.05         # EVM-style taxes; Solana tokens are normally 0
    # Check names that may pass when the data is missing. Valid names:
    # lp_locked, mint_authority, freeze_authority, top10_holders,
    # single_holder, holder_count, token_age, honeypot, sell_tax
    allow_unknown: List[str] = field(default_factory=lambda: ["honeypot", "sell_tax"])


@dataclass
class RiskConfig:
    """Risk manager: sizing, exits and circuit breakers."""

    # Position size as a fraction of current equity. With memecoins a position
    # can go to ~0 (rug), so the whole position is treated as money at risk.
    risk_per_trade_pct: float = 0.03
    max_concurrent_positions: int = 3
    max_total_exposure_pct: float = 0.15   # all open positions together
    min_trade_usd: float = 0.50            # skip dust trades
    max_price_impact_pct: float = 0.02     # estimated slippage from pool depth
    # Daily loss limit vs equity at the start of the UTC day. When hit, no new
    # entries until the next day (open positions are still managed).
    daily_loss_limit_pct: float = 0.10
    # Drawdown from peak equity that pauses the bot. Paused means no new
    # trades until you run `python -m memebot resume`.
    max_drawdown_pct: float = 0.25
    flatten_on_pause: bool = True          # close everything when paused
    # Exits.
    stop_loss_pct: float = 0.12
    take_profit_pct: float = 0.30
    trailing_stop_pct: float = 0.10
    trailing_activation_pct: float = 0.10  # trailing stop arms after +10%
    max_hold_minutes: float = 180
    rug_liquidity_drop_pct: float = 0.50   # exit if pool liquidity halves
    reentry_cooldown_minutes: float = 60
    max_missing_quotes: int = 5            # exit at last price after N failed quotes


@dataclass
class ExecutionConfig:
    """Paper fill model. Tune it pessimistic: paper always beats live."""

    fee_pct: float = 0.0025                # DEX/aggregator fee per swap
    base_slippage_pct: float = 0.005       # always paid, on top of price impact
    network_fee_usd: float = 0.002         # per transaction (Solana priority fee)


@dataclass
class BotConfig:
    starting_capital: float = 50.0
    # "paper" (default) or "live". Live is not implemented; see executor.py.
    mode: str = "paper"
    data_dir: str = "data"
    # Terminal dashboard: print every N ticks (0 = only at the end).
    dashboard_every_ticks: int = 60
    # Clear the terminal before each dashboard (nice for live runs).
    dashboard_clear_screen: bool = False
    market: MarketConfig = field(default_factory=MarketConfig)
    scout: ScoutConfig = field(default_factory=ScoutConfig)
    safety: SafetyConfig = field(default_factory=SafetyConfig)
    risk: RiskConfig = field(default_factory=RiskConfig)
    execution: ExecutionConfig = field(default_factory=ExecutionConfig)

    def to_dict(self) -> dict:
        return asdict(self)


class ConfigError(ValueError):
    pass


def _merge(dc: Any, data: dict, path: str = "") -> None:
    """Copy JSON values onto a dataclass instance, recursing into sections."""
    known = {f.name: f for f in fields(dc)}
    for key, value in data.items():
        if key.startswith("_"):          # allow "_comment" keys in JSON
            continue
        if key not in known:
            raise ConfigError(f"Unknown config key: {path}{key}")
        current = getattr(dc, key)
        if is_dataclass(current):
            if not isinstance(value, dict):
                raise ConfigError(f"{path}{key} must be an object")
            _merge(current, value, f"{path}{key}.")
        else:
            if isinstance(current, float) and isinstance(value, int):
                value = float(value)
            setattr(dc, key, value)


def validate(cfg: BotConfig) -> None:
    r = cfg.risk
    errors = []
    if cfg.starting_capital <= 0:
        errors.append("starting_capital must be > 0")
    if cfg.mode not in ("paper", "live"):
        errors.append('mode must be "paper" or "live"')
    if not 0 < r.risk_per_trade_pct <= HARD_MAX_RISK_PER_TRADE:
        errors.append(f"risk.risk_per_trade_pct must be in (0, {HARD_MAX_RISK_PER_TRADE}]")
    if not 0 < r.daily_loss_limit_pct <= HARD_MAX_DAILY_LOSS:
        errors.append(f"risk.daily_loss_limit_pct must be in (0, {HARD_MAX_DAILY_LOSS}]")
    if not 0 < r.max_drawdown_pct <= HARD_MAX_DRAWDOWN:
        errors.append(f"risk.max_drawdown_pct must be in (0, {HARD_MAX_DRAWDOWN}]")
    if not 1 <= r.max_concurrent_positions <= HARD_MAX_CONCURRENT_POSITIONS:
        errors.append(f"risk.max_concurrent_positions must be 1..{HARD_MAX_CONCURRENT_POSITIONS}")
    if not 0 < r.max_total_exposure_pct <= 1:
        errors.append("risk.max_total_exposure_pct must be in (0, 1]")
    if not 0 < r.stop_loss_pct < 1:
        errors.append("risk.stop_loss_pct must be in (0, 1)")
    if r.take_profit_pct <= 0 or r.trailing_stop_pct <= 0:
        errors.append("risk.take_profit_pct and risk.trailing_stop_pct must be > 0")
    if cfg.market.source not in ("simulated", "dexscreener"):
        errors.append('market.source must be "simulated" or "dexscreener"')
    if not cfg.market.chains:
        errors.append("market.chains must list at least one chain")
    valid_unknown = {"lp_locked", "mint_authority", "freeze_authority", "top10_holders",
                     "single_holder", "holder_count", "token_age", "honeypot", "sell_tax"}
    bad = set(cfg.safety.allow_unknown) - valid_unknown
    if bad:
        errors.append(f"safety.allow_unknown has unknown check names: {sorted(bad)}")
    if errors:
        raise ConfigError("Invalid config:\n  - " + "\n  - ".join(errors))


def load_config(path: str | None = None, overrides: dict | None = None) -> BotConfig:
    """Build a config from defaults, an optional JSON file and CLI overrides."""
    cfg = BotConfig()
    if path:
        if not os.path.exists(path):
            raise ConfigError(f"Config file not found: {path}")
        with open(path, "r", encoding="utf-8") as fh:
            _merge(cfg, json.load(fh))
    if overrides:
        _merge(cfg, overrides)
    validate(cfg)
    return cfg
