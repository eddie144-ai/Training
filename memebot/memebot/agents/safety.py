"""Safety filter agent: blocks entries into tokens that look like traps.

Every check must pass. Missing data fails the check ("fail closed") unless
the check name is in ``safety.allow_unknown``. This matters: when RugCheck is
down or rate limited, the bot should sit on its hands, not buy blind.

Checks:
  liquidity        pool liquidity in USD
  lp_locked        share of LP tokens locked or burned (can't be pulled)
  mint_authority   mint authority revoked (no infinite printing)
  freeze_authority freeze authority revoked (your tokens can't be frozen)
  top10_holders    share held by the top 10 wallets (excl. pool)
  single_holder    share held by the largest wallet
  holder_count     number of holders
  token_age        not brand new (launch snipes) and not stale
  volume_24h       enough real trading
  honeypot         you can actually sell
  sell_tax         sell tax not excessive
"""

from __future__ import annotations

from typing import Optional

from ..config import SafetyConfig
from ..models import SafetyVerdict, TokenSnapshot


class SafetyAgent:
    name = "safety"

    def __init__(self, cfg: SafetyConfig):
        self.cfg = cfg

    def _check(self, verdict: SafetyVerdict, name: str, value, ok: Optional[bool],
               detail: str) -> None:
        if value is None:
            if name in self.cfg.allow_unknown:
                verdict.warnings.append(f"{name}: unknown (allowed)")
            else:
                verdict.failures.append(f"{name}: unknown")
        elif not ok:
            verdict.failures.append(f"{name}: {detail}")

    def check(self, s: TokenSnapshot, now: float) -> SafetyVerdict:
        c = self.cfg
        v = SafetyVerdict(passed=False)

        if s.liquidity_usd < c.min_liquidity_usd:
            v.failures.append(f"liquidity: ${s.liquidity_usd:,.0f} < ${c.min_liquidity_usd:,.0f}")
        if s.volume_24h < c.min_volume_24h_usd:
            v.failures.append(f"volume_24h: ${s.volume_24h:,.0f} < ${c.min_volume_24h_usd:,.0f}")

        lp = s.lp_locked_pct
        self._check(v, "lp_locked", lp, lp is not None and lp >= c.min_lp_locked_pct,
                    f"{(lp or 0):.0%} locked < {c.min_lp_locked_pct:.0%}")
        if c.require_mint_authority_revoked:
            self._check(v, "mint_authority", s.mint_authority_revoked,
                        bool(s.mint_authority_revoked), "still enabled")
        if c.require_freeze_authority_revoked:
            self._check(v, "freeze_authority", s.freeze_authority_revoked,
                        bool(s.freeze_authority_revoked), "still enabled")
        t10 = s.top10_holder_pct
        self._check(v, "top10_holders", t10, t10 is not None and t10 <= c.max_top10_holder_pct,
                    f"{(t10 or 0):.0%} > {c.max_top10_holder_pct:.0%}")
        t1 = s.top_holder_pct
        self._check(v, "single_holder", t1, t1 is not None and t1 <= c.max_single_holder_pct,
                    f"{(t1 or 0):.0%} > {c.max_single_holder_pct:.0%}")
        hc = s.holder_count
        self._check(v, "holder_count", hc, hc is not None and hc >= c.min_holder_count,
                    f"{hc} < {c.min_holder_count}")
        age = s.age_minutes(now)
        self._check(v, "token_age", age,
                    age is not None and c.min_token_age_minutes <= age <= c.max_token_age_hours * 60,
                    f"{(age or 0):.0f} min outside "
                    f"[{c.min_token_age_minutes:.0f} min, {c.max_token_age_hours:.0f} h]")
        self._check(v, "honeypot", s.is_honeypot, s.is_honeypot is False, "cannot sell")
        tax = s.sell_tax_pct
        self._check(v, "sell_tax", tax, tax is not None and tax <= c.max_sell_tax_pct,
                    f"{(tax or 0):.0%} > {c.max_sell_tax_pct:.0%}")

        v.passed = not v.failures
        return v
