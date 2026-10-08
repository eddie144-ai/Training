"""Interface every market data source implements.

To add a new source (Birdeye, a websocket feed, your own indexer...), subclass
``MarketDataSource`` and register it in ``memebot/data/__init__.py``. The rest
of the bot only talks to this interface.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Dict, Iterable, List

from ..models import TokenSnapshot


class MarketDataSource(ABC):
    name: str = "base"

    @abstractmethod
    def now(self) -> float:
        """Current time (epoch seconds). Simulated sources return sim time."""

    @abstractmethod
    def scan(self) -> List[TokenSnapshot]:
        """Return the discovery universe: tokens the scout may consider.
        Safety fields may be left as None."""

    @abstractmethod
    def quote(self, addresses: Iterable[str]) -> Dict[str, TokenSnapshot]:
        """Fresh market data for specific tokens (open positions).
        Tokens that can't be quoted are simply missing from the result."""

    @abstractmethod
    def enrich_safety(self, snap: TokenSnapshot) -> TokenSnapshot:
        """Fill the safety fields (LP lock, authorities, holders...).
        Anything that can't be determined stays None."""

    @abstractmethod
    def wait_next_tick(self) -> None:
        """Block until the next tick (sleep for live, advance clock for sim)."""
