"""Plain-text dashboard for the terminal. Works from a state/view dict, so it
can render a running bot or a saved state.json alike."""

from __future__ import annotations

import os
import sys
from datetime import datetime, timezone

_COLOR = sys.stdout.isatty() and not os.environ.get("NO_COLOR")


def _c(text: str, code: str) -> str:
    return f"\033[{code}m{text}\033[0m" if _COLOR else text


def _money(x: float) -> str:
    s = f"${x:,.2f}" if abs(x) >= 0.01 or x == 0 else f"${x:,.4f}"
    return s


def _pnl(x: float, pct: bool = False, width: int = 0) -> str:
    # Pad before colouring so ANSI codes don't break column alignment.
    s = f"{x:+.1%}" if pct else ("+" if x >= 0 else "-") + _money(abs(x))
    return _c(s.rjust(width), "32" if x > 0 else "31" if x < 0 else "0")


def _price(x: float) -> str:
    return f"{x:.3e}" if x < 0.001 else f"{x:.6f}"


def _hhmm(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%m-%d %H:%M")


def render(view: dict, max_trades: int = 10) -> str:
    if not view:
        return "No state yet."
    st = view["stats"]
    p = view["portfolio"]
    status = view["status"]
    status_txt = _c(status, {"ACTIVE": "32", "DAILY_HALT": "33", "PAUSED": "31;1"}.get(status, "0"))
    lines = []
    bar = "=" * 78
    lines.append(bar)
    lines.append(f" MEMEBOT  [{view.get('mode', 'paper').upper()} MODE]  source={view.get('source')}  "
                 f"tick={view.get('tick')}  {view.get('time')}")
    lines.append(f" Status: {status_txt}" + (f"  ({view['pause_reason']})" if status == "PAUSED" else ""))
    lines.append(bar)
    lines.append(f" Equity   {_money(st['equity']):>12}   Return {_pnl(st['total_return_pct'], True, width=8)}"
                 f"   Start  {_money(st['starting_capital'])}")
    lines.append(f" Cash     {_money(st['cash']):>12}   In pos {_money(st['exposure']):>8}"
                 f"   Peak   {_money(st['peak_equity'])}")
    lines.append(f" Today    {_pnl(st['day_pnl'], width=12)}   DD     {st['drawdown_pct']:>8.1%}"
                 f"   Fees   {_money(st['fees_paid'])}")
    pf = st["profit_factor"]
    lines.append(f" Trades {st['trades']:>4}   Win rate {st['win_rate']:.0%}  ({st['wins']}W/{st['losses']}L)"
                 f"   Avg win {_money(st['avg_win'])}  Avg loss {_money(abs(st['avg_loss']))}"
                 f"   PF {pf if pf is not None else '-'}")
    lines.append("-" * 78)
    positions = p.get("positions", [])
    lines.append(f" OPEN POSITIONS ({len(positions)})")
    if positions:
        lines.append(f"  {'symbol':<10}{'entry':>12}{'last':>12}{'cost':>10}{'value':>10}{'P&L':>10}  opened")
        for pos in positions:
            value = pos["qty"] * pos["last_price"]
            pnl = value - pos["cost_usd"]
            lines.append(f"  {pos['symbol']:<10}{_price(pos['entry_price']):>12}{_price(pos['last_price']):>12}"
                         f"{_money(pos['cost_usd']):>10}{_money(value):>10}{_pnl(pnl, width=10)}  {_hhmm(pos['opened_at'])}")
    else:
        lines.append("  (none)")
    lines.append("-" * 78)
    trades = p.get("trades", [])[-max_trades:]
    lines.append(f" RECENT TRADES (last {len(trades)} of {st['trades']})")
    if trades:
        lines.append(f"  {'closed':<12}{'symbol':<10}{'cost':>9}{'P&L':>10}{'%':>8}  {'held':>6}  reason")
        for t in reversed(trades):
            lines.append(f"  {_hhmm(t['closed_at']):<12}{t['symbol']:<10}{_money(t['cost_usd']):>9}"
                         f"{_pnl(t['pnl_usd'], width=10)}{_pnl(t['pnl_pct'], True, width=8)}  {t['hold_minutes']:>5.0f}m  {t['exit_reason']}")
    else:
        lines.append("  (none)")
    lines.append(bar)
    return "\n".join(lines)


def print_dashboard(view: dict, clear: bool = False) -> None:
    if clear and _COLOR:
        sys.stdout.write("\033[2J\033[H")
    print(render(view))
    sys.stdout.flush()
