"""Command-line entry point.

    python -m memebot run [--source simulated|dexscreener] [--ticks N] [--web]
    python -m memebot status
    python -m memebot export [--format csv|json|both] [--out DIR]
    python -m memebot resume        # clear a drawdown pause
    python -m memebot reset         # wipe state and logs for a source
    python -m memebot web           # dashboard for a saved state

Run ``python -m memebot <command> --help`` for options.
"""

from __future__ import annotations

import argparse
import logging
import os
import sys

from .agents import Journal
from .agents.journal import read_jsonl
from .config import ConfigError, load_config
from .dashboard.terminal import print_dashboard, render


def _overrides(args) -> dict:
    o: dict = {}
    if getattr(args, "source", None):
        o.setdefault("market", {})["source"] = args.source
    if getattr(args, "chains", None):
        o.setdefault("market", {})["chains"] = [c.strip() for c in args.chains.split(",") if c.strip()]
    if getattr(args, "capital", None) is not None:
        o["starting_capital"] = args.capital
    if getattr(args, "risk", None) is not None:
        o.setdefault("risk", {})["risk_per_trade_pct"] = args.risk
    if getattr(args, "max_positions", None) is not None:
        o.setdefault("risk", {})["max_concurrent_positions"] = args.max_positions
    if getattr(args, "seed", None) is not None:
        o.setdefault("market", {})["sim_seed"] = args.seed
    return o


def _setup(args):
    cfg = load_config(args.config, _overrides(args))
    data_dir = os.path.join(cfg.data_dir, cfg.market.source)
    return cfg, data_dir


def cmd_run(args) -> int:
    from .data import build_source
    from .orchestrator import Orchestrator

    cfg, data_dir = _setup(args)
    journal = Journal(data_dir, echo=args.verbose)
    simulated = cfg.market.source == "simulated"
    if simulated or args.fresh:
        # A simulator restarts its clock and market every run, so its old
        # state can't be resumed. Live state is kept unless --fresh.
        journal.reset()
    source = build_source(cfg)
    bot = Orchestrator(cfg, source, journal, resume=not simulated,
                       save_every_ticks=60 if simulated else 1)

    if args.web is not None:
        from .dashboard.web import serve
        serve(bot.get_view, host=args.host, port=args.web)
        print(f"Web dashboard: http://{args.host}:{args.web}/")

    every = cfg.dashboard_every_ticks
    max_ticks = args.ticks if args.ticks is not None else (1440 if simulated else None)
    print(f"Starting {cfg.mode.upper()} bot: source={cfg.market.source} chains={cfg.market.chains} "
          f"capital=${bot.portfolio.starting_capital:.2f} risk/trade={cfg.risk.risk_per_trade_pct:.1%} "
          f"max positions={cfg.risk.max_concurrent_positions} "
          f"ticks={'unlimited' if max_ticks is None else max_ticks}")
    print(f"Logs and state: {os.path.abspath(data_dir)}   (Ctrl+C to stop)")

    def on_tick(b):
        if every and b.tick % every == 0:
            print_dashboard(b.get_view(), clear=cfg.dashboard_clear_screen)

    try:
        bot.run(max_ticks=max_ticks, on_tick=on_tick)
    except KeyboardInterrupt:
        print("\nStopping (state saved).")
    if not (every and bot.tick % every == 0):     # avoid printing it twice
        print_dashboard(bot.get_view())
    if args.web is not None and args.keep_web:
        print("Run finished; dashboard still serving. Ctrl+C to exit.")
        try:
            import time
            while True:
                time.sleep(3600)
        except KeyboardInterrupt:
            pass
    return 0


def _load_view(data_dir: str) -> dict:
    j = Journal(data_dir)
    state = j.load_state() or {}
    if state:
        eq = read_jsonl(j.equity_path)[-2000:]
        state["equity_curve"] = [{"t": e["ts"], "equity": e["equity"]} for e in eq]
    return state


def cmd_status(args) -> int:
    cfg, data_dir = _setup(args)
    view = _load_view(data_dir)
    if not view:
        print(f"No saved state in {data_dir}. Run `python -m memebot run` first.")
        return 1
    print(render(view, max_trades=args.trades))
    return 0


def cmd_export(args) -> int:
    cfg, data_dir = _setup(args)
    out = args.out or os.path.join(data_dir, "export")
    paths = Journal(data_dir).export(out, args.format)
    for p in paths:
        print("wrote", p)
    return 0


def cmd_resume(args) -> int:
    cfg, data_dir = _setup(args)
    j = Journal(data_dir)
    state = j.load_state()
    if not state:
        print("No saved state.")
        return 1
    pf = state["portfolio"]
    if not pf.get("paused"):
        print("Bot is not paused.")
        return 0
    print(f"Clearing pause: {pf.get('pause_reason')}")
    # Reset the peak to current equity so the drawdown stop measures from here.
    from .portfolio import Portfolio
    p = Portfolio.from_dict(pf)
    p.paused, p.pause_reason = False, ""
    p.peak_equity = p.equity()
    state["portfolio"] = p.to_dict()
    state["status"] = "DAILY_HALT" if p.daily_halt else "ACTIVE"
    j.save_state(state)
    import time
    j.decision(time.time(), state.get("tick", 0), "operator", "resume",
               new_peak_equity=round(p.peak_equity, 4))
    print(f"Resumed. Drawdown now measured from ${p.peak_equity:.2f}.")
    return 0


def cmd_reset(args) -> int:
    cfg, data_dir = _setup(args)
    if not args.yes:
        ans = input(f"Delete state and logs in {data_dir}? [y/N] ")
        if ans.strip().lower() != "y":
            print("Cancelled.")
            return 1
    for p in Journal(data_dir).reset():
        print("deleted", p)
    return 0


def cmd_web(args) -> int:
    from .dashboard.web import serve
    cfg, data_dir = _setup(args)
    print(f"Serving {data_dir} on http://{args.host}:{args.port}/  (Ctrl+C to stop)")
    try:
        serve(lambda: _load_view(data_dir), host=args.host, port=args.port, background=False)
    except KeyboardInterrupt:
        pass
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(prog="memebot", description="Paper-trading memecoin bot")
    sub = ap.add_subparsers(dest="cmd", required=True)

    def common(p):
        p.add_argument("--config", "-c", help="JSON config file (see config.example.json)")
        p.add_argument("--source", choices=["simulated", "dexscreener"], help="market data source")

    r = sub.add_parser("run", help="run the bot")
    common(r)
    r.add_argument("--ticks", type=int, help="stop after N ticks (sim default 1440 = 1 day)")
    r.add_argument("--capital", type=float, help="starting capital in USD")
    r.add_argument("--risk", type=float, help="fraction of equity per trade, max 0.05")
    r.add_argument("--max-positions", type=int, help="max concurrent positions")
    r.add_argument("--chains", help="comma-separated chains, e.g. solana,base")
    r.add_argument("--seed", type=int, help="simulator random seed")
    r.add_argument("--fresh", action="store_true", help="ignore saved live state and start over")
    r.add_argument("--web", type=int, nargs="?", const=8050, help="also serve the web dashboard (port, default 8050)")
    r.add_argument("--host", default="127.0.0.1", help="web dashboard bind address")
    r.add_argument("--keep-web", action="store_true", help="keep the dashboard up after the run ends")
    r.add_argument("--verbose", "-v", action="store_true", help="print every decision")
    r.set_defaults(func=cmd_run)

    s = sub.add_parser("status", help="show the dashboard for saved state")
    common(s)
    s.add_argument("--trades", type=int, default=20, help="how many recent trades to show")
    s.set_defaults(func=cmd_status)

    e = sub.add_parser("export", help="export trades, decisions and equity to CSV/JSON")
    common(e)
    e.add_argument("--format", choices=["csv", "json", "both"], default="both")
    e.add_argument("--out", help="output directory (default <data_dir>/<source>/export)")
    e.set_defaults(func=cmd_export)

    rs = sub.add_parser("resume", help="clear a drawdown pause (stop the running bot first, "
                                       "or it will overwrite the change)")
    common(rs)
    rs.set_defaults(func=cmd_resume)

    rt = sub.add_parser("reset", help="delete saved state and logs")
    common(rt)
    rt.add_argument("--yes", "-y", action="store_true", help="don't ask for confirmation")
    rt.set_defaults(func=cmd_reset)

    w = sub.add_parser("web", help="serve the web dashboard for saved state")
    common(w)
    w.add_argument("--port", type=int, default=8050)
    w.add_argument("--host", default="127.0.0.1")
    w.set_defaults(func=cmd_web)
    return ap


def main(argv=None) -> int:
    logging.basicConfig(level=logging.WARNING, format="%(levelname)s %(name)s: %(message)s")
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except ConfigError as e:
        print(e, file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
