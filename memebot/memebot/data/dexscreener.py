"""Live market data from public, key-less APIs (read-only, no wallet).

* DexScreener (https://docs.dexscreener.com/api/reference)
    - token-profiles/latest and token-boosts/latest  -> discovery of new tokens
    - latest/dex/tokens/{addr,addr,...}             -> price, liquidity, volume,
                                                       txns, price change, age
* RugCheck (https://api.rugcheck.xyz) for Solana safety data
    - mint / freeze authority, top holders, LP locked %, holder count

Field formats can change without notice, so every value is parsed
defensively: anything missing or malformed becomes None, and the safety
filter treats None as a failure (fail closed).

Non-Solana chains get no safety enrichment here, so with default settings
they will never pass the filter. Add a provider (for example honeypot.is for
EVM chains) in ``enrich_safety`` before trading them.
"""

from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ..config import MarketConfig
from ..models import TokenSnapshot
from .base import MarketDataSource

log = logging.getLogger(__name__)

DEXSCREENER = "https://api.dexscreener.com"
RUGCHECK = "https://api.rugcheck.xyz/v1"
USER_AGENT = "memebot-paper/1.0 (+paper trading research)"
SAFETY_CACHE_SECONDS = 15 * 60
MAX_TOKENS_PER_PAIR_CALL = 30   # DexScreener limit


def _f(x: Any) -> Optional[float]:
    try:
        return None if x is None else float(x)
    except (TypeError, ValueError):
        return None


def parse_pair(pair: dict, now: float) -> Optional[TokenSnapshot]:
    """Turn one DexScreener pair object into a TokenSnapshot (or None)."""
    base = pair.get("baseToken") or {}
    price = _f(pair.get("priceUsd"))
    liq = _f((pair.get("liquidity") or {}).get("usd"))
    if not base.get("address") or price is None or price <= 0 or liq is None:
        return None
    vol = pair.get("volume") or {}
    chg = pair.get("priceChange") or {}
    m5 = (pair.get("txns") or {}).get("m5") or {}
    created_ms = _f(pair.get("pairCreatedAt"))
    return TokenSnapshot(
        address=base["address"],
        symbol=str(base.get("symbol") or "?")[:12],
        chain=str(pair.get("chainId") or ""),
        price_usd=price,
        liquidity_usd=liq,
        timestamp=now,
        pair_address=str(pair.get("pairAddress") or ""),
        volume_5m=_f(vol.get("m5")) or 0.0,
        volume_1h=_f(vol.get("h1")) or 0.0,
        volume_24h=_f(vol.get("h24")) or 0.0,
        # DexScreener reports percent (5.2 = +5.2%); the bot uses fractions.
        price_change_5m=(_f(chg.get("m5")) or 0.0) / 100,
        price_change_1h=(_f(chg.get("h1")) or 0.0) / 100,
        price_change_24h=(_f(chg.get("h24")) or 0.0) / 100,
        buys_5m=int(_f(m5.get("buys")) or 0),
        sells_5m=int(_f(m5.get("sells")) or 0),
        market_cap=_f(pair.get("marketCap")) or _f(pair.get("fdv")),
        created_at=created_ms / 1000 if created_ms else None,
    )


def parse_rugcheck(report: dict) -> Dict[str, Any]:
    """Extract safety fields from a RugCheck /report response."""
    out: Dict[str, Any] = {}
    if "mintAuthority" in report:
        out["mint_authority_revoked"] = report.get("mintAuthority") in (None, "")
    if "freezeAuthority" in report:
        out["freeze_authority_revoked"] = report.get("freezeAuthority") in (None, "")

    # Top holders, excluding AMM pool / known program accounts (the pool
    # itself always holds a big share and isn't a whale).
    known = report.get("knownAccounts") or {}
    holders = report.get("topHolders")
    if isinstance(holders, list) and holders:
        pcts = []
        for h in holders:
            addr, owner = h.get("address"), h.get("owner")
            kind = ((known.get(owner) or known.get(addr) or {}).get("type") or "").upper()
            if kind in ("AMM", "LOCKER"):
                continue
            pct = _f(h.get("pct"))
            if pct is not None:
                pcts.append(pct / 100 if pct > 1 else pct)
        pcts.sort(reverse=True)
        if pcts:
            out["top_holder_pct"] = pcts[0]
            out["top10_holder_pct"] = sum(pcts[:10])

    # LP locked %: take the deepest market.
    markets = report.get("markets")
    if isinstance(markets, list) and markets:
        best: Tuple[float, Optional[float]] = (-1.0, None)
        for m in markets:
            lp = m.get("lp") or {}
            locked = _f(lp.get("lpLockedPct"))
            depth = (_f(lp.get("quoteUSD")) or 0) + (_f(lp.get("baseUSD")) or 0)
            if locked is not None and depth > best[0]:
                best = (depth, locked / 100 if locked > 1 else locked)
        if best[1] is not None:
            out["lp_locked_pct"] = best[1]

    total = _f(report.get("totalHolders"))
    if total is not None:
        out["holder_count"] = int(total)
    return out


class DexScreenerSource(MarketDataSource):
    name = "dexscreener"

    def __init__(self, cfg: MarketConfig):
        self.cfg = cfg
        self.chains = {c.lower() for c in cfg.chains}
        self._safety_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}
        self._tick_started = time.time()

    # ------------------------------------------------------------- helpers
    def _get(self, url: str) -> Any:
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                                   "Accept": "application/json"})
        for attempt in range(3):
            try:
                with urllib.request.urlopen(req, timeout=self.cfg.http_timeout_seconds) as r:
                    return json.loads(r.read().decode("utf-8"))
            except urllib.error.HTTPError as e:
                if e.code == 429 and attempt < 2:      # rate limited: back off
                    time.sleep(2 ** (attempt + 1))
                    continue
                log.warning("HTTP %s for %s", e.code, url)
                return None
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as e:
                if attempt < 2:
                    time.sleep(1 + attempt)
                    continue
                log.warning("Request failed for %s: %s", url, e)
                return None
        return None

    def _pairs_for(self, addresses: List[str]) -> Dict[str, TokenSnapshot]:
        """Best (deepest) pair per token, for tokens on watched chains."""
        now = self.now()
        best: Dict[str, TokenSnapshot] = {}
        for i in range(0, len(addresses), MAX_TOKENS_PER_PAIR_CALL):
            chunk = addresses[i:i + MAX_TOKENS_PER_PAIR_CALL]
            data = self._get(f"{DEXSCREENER}/latest/dex/tokens/{','.join(chunk)}")
            for pair in (data or {}).get("pairs") or []:
                snap = parse_pair(pair, now)
                if snap is None or snap.chain.lower() not in self.chains:
                    continue
                if snap.address not in chunk:      # token was the quote side
                    continue
                cur = best.get(snap.address)
                if cur is None or snap.liquidity_usd > cur.liquidity_usd:
                    best[snap.address] = snap
        return best

    # ----------------------------------------------------------------- API
    def now(self) -> float:
        return time.time()

    def scan(self) -> List[TokenSnapshot]:
        self._tick_started = time.time()
        addresses: List[str] = list(self.cfg.watchlist)
        for path in ("/token-profiles/latest/v1", "/token-boosts/latest/v1"):
            data = self._get(DEXSCREENER + path)
            if isinstance(data, list):
                for item in data:
                    if str(item.get("chainId", "")).lower() in self.chains:
                        addr = item.get("tokenAddress")
                        if addr and addr not in addresses:
                            addresses.append(addr)
        return list(self._pairs_for(addresses).values())

    def quote(self, addresses: Iterable[str]) -> Dict[str, TokenSnapshot]:
        return self._pairs_for(list(addresses))

    def enrich_safety(self, snap: TokenSnapshot) -> TokenSnapshot:
        if snap.chain.lower() != "solana":
            return snap                      # no provider: stays unknown
        cached = self._safety_cache.get(snap.address)
        if cached and time.time() - cached[0] < SAFETY_CACHE_SECONDS:
            fields = cached[1]
        else:
            report = self._get(f"{RUGCHECK}/tokens/{snap.address}/report")
            fields = parse_rugcheck(report) if isinstance(report, dict) else {}
            self._safety_cache[snap.address] = (time.time(), fields)
        for k, v in fields.items():
            setattr(snap, k, v)
        snap.safety_source = "rugcheck" if fields else "unavailable"
        return snap

    def wait_next_tick(self) -> None:
        # Sleep out the rest of the interval measured from the tick's scan.
        delay = self.cfg.poll_interval_seconds - (time.time() - self._tick_started)
        if delay > 0:
            time.sleep(delay)
