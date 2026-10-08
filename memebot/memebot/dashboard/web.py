"""Tiny read-only web dashboard (standard library only).

    GET /            the dashboard page (polls /api/state every few seconds)
    GET /api/state   JSON: status, stats, open positions, trades, equity curve

It binds to 127.0.0.1 by default. It has no auth and no write endpoints;
if you expose it beyond localhost (e.g. on a VPS), put it behind a reverse
proxy with auth or an SSH tunnel.
"""

from __future__ import annotations

import json
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Callable

PAGE = r"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Memebot Paper Dashboard</title>
<style>
:root{--bg:#f6f7f9;--card:#fff;--fg:#1b1f24;--mut:#6a737d;--line:#e3e6ea;--up:#16833a;--dn:#c62828;--warn:#b26a00;--acc:#3b5bdb}
@media (prefers-color-scheme:dark){:root{--bg:#0f1216;--card:#171b21;--fg:#e6e8eb;--mut:#8b949e;--line:#262c34;--up:#3fb950;--dn:#f85149;--warn:#d29922;--acc:#7c93ff}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
main{max-width:1100px;margin:0 auto;padding:16px}
header{display:flex;flex-wrap:wrap;gap:8px 16px;align-items:baseline;margin-bottom:12px}
h1{font-size:20px;margin:0}.mut{color:var(--mut)}.badge{padding:2px 8px;border-radius:999px;font-weight:600;font-size:12px;border:1px solid currentColor}
.ACTIVE{color:var(--up)}.DAILY_HALT{color:var(--warn)}.PAUSED{color:var(--dn)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:12px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px}
.k{font-size:12px;color:var(--mut)}.v{font-size:20px;font-weight:600;font-variant-numeric:tabular-nums}
.up{color:var(--up)}.dn{color:var(--dn)}
h2{font-size:15px;margin:18px 0 8px}
.tbl{overflow-x:auto}table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums}
th,td{padding:6px 8px;border-bottom:1px solid var(--line);text-align:right;white-space:nowrap}
th:first-child,td:first-child{text-align:left}th{color:var(--mut);font-weight:500;font-size:12px}
svg{width:100%;height:120px;display:block}
.note{font-size:12px;color:var(--mut);margin-top:16px}
</style></head><body><main>
<header><h1>Memebot</h1><span id="mode" class="badge mut"></span><span id="status" class="badge"></span>
<span class="mut" id="meta"></span></header>
<div id="pause" class="card PAUSED" style="display:none;margin-bottom:12px"></div>
<div class="grid" id="kpis"></div>
<div class="card"><div class="k">Equity curve</div><svg id="curve" viewBox="0 0 1000 120" preserveAspectRatio="none"></svg></div>
<h2>Open positions</h2><div class="card tbl"><table id="pos"></table></div>
<h2>Trade history</h2><div class="card tbl"><table id="trades"></table></div>
<p class="note">Paper trading. Simulated fills are optimistic compared with real on-chain execution. Not financial advice.</p>
</main><script>
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd=x=>(x<0?"-":"")+"$"+Math.abs(x).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:Math.abs(x)<0.01&&x!==0?4:2});
const susd=x=>(x>0?"+":"")+usd(x);
const pct=x=>(x>=0?"+":"")+(x*100).toFixed(1)+"%";
const cls=x=>x>0?"up":x<0?"dn":"";
const px=x=>x<0.001?x.toExponential(3):x.toFixed(6);
const tm=t=>new Date(t*1000).toISOString().slice(5,16).replace("T"," ");
function kpi(k,v,c=""){return `<div class="card"><div class="k">${esc(k)}</div><div class="v ${c}">${v}</div></div>`}
function table(el,head,rows){el.innerHTML="<tr>"+head.map(h=>`<th>${esc(h)}</th>`).join("")+"</tr>"+(rows.length?rows.join(""):`<tr><td class="mut" colspan="${head.length}">None</td></tr>`)}
async function load(){
 let v;try{v=await (await fetch("api/state",{cache:"no-store"})).json()}catch(e){$("meta").textContent="Disconnected";return}
 if(!v||!v.stats){$("meta").textContent="Waiting for first tick...";return}
 const s=v.stats,p=v.portfolio;
 $("mode").textContent=(v.mode||"paper").toUpperCase()+" MODE";
 $("status").textContent=v.status;$("status").className="badge "+v.status;
 $("meta").textContent=`source ${v.source} · tick ${v.tick} · ${v.time}`;
 $("pause").style.display=v.status==="PAUSED"?"block":"none";
 $("pause").textContent="Paused: "+(v.pause_reason||"")+". Run: python -m memebot resume";
 $("kpis").innerHTML=kpi("Equity",usd(s.equity))+kpi("Return",pct(s.total_return_pct),cls(s.total_return_pct))+
  kpi("Cash",usd(s.cash))+kpi("Today",susd(s.day_pnl),cls(s.day_pnl))+kpi("Drawdown",(s.drawdown_pct*100).toFixed(1)+"%",s.drawdown_pct>0?"dn":"")+
  kpi("Win rate",(s.win_rate*100).toFixed(0)+"% <span class='mut' style='font-size:12px'>"+s.wins+"W/"+s.losses+"L</span>")+
  kpi("Profit factor",s.profit_factor==null?"–":s.profit_factor)+kpi("Fees paid",usd(s.fees_paid));
 const c=v.equity_curve||[];if(c.length>1){const ys=c.map(d=>d.equity),lo=Math.min(...ys),hi=Math.max(...ys),r=hi-lo||1;
  const pts=ys.map((y,i)=>`${(i/(ys.length-1)*1000).toFixed(1)},${(112-(y-lo)/r*104).toFixed(1)}`).join(" ");
  const base=112-(s.starting_capital-lo)/r*104;
  $("curve").innerHTML=(s.starting_capital>=lo&&s.starting_capital<=hi?`<line x1="0" x2="1000" y1="${base}" y2="${base}" stroke="var(--line)" stroke-dasharray="4 4"/>`:"")+
   `<polyline fill="none" stroke="var(--acc)" stroke-width="2" vector-effect="non-scaling-stroke" points="${pts}"/>`}
 table($("pos"),["Symbol","Entry","Last","Cost","Value","P&L","Opened"],(p.positions||[]).map(o=>{const val=o.qty*o.last_price,pl=val-o.cost_usd;
  return `<tr><td>${esc(o.symbol)}</td><td>${px(o.entry_price)}</td><td>${px(o.last_price)}</td><td>${usd(o.cost_usd)}</td><td>${usd(val)}</td><td class="${cls(pl)}">${susd(pl)}</td><td>${tm(o.opened_at)}</td></tr>`}));
 table($("trades"),["Symbol","Closed","Cost","P&L","%","Held","Reason"],(p.trades||[]).slice(-50).reverse().map(t=>
  `<tr><td>${esc(t.symbol)}</td><td>${tm(t.closed_at)}</td><td>${usd(t.cost_usd)}</td><td class="${cls(t.pnl_usd)}">${susd(t.pnl_usd)}</td><td class="${cls(t.pnl_pct)}">${pct(t.pnl_pct)}</td><td>${Math.round(t.hold_minutes)}m</td><td>${esc(t.exit_reason)}</td></tr>`));
}
load();setInterval(load,3000);
</script></body></html>"""


API_MAX_TRADES = 100     # the page shows the last 50; keeps replies small on phones


def _trim(view: dict) -> dict:
    """Send only recent trades; totals are already in view["stats"]."""
    trades = (view.get("portfolio") or {}).get("trades")
    if not trades or len(trades) <= API_MAX_TRADES:
        return view
    view = dict(view)
    view["portfolio"] = dict(view["portfolio"], trades=trades[-API_MAX_TRADES:])
    return view


class _QuietServer(ThreadingHTTPServer):
    daemon_threads = True

    def handle_error(self, request, client_address):
        import sys
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError)):
            return      # client disconnected; not worth a traceback
        super().handle_error(request, client_address)


def make_handler(get_view: Callable[[], dict]):
    class Handler(BaseHTTPRequestHandler):
        def _send(self, code: int, body: bytes, ctype: str) -> None:
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass    # browser went away mid-reply (tab switched, reload): harmless

        def do_GET(self):  # noqa: N802
            path = self.path.split("?")[0]
            if path in ("/", "/index.html"):
                self._send(200, PAGE.encode("utf-8"), "text/html; charset=utf-8")
            elif path == "/api/state":
                body = json.dumps(_trim(get_view() or {}), default=str).encode("utf-8")
                self._send(200, body, "application/json")
            elif path == "/healthz":
                self._send(200, b"ok", "text/plain")
            else:
                self._send(404, b"not found", "text/plain")

        def log_message(self, *args):  # keep the terminal clean
            pass

    return Handler


def serve(get_view: Callable[[], dict], host: str = "127.0.0.1", port: int = 8050,
          background: bool = True) -> ThreadingHTTPServer:
    server = _QuietServer((host, port), make_handler(get_view))
    if background:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    else:
        server.serve_forever()
    return server
