"""Logger agent: records every decision, trade and equity point.

Files in ``data_dir`` (all append-only except state.json):
  decisions.jsonl  one JSON object per decision from any agent
  trades.jsonl     one JSON object per closed trade
  equity.jsonl     equity, cash and drawdown every tick
  state.json       full portfolio snapshot, rewritten atomically each tick so
                   the bot resumes where it left off after a restart

``export`` writes CSV and/or JSON copies for spreadsheets and analysis.
"""

from __future__ import annotations

import csv
import json
import os
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from ..models import Trade

TRADE_FIELDS = list(Trade.__dataclass_fields__.keys())


def iso(ts: float) -> str:
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_jsonl(path: str) -> List[dict]:
    if not os.path.exists(path):
        return []
    out = []
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                try:
                    out.append(json.loads(line))
                except json.JSONDecodeError:
                    continue      # tolerate a torn last line after a crash
    return out


class Journal:
    name = "logger"

    def __init__(self, data_dir: str, echo: bool = False):
        self.data_dir = data_dir
        self.echo = echo
        os.makedirs(data_dir, exist_ok=True)
        self.decisions_path = os.path.join(data_dir, "decisions.jsonl")
        self.trades_path = os.path.join(data_dir, "trades.jsonl")
        self.equity_path = os.path.join(data_dir, "equity.jsonl")
        self.state_path = os.path.join(data_dir, "state.json")

    # ------------------------------------------------------------- writing
    def _append(self, path: str, record: dict) -> None:
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, default=str) + "\n")

    def decision(self, now: float, tick: int, agent: str, event: str,
                 symbol: str = "", address: str = "", **details: Any) -> None:
        rec = {"ts": now, "time": iso(now), "tick": tick, "agent": agent, "event": event,
               "symbol": symbol, "address": address, **details}
        self._append(self.decisions_path, rec)
        if self.echo:
            extra = " ".join(f"{k}={v}" for k, v in details.items() if k != "reasons")
            print(f"[{iso(now)}] {agent:<8} {event:<16} {symbol:<10} {extra}")

    def trade(self, t: Trade) -> None:
        rec = t.to_dict()
        rec["opened"] = iso(t.opened_at)
        rec["closed"] = iso(t.closed_at)
        self._append(self.trades_path, rec)

    def equity_point(self, now: float, tick: int, stats: Dict[str, Any], status: str) -> None:
        self._append(self.equity_path, {
            "ts": now, "time": iso(now), "tick": tick, "equity": stats["equity"],
            "cash": stats["cash"], "exposure": stats["exposure"],
            "drawdown_pct": stats["drawdown_pct"], "status": status})

    def save_state(self, state: dict) -> None:
        tmp = self.state_path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(state, fh, separators=(",", ":"), default=str)
        os.replace(tmp, self.state_path)     # atomic: never a half-written file

    def load_state(self) -> Optional[dict]:
        if not os.path.exists(self.state_path):
            return None
        with open(self.state_path, "r", encoding="utf-8") as fh:
            return json.load(fh)

    def reset(self) -> List[str]:
        removed = []
        for p in (self.decisions_path, self.trades_path, self.equity_path, self.state_path):
            if os.path.exists(p):
                os.remove(p)
                removed.append(p)
        return removed

    # ------------------------------------------------------------- export
    def export(self, out_dir: str, fmt: str = "both") -> List[str]:
        """Export trades, decisions, equity curve and a summary.
        ``fmt`` is "csv", "json" or "both". Returns written paths."""
        os.makedirs(out_dir, exist_ok=True)
        state = self.load_state() or {}
        trades = state.get("portfolio", {}).get("trades") or read_jsonl(self.trades_path)
        for t in trades:
            t.setdefault("opened", iso(t["opened_at"]))
            t.setdefault("closed", iso(t["closed_at"]))
        decisions = read_jsonl(self.decisions_path)
        equity = read_jsonl(self.equity_path)
        written: List[str] = []

        if fmt in ("json", "both"):
            for name, payload in (("trades.json", trades), ("decisions.json", decisions),
                                  ("equity.json", equity),
                                  ("summary.json", {"stats": state.get("stats"),
                                                    "status": state.get("status"),
                                                    "open_positions": state.get("portfolio", {}).get("positions", []),
                                                    "config": state.get("config")})):
                path = os.path.join(out_dir, name)
                with open(path, "w", encoding="utf-8") as fh:
                    json.dump(payload, fh, indent=1, default=str)
                written.append(path)

        if fmt in ("csv", "both"):
            written.append(self._write_csv(os.path.join(out_dir, "trades.csv"), trades,
                                           ["opened", "closed"] + TRADE_FIELDS))
            dec_fields = ["time", "tick", "agent", "event", "symbol", "address"]
            extra = sorted({k for d in decisions for k in d} - set(dec_fields) - {"ts"})
            written.append(self._write_csv(os.path.join(out_dir, "decisions.csv"), decisions,
                                           dec_fields + extra))
            written.append(self._write_csv(os.path.join(out_dir, "equity.csv"), equity,
                                           ["time", "tick", "equity", "cash", "exposure",
                                            "drawdown_pct", "status"]))
        return written

    @staticmethod
    def _write_csv(path: str, rows: Iterable[dict], columns: List[str]) -> str:
        with open(path, "w", encoding="utf-8", newline="") as fh:
            w = csv.DictWriter(fh, fieldnames=columns, extrasaction="ignore")
            w.writeheader()
            for row in rows:
                w.writerow({k: (json.dumps(v) if isinstance(v, (list, dict)) else v)
                            for k, v in row.items()})
        return path
