"""Market data sources. ``build_source`` picks one from the config."""

from __future__ import annotations

from ..config import BotConfig
from .base import MarketDataSource


def build_source(cfg: BotConfig) -> MarketDataSource:
    if cfg.market.source == "simulated":
        from .simulated import SimulatedMarket
        return SimulatedMarket(cfg.market)
    if cfg.market.source == "dexscreener":
        from .dexscreener import DexScreenerSource
        return DexScreenerSource(cfg.market)
    raise ValueError(f"Unknown market source: {cfg.market.source}")


__all__ = ["MarketDataSource", "build_source"]
