"""Unit and integration tests (standard library only).

    python -m unittest discover -s tests -v
"""

import csv
import json
import os
import shutil
import tempfile
import unittest
import urllib.request
from typing import Dict, Iterable, List
from unittest import mock

from memebot.agents import Journal, PaperExecutor, RiskManager, SafetyAgent, ScoutAgent
from memebot.agents.executor import LiveTradingNotAllowed, build_executor
from memebot.config import BotConfig, ConfigError, ExecutionConfig, load_config
from memebot.data.base import MarketDataSource
from memebot.data.dexscreener import parse_pair, parse_rugcheck
from memebot.data.simulated import SimulatedMarket
from memebot.models import Signal, TokenSnapshot
from memebot.orchestrator import Orchestrator
from memebot.portfolio import Portfolio

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
T0 = 1_767_225_600.0


def snap(**kw) -> TokenSnapshot:
    """A token that passes every default safety check."""
    base = dict(address="TOKEN1", symbol="GOOD", chain="solana", price_usd=0.001,
                liquidity_usd=100_000, timestamp=T0, volume_5m=5_000, volume_1h=40_000,
                volume_24h=500_000, price_change_5m=0.05, price_change_1h=0.10,
                buys_5m=60, sells_5m=30, created_at=T0 - 6 * 3600, lp_locked_pct=1.0,
                mint_authority_revoked=True, freeze_authority_revoked=True,
                top10_holder_pct=0.2, top_holder_pct=0.05, holder_count=2000,
                is_honeypot=False, sell_tax_pct=0.0)
    base.update(kw)
    return TokenSnapshot(**base)


class ConfigTests(unittest.TestCase):
    def test_example_config_loads(self):
        cfg = load_config(os.path.join(ROOT, "config.example.json"))
        self.assertEqual(cfg.starting_capital, 50)
        self.assertEqual(cfg.mode, "paper")

    def test_risk_hard_cap(self):
        with self.assertRaises(ConfigError):
            load_config(overrides={"risk": {"risk_per_trade_pct": 0.06}})

    def test_unknown_key_rejected(self):
        with self.assertRaises(ConfigError):
            load_config(overrides={"risk": {"risk_per_trade": 0.03}})

    def test_drawdown_cap(self):
        with self.assertRaises(ConfigError):
            load_config(overrides={"risk": {"max_drawdown_pct": 0.9}})


class SafetyTests(unittest.TestCase):
    def setUp(self):
        self.agent = SafetyAgent(BotConfig().safety)

    def test_clean_token_passes(self):
        v = self.agent.check(snap(), T0)
        self.assertTrue(v.passed, v.failures)

    def test_unknown_data_fails_closed(self):
        v = self.agent.check(snap(lp_locked_pct=None, mint_authority_revoked=None,
                                  top10_holder_pct=None), T0)
        self.assertFalse(v.passed)
        self.assertIn("lp_locked: unknown", v.failures)
        self.assertIn("mint_authority: unknown", v.failures)
        self.assertIn("top10_holders: unknown", v.failures)

    def test_allowed_unknown_is_warning(self):
        v = self.agent.check(snap(is_honeypot=None, sell_tax_pct=None), T0)
        self.assertTrue(v.passed)
        self.assertEqual(len(v.warnings), 2)

    def test_each_red_flag(self):
        cases = {
            "liquidity": dict(liquidity_usd=5_000),
            "lp_locked": dict(lp_locked_pct=0.3),
            "mint_authority": dict(mint_authority_revoked=False),
            "freeze_authority": dict(freeze_authority_revoked=False),
            "top10_holders": dict(top10_holder_pct=0.6),
            "single_holder": dict(top_holder_pct=0.25),
            "holder_count": dict(holder_count=40),
            "token_age": dict(created_at=T0 - 60),
            "honeypot": dict(is_honeypot=True),
            "sell_tax": dict(sell_tax_pct=0.2),
            "volume_24h": dict(volume_24h=1_000),
        }
        for name, kw in cases.items():
            v = self.agent.check(snap(**kw), T0)
            self.assertFalse(v.passed, name)
            self.assertTrue(any(f.startswith(name) for f in v.failures), (name, v.failures))


class RiskTests(unittest.TestCase):
    def setUp(self):
        self.cfg = BotConfig()
        self.risk = RiskManager(self.cfg.risk, self.cfg.execution.network_fee_usd)
        self.p = Portfolio(50.0, T0)

    def test_size_is_risk_pct_of_equity(self):
        d = self.risk.size_entry(Signal(snap(), 1.0), self.p)
        self.assertTrue(d.approved)
        self.assertAlmostEqual(d.usd_amount, 50 * self.cfg.risk.risk_per_trade_pct)
        self.assertLessEqual(d.usd_amount, 50 * 0.05)

    def test_price_impact_caps_size(self):
        d = self.risk.size_entry(Signal(snap(liquidity_usd=60), 1.0), self.p)
        # 2% impact on $60 of liquidity is $0.60 -> capped
        self.assertTrue(d.approved)
        self.assertAlmostEqual(d.usd_amount, 0.6)

    def test_max_positions_blocks(self):
        ex = PaperExecutor(self.cfg.execution)
        for i in range(self.cfg.risk.max_concurrent_positions):
            s = snap(address=f"T{i}")
            self.p.open_position(ex.buy(s, 1.0, T0), s, 1.0)
        d = self.risk.size_entry(Signal(snap(address="NEW"), 1.0), self.p)
        self.assertFalse(d.approved)
        self.assertIn("max concurrent", d.reason)

    def test_daily_loss_limit_halts_then_resets(self):
        self.p.cash = 50 * (1 - self.cfg.risk.daily_loss_limit_pct) - 0.01
        events = self.risk.evaluate_breakers(self.p)
        self.assertTrue(self.p.daily_halt)
        self.assertTrue(any("DAILY_LOSS_LIMIT" in e for e in events))
        self.assertIn("daily loss", self.risk.entry_block_reason(self.p))
        self.risk.roll_day(self.p, T0 + 86400)
        self.assertFalse(self.p.daily_halt)

    def test_drawdown_pauses(self):
        self.p.peak_equity = 100
        self.p.cash = 100 * (1 - self.cfg.risk.max_drawdown_pct)
        self.risk.evaluate_breakers(self.p)
        self.assertTrue(self.p.paused)
        self.assertIn("paused", self.risk.entry_block_reason(self.p))
        # A new day does not clear a pause.
        self.risk.roll_day(self.p, T0 + 86400)
        self.assertTrue(self.p.paused)

    def test_exit_rules(self):
        ex = PaperExecutor(self.cfg.execution)
        s = snap()
        pos = self.p.open_position(ex.buy(s, 1.5, T0), s, 1.0)
        e = pos.entry_price
        r = self.cfg.risk

        def reason(price, liq=100_000, high=None, now=T0 + 60):
            pos.last_price, pos.high_price = price, high or max(price, e)
            return self.risk.exit_reason(pos, snap(price_usd=price, liquidity_usd=liq), now)

        self.assertEqual(reason(e * 1.01), "")
        self.assertEqual(reason(e * (1 - r.stop_loss_pct - 0.01)), "stop_loss")
        self.assertEqual(reason(e * (1 + r.take_profit_pct + 0.01)), "take_profit")
        self.assertEqual(reason(e * 1.05, high=e * 1.25), "trailing_stop")
        self.assertEqual(reason(e, liq=20_000), "liquidity_pulled")
        self.assertEqual(reason(e, now=T0 + r.max_hold_minutes * 60), "time_stop")
        pos.missing_quotes = r.max_missing_quotes
        self.assertEqual(self.risk.exit_reason(pos, None, T0 + 60), "no_quote")


class ExecutorAndPortfolioTests(unittest.TestCase):
    def test_paper_round_trip_accounting(self):
        cfg = ExecutionConfig(fee_pct=0.01, base_slippage_pct=0.0, network_fee_usd=0.01)
        ex = PaperExecutor(cfg)
        p = Portfolio(50.0, T0)
        s = snap(liquidity_usd=1e12)          # ~no price impact
        buy = ex.buy(s, 10.0, T0)
        pos = p.open_position(buy, s, 1.0)
        self.assertAlmostEqual(p.cash, 50 - 10 - 0.01)
        self.assertAlmostEqual(pos.cost_usd, 10.01)
        sell = ex.sell(pos, s, T0 + 60)       # same price
        t = p.close_position(pos, sell, "test", 60)
        # 1% fee in, 1% fee out, 2 network fees
        expected = 9.9 * 0.99 - 0.01
        self.assertAlmostEqual(t.proceeds_usd, expected, places=6)
        self.assertAlmostEqual(t.pnl_usd, expected - 10.01, places=6)
        self.assertAlmostEqual(p.cash, 50 - 10.01 + expected, places=6)
        self.assertEqual(p.stats()["losses"], 1)

    def test_slippage_grows_with_size(self):
        ex = PaperExecutor(ExecutionConfig())
        small = ex.buy(snap(), 1.0, T0)
        big = ex.buy(snap(), 1000.0, T0)
        self.assertGreater(big.price, small.price)

    def test_portfolio_serialisation(self):
        ex = PaperExecutor(ExecutionConfig())
        p = Portfolio(50.0, T0)
        s = snap()
        pos = p.open_position(ex.buy(s, 2.0, T0), s, 0.5)
        p2 = Portfolio.from_dict(json.loads(json.dumps(p.to_dict())))
        self.assertAlmostEqual(p2.cash, p.cash)
        self.assertEqual(p2.positions[pos.id].qty, pos.qty)

    def test_live_mode_needs_env_opt_in(self):
        cfg = BotConfig(mode="live")
        with mock.patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(LiveTradingNotAllowed):
                build_executor(cfg)

    def test_paper_is_default(self):
        self.assertIsInstance(build_executor(BotConfig()), PaperExecutor)


class ScoutTests(unittest.TestCase):
    def test_filters_and_ranks(self):
        cfg = BotConfig()
        scout = ScoutAgent(cfg.scout, ["solana"])
        p = Portfolio(50, T0)
        tokens = [snap(address="A", price_change_5m=0.10),
                  snap(address="B", price_change_5m=0.03),
                  snap(address="C", price_change_5m=0.6),         # too vertical
                  snap(address="D", chain="base"),               # not watched
                  snap(address="E", buys_5m=10, sells_5m=40)]     # sellers in control
        sigs, rejected = scout.scan(tokens, p, T0)
        self.assertEqual([s.snapshot.address for s in sigs], ["A", "B"])
        self.assertEqual(sum(rejected.values()), 3)


class DexScreenerParsingTests(unittest.TestCase):
    def test_parse_pair(self):
        pair = {"chainId": "solana", "pairAddress": "PAIR", "priceUsd": "0.0012",
                "baseToken": {"address": "MINT", "symbol": "WIF"},
                "liquidity": {"usd": 123456.7}, "volume": {"m5": 1000, "h1": 9000, "h24": 200000},
                "priceChange": {"m5": 5.5, "h1": -2, "h24": 40},
                "txns": {"m5": {"buys": 30, "sells": 12}},
                "pairCreatedAt": 1767225600000, "marketCap": 1200000}
        s = parse_pair(pair, T0)
        self.assertEqual(s.address, "MINT")
        self.assertAlmostEqual(s.price_change_5m, 0.055)
        self.assertAlmostEqual(s.price_change_1h, -0.02)
        self.assertEqual(s.created_at, T0)
        self.assertEqual(s.buys_5m, 30)
        self.assertIsNone(parse_pair({"baseToken": {}}, T0))

    def test_parse_rugcheck(self):
        report = {
            "mintAuthority": None, "freezeAuthority": "SomeAuth", "totalHolders": 1500,
            "knownAccounts": {"POOL": {"name": "Raydium", "type": "AMM"}},
            "topHolders": [{"address": "x", "owner": "POOL", "pct": 40.0},
                           {"address": "a", "owner": "a", "pct": 6.0},
                           {"address": "b", "owner": "b", "pct": 4.0}],
            "markets": [{"lp": {"lpLockedPct": 99.5, "quoteUSD": 50000, "baseUSD": 50000}},
                        {"lp": {"lpLockedPct": 10, "quoteUSD": 10, "baseUSD": 10}}],
        }
        f = parse_rugcheck(report)
        self.assertTrue(f["mint_authority_revoked"])
        self.assertFalse(f["freeze_authority_revoked"])
        self.assertAlmostEqual(f["top_holder_pct"], 0.06)   # pool excluded
        self.assertAlmostEqual(f["top10_holder_pct"], 0.10)
        self.assertAlmostEqual(f["lp_locked_pct"], 0.995)
        self.assertEqual(f["holder_count"], 1500)
        self.assertEqual(parse_rugcheck({}), {})


class CrashingMarket(MarketDataSource):
    """Two tokens that pump for a few minutes, then go to zero."""

    name = "crash-test"

    def __init__(self):
        self.t = T0
        self.price = 1.0

    def now(self):
        return self.t

    def _snaps(self) -> List[TokenSnapshot]:
        return [snap(address=f"X{i}", symbol=f"X{i}", price_usd=self.price, timestamp=self.t)
                for i in range(2)]

    def scan(self):
        return self._snaps()

    def quote(self, addresses: Iterable[str]) -> Dict[str, TokenSnapshot]:
        return {s.address: s for s in self._snaps() if s.address in set(addresses)}

    def enrich_safety(self, s):
        return s

    def wait_next_tick(self):
        self.t += 60
        if self.t > T0 + 120:
            self.price *= 0.5


class OrchestratorTests(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp()

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def test_simulated_run_respects_limits_and_exports(self):
        cfg = load_config(overrides={"market": {"sim_seed": 7}})
        journal = Journal(self.dir)
        bot = Orchestrator(cfg, SimulatedMarket(cfg.market), journal, resume=False)
        equity_before_buy = []
        orig_open = bot.portfolio.open_position

        def checked_open(fill, s, score):
            equity_before_buy.append((bot.portfolio.equity(), fill.gross_usd + fill.fee_usd))
            return orig_open(fill, s, score)

        bot.portfolio.open_position = checked_open
        bot.run(max_ticks=600)
        self.assertGreater(len(equity_before_buy), 0, "expected some trades in 10h of sim")
        fee = cfg.execution.network_fee_usd
        for eq, cost in equity_before_buy:
            self.assertLessEqual(cost, eq * cfg.risk.risk_per_trade_pct + fee + 1e-9)
        self.assertGreaterEqual(bot.portfolio.cash, 0)
        self.assertLessEqual(len(bot.portfolio.positions), cfg.risk.max_concurrent_positions)

        out = os.path.join(self.dir, "export")
        paths = journal.export(out, "both")
        self.assertEqual(len(paths), 7)
        with open(os.path.join(out, "trades.csv")) as fh:
            rows = list(csv.DictReader(fh))
        self.assertEqual(len(rows), len(bot.portfolio.trades))
        with open(os.path.join(out, "decisions.json")) as fh:
            agents = {d["agent"] for d in json.load(fh)}
        self.assertTrue({"scout", "safety", "risk", "executor"} <= agents)

    def test_drawdown_pause_flattens_and_persists(self):
        cfg = load_config(overrides={
            "risk": {"risk_per_trade_pct": 0.05, "max_total_exposure_pct": 1.0,
                     "max_drawdown_pct": 0.05, "stop_loss_pct": 0.99,
                     "trailing_stop_pct": 0.99, "rug_liquidity_drop_pct": 0.99}})
        journal = Journal(self.dir)
        bot = Orchestrator(cfg, CrashingMarket(), journal, resume=False)
        bot.run(max_ticks=12)
        self.assertTrue(bot.portfolio.paused)
        self.assertEqual(len(bot.portfolio.positions), 0)
        reasons = {t.exit_reason for t in bot.portfolio.trades}
        self.assertIn("drawdown_pause", reasons)
        # Restart: still paused, no new trades.
        bot2 = Orchestrator(cfg, CrashingMarket(), Journal(self.dir), resume=True)
        self.assertTrue(bot2.portfolio.paused)
        n = len(bot2.portfolio.trades)
        bot2.run(max_ticks=3)
        self.assertEqual(len(bot2.portfolio.trades), n)
        self.assertEqual(len(bot2.portfolio.positions), 0)

    def test_web_dashboard_serves_state(self):
        from memebot.dashboard.web import serve
        cfg = BotConfig()
        bot = Orchestrator(cfg, SimulatedMarket(cfg.market), Journal(self.dir), resume=False)
        bot.run(max_ticks=5)
        server = serve(bot.get_view, port=0)
        try:
            port = server.server_address[1]
            direct = urllib.request.build_opener(urllib.request.ProxyHandler({}))
            with direct.open(f"http://127.0.0.1:{port}/api/state") as r:
                body = r.read()
            self.assertEqual(json.loads(body)["status"], "ACTIVE")
            with direct.open(f"http://127.0.0.1:{port}/") as r:
                page = r.read().decode()
            self.assertIn("Memebot", page)
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
