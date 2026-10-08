"""Offline synthetic memecoin market.

Lets you run thousands of ticks in seconds to check the bot's logic, risk
rules and logging without touching the network. Each tick is one simulated
minute.

The model is deliberately harsh, like the real thing:
  * ~45% of tokens are scams with a high per-minute chance of a rug pull
    (price -85..98%, liquidity drained).
  * Most scams have bad safety data (unlocked LP, live mint authority, a few
    wallets holding everything), but ~30% of them look clean.
  * Prices bleed slowly, with random pump and dump regimes on top.
  * More than half of all pumps are fake breakouts: a few green minutes that
    look identical to a real pump, then a sharp reversal.

Results here say nothing about real profitability. The simulator is a test
harness, not a backtest.
"""

from __future__ import annotations

import math
import random
from collections import deque
from dataclasses import dataclass, field
from typing import Deque, Dict, Iterable, List, Tuple

from ..config import MarketConfig
from ..models import TokenSnapshot
from .base import MarketDataSource

SIM_START = 1_767_225_600.0   # 2026-01-01 00:00 UTC
TICK_SECONDS = 60.0
HISTORY_MINUTES = 24 * 60

_SYLLABLES = ["bon", "pep", "wif", "doge", "moo", "chad", "nyan", "frog", "gig", "pump",
              "zap", "kek", "moon", "cat", "sol", "bork", "yolo", "meow", "ape", "floki"]


@dataclass
class _SimToken:
    address: str
    symbol: str
    created_at: float
    price: float
    liquidity: float
    scam: bool
    rug_hazard: float          # chance per minute of a rug
    bleed: float               # drift per minute outside regimes
    lp_locked_pct: float
    mint_revoked: bool
    freeze_revoked: bool
    top10_pct: float
    top1_pct: float
    holders: int
    regime: str = "drift"
    regime_left: int = 0
    dead: bool = False
    died_at: float = 0.0
    # (ts, price, volume_usd, buys, sells) per minute
    history: Deque[Tuple[float, float, float, int, int]] = field(
        default_factory=lambda: deque(maxlen=HISTORY_MINUTES + 1))
    vol_24h: float = 0.0


class SimulatedMarket(MarketDataSource):
    name = "simulated"

    def __init__(self, cfg: MarketConfig):
        self.cfg = cfg
        self.rng = random.Random(cfg.sim_seed)
        self._now = SIM_START
        self.tokens: Dict[str, _SimToken] = {}
        self._counter = 0
        for _ in range(cfg.sim_initial_tokens):
            age = self.rng.uniform(0, 48 * 60)
            self._spawn(age_minutes=age)

    # ------------------------------------------------------------------ API
    def now(self) -> float:
        return self._now

    def scan(self) -> List[TokenSnapshot]:
        return [self._snapshot(t) for t in self.tokens.values() if not t.dead]

    def quote(self, addresses: Iterable[str]) -> Dict[str, TokenSnapshot]:
        out = {}
        for addr in addresses:
            tok = self.tokens.get(addr)
            if tok is not None:
                out[addr] = self._snapshot(tok)
        return out

    def enrich_safety(self, snap: TokenSnapshot) -> TokenSnapshot:
        tok = self.tokens.get(snap.address)
        if tok is None:
            return snap
        snap.lp_locked_pct = tok.lp_locked_pct
        snap.mint_authority_revoked = tok.mint_revoked
        snap.freeze_authority_revoked = tok.freeze_revoked
        snap.top10_holder_pct = tok.top10_pct
        snap.top_holder_pct = tok.top1_pct
        snap.holder_count = tok.holders
        snap.is_honeypot = False
        snap.sell_tax_pct = 0.0
        snap.safety_source = "simulated"
        return snap

    def wait_next_tick(self) -> None:
        self._now += TICK_SECONDS
        for tok in list(self.tokens.values()):
            self._step(tok, self._now)
            if tok.dead and self._now - tok.died_at > 120 * 60:
                del self.tokens[tok.address]
            elif self._now - tok.created_at > 7 * 24 * 3600:
                del self.tokens[tok.address]
        # Poisson arrivals of new launches.
        lam = self.cfg.sim_new_tokens_per_hour / 60.0
        k = 0
        p = math.exp(-lam)
        u = self.rng.random()
        cdf = p
        while u > cdf and k < 10:
            k += 1
            p *= lam / k
            cdf += p
        for _ in range(k):
            self._spawn(age_minutes=0)

    # ------------------------------------------------------------ internals
    def _spawn(self, age_minutes: float) -> None:
        r = self.rng
        self._counter += 1
        scam = r.random() < 0.45
        stealth = scam and r.random() < 0.30     # scam that looks clean
        looks_bad = scam and not stealth
        sym = (r.choice(_SYLLABLES) + r.choice(_SYLLABLES)).upper()[:8]
        liq_center = 40_000 if scam else 80_000
        tok = _SimToken(
            address=f"SIM{self._counter:05d}{r.getrandbits(32):08x}",
            symbol=sym,
            created_at=self._now - age_minutes * 60,
            price=10 ** r.uniform(-6, -2),
            liquidity=liq_center * math.exp(r.gauss(0, 0.8)),
            scam=scam,
            rug_hazard=(0.002 if stealth else 0.003) if scam else 0.0001,
            bleed=-0.0008 if scam else -0.0002,
            lp_locked_pct=(r.choice([0.0, r.uniform(0, 0.6)]) if looks_bad
                           else (1.0 if r.random() < 0.8 else r.uniform(0.9, 1.0))),
            mint_revoked=(r.random() < 0.4) if looks_bad else (r.random() < 0.97),
            freeze_revoked=(r.random() < 0.5) if looks_bad else (r.random() < 0.97),
            top10_pct=r.uniform(0.4, 0.9) if looks_bad else r.uniform(0.12, 0.34),
            top1_pct=0.0,
            holders=r.randint(50, 600) if looks_bad else r.randint(250, 8000),
        )
        tok.top1_pct = tok.top10_pct * r.uniform(0.15, 0.35)
        self.tokens[tok.address] = tok
        # Warm up some history so 5m/1h/24h stats exist.
        warm = int(min(age_minutes, 180))
        for i in range(warm, 0, -1):
            self._step(tok, self._now - i * TICK_SECONDS)

    def _step(self, tok: _SimToken, ts: float) -> None:
        r = self.rng
        if tok.dead:
            tok.price *= math.exp(r.gauss(-0.002, 0.01))
            self._record(tok, ts, tok.liquidity * 0.0005, 1, 2)
            return
        # Regime switching: pumps and dumps persist for a while.
        if tok.regime_left <= 0:
            x = r.random()
            if tok.regime == "fakeout":
                # A failed breakout reverses hard: late buyers become exit liquidity.
                tok.regime, tok.regime_left = "dump", 3 + int(r.expovariate(1 / 8))
            elif x < (0.02 if tok.scam else 0.012):
                if r.random() < (0.65 if tok.scam else 0.5):
                    tok.regime, tok.regime_left = "fakeout", 2 + r.randint(0, 4)
                else:
                    tok.regime, tok.regime_left = "pump", 1 + int(r.expovariate(1 / 15))
            elif x < 0.03:
                tok.regime, tok.regime_left = "dump", 1 + int(r.expovariate(1 / 10))
            else:
                tok.regime, tok.regime_left = "drift", 1
        tok.regime_left -= 1
        mu, sigma, activity = {
            "pump": (0.010, 0.03, 3.0),
            "fakeout": (0.010, 0.03, 3.0),     # looks exactly like a pump
            "dump": (-0.015, 0.035, 2.0),
            "drift": (tok.bleed, 0.015, 1.0),
        }[tok.regime]
        ret = max(-0.5, mu + sigma * r.gauss(0, 1))
        tok.price *= math.exp(ret)
        tok.liquidity = max(500.0, tok.liquidity * math.exp(0.4 * ret))
        # Rug pull.
        if r.random() < tok.rug_hazard:
            tok.price *= r.uniform(0.02, 0.15)
            tok.liquidity *= 0.03
            tok.dead, tok.died_at = True, ts
            self._record(tok, ts, tok.liquidity * 20, 5, 200)
            return
        volume = tok.liquidity * 0.003 * activity * math.exp(r.gauss(0, 0.5))
        n = max(1, int(volume / 150))
        buy_frac = min(0.9, max(0.1, 0.5 + max(-0.3, min(0.3, ret * 10)) + r.gauss(0, 0.05)))
        buys = int(round(n * buy_frac))
        self._record(tok, ts, volume, buys, n - buys)

    def _record(self, tok, ts, volume, buys, sells) -> None:
        if len(tok.history) == tok.history.maxlen:
            tok.vol_24h -= tok.history[0][2]
        tok.history.append((ts, tok.price, volume, buys, sells))
        tok.vol_24h += volume

    def _snapshot(self, tok: _SimToken) -> TokenSnapshot:
        h = tok.history
        n = len(h)

        def price_ago(minutes: int) -> float:
            idx = max(0, n - 1 - minutes)
            return h[idx][1] if n else tok.price

        # Index from the right end: O(1) on a deque (islice would walk from the left).
        last5 = [h[-i] for i in range(1, min(5, n) + 1)]
        last60 = [h[-i] for i in range(1, min(60, n) + 1)]
        p = tok.price
        return TokenSnapshot(
            address=tok.address,
            symbol=tok.symbol,
            chain="solana",
            price_usd=p,
            liquidity_usd=tok.liquidity,
            timestamp=self._now,
            pair_address=tok.address + "-SOL",
            volume_5m=sum(x[2] for x in last5),
            volume_1h=sum(x[2] for x in last60),
            volume_24h=tok.vol_24h,
            price_change_5m=p / price_ago(5) - 1,
            price_change_1h=p / price_ago(60) - 1,
            price_change_24h=p / price_ago(HISTORY_MINUTES) - 1,
            buys_5m=sum(x[3] for x in last5),
            sells_5m=sum(x[4] for x in last5),
            market_cap=p * 1_000_000_000,
            created_at=tok.created_at,
        )
