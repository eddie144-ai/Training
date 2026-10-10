'use strict';
/* Shareable images and files: the "share my week" progress card (drawn on a canvas, 1080 × 1350 for Instagram and
   Reddit) and handing a file to the phone's share sheet (Drive, email, WhatsApp…), with a download as the fallback.
   Pure drawing: the numbers come in from app.js. */
const Share = (() => {
  const W = 1080, H = 1350;
  const C = { bg: '#121211', card: 'rgba(35,35,34,0.86)', text: '#ffffff', text2: '#c3c2b7', muted: '#8e8d85', accent: '#cf4a30', good: '#3fb950', grid: 'rgba(255,255,255,0.10)' };
  const DISPLAY = '"Big Shoulders Display", "Oswald", "Arial Narrow", Impact, sans-serif';
  const BODY = '"Barlow", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

  const loadImage = (src) => new Promise((resolve) => { const i = new Image(); i.onload = () => resolve(i); i.onerror = () => resolve(null); i.src = src; });
  async function fontsReady() {
    try { await Promise.all([document.fonts.load(`800 120px ${DISPLAY}`), document.fonts.load(`600 40px ${BODY}`)]); } catch { /* fall back to system fonts */ }
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function fitText(ctx, text, max) {
    let t = String(text);
    while (t.length > 3 && ctx.measureText(t).width > max) t = `${t.slice(0, -2)}…`;
    return t;
  }

  // d: { title, subtitle, handle, weight: {now, week, total}, trend: [kg…], stats: [[value, label]×3], lifts: [{name, value, change}], footer, background }
  async function weekCard(d) {
    await fontsReady();
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
    const bg = d.background ? await loadImage(d.background) : null;
    if (bg) {
      const s = Math.max(W / bg.width, H / bg.height), bw = bg.width * s, bh = bg.height * s;
      ctx.globalAlpha = 0.55; ctx.drawImage(bg, (W - bw) / 2, (H - bh) * 0.12, bw, bh); ctx.globalAlpha = 1;
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, 'rgba(18,18,17,0.35)'); g.addColorStop(0.45, 'rgba(18,18,17,0.85)'); g.addColorStop(1, 'rgba(18,18,17,0.97)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    const L = 72, R = W - 72;
    ctx.textBaseline = 'alphabetic';
    // Header
    ctx.fillStyle = C.accent; ctx.font = `800 40px ${DISPLAY}`; ctx.letterSpacing = '4px';
    ctx.fillText('IRON & EGGS', L, 112);
    ctx.letterSpacing = '0px';
    ctx.fillStyle = C.text; ctx.font = `800 104px ${DISPLAY}`;
    ctx.fillText(fitText(ctx, d.title.toUpperCase(), R - L), L, 216);
    let y = 272;
    if (d.subtitle) { ctx.fillStyle = C.accent; ctx.font = `700 44px ${BODY}`; ctx.fillText(fitText(ctx, d.subtitle, R - L), L, y); y += 56; }
    if (d.handle) { ctx.fillStyle = C.text2; ctx.font = `600 38px ${BODY}`; ctx.fillText(fitText(ctx, d.handle, R - L), L, y); y += 52; }

    // Weight card with the trend line
    y += 12;
    const wy = y, wh = 336;
    ctx.fillStyle = C.card; roundRect(ctx, L - 24, wy, R - L + 48, wh, 32); ctx.fill();
    ctx.fillStyle = C.text2; ctx.font = `600 34px ${BODY}`; ctx.fillText('BODY WEIGHT', L + 8, wy + 64);
    ctx.fillStyle = C.text; ctx.font = `800 120px ${DISPLAY}`;
    ctx.fillText(d.weight.now, L + 8, wy + 188);
    ctx.font = `600 36px ${BODY}`; ctx.fillStyle = C.text2;
    ctx.fillText(fitText(ctx, [d.weight.week, d.weight.total].filter(Boolean).join('  ·  '), R - L - 16), L + 8, wy + 248);
    const t = d.trend || [];
    if (t.length > 1) {
      const gx = L + 8, gw = R - L - 16, gy = wy + 266, gh = 44;
      const lo = Math.min(...t), hi = Math.max(...t), span = hi - lo || 1;
      const X = (i) => gx + (i / (t.length - 1)) * gw, Y = (v) => gy + gh - ((v - lo) / span) * gh;
      ctx.strokeStyle = C.grid; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, gy + gh); ctx.lineTo(gx + gw, gy + gh); ctx.stroke();
      ctx.strokeStyle = C.accent; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
      ctx.beginPath(); t.forEach((v, i) => (i ? ctx.lineTo(X(i), Y(v)) : ctx.moveTo(X(i), Y(v)))); ctx.stroke();
      ctx.fillStyle = C.accent; ctx.beginPath(); ctx.arc(X(t.length - 1), Y(t[t.length - 1]), 11, 0, Math.PI * 2); ctx.fill();
    }
    y = wy + wh + 24;

    // Three stat tiles
    const tw = (R - L + 48 - 2 * 24) / 3;
    (d.stats || []).slice(0, 3).forEach(([value, label], i) => {
      const x = L - 24 + i * (tw + 24);
      ctx.fillStyle = C.card; roundRect(ctx, x, y, tw, 160, 28); ctx.fill();
      ctx.fillStyle = C.text; ctx.font = `800 80px ${DISPLAY}`; ctx.fillText(fitText(ctx, value, tw - 48), x + 28, y + 94);
      ctx.fillStyle = C.text2; ctx.font = `600 30px ${BODY}`; ctx.fillText(fitText(ctx, label, tw - 48), x + 28, y + 138);
    });
    y += 160 + 24;

    // Best lifts this week
    const lifts = (d.lifts || []).slice(0, 3);
    if (lifts.length) {
      const lh = 92 + lifts.length * 62;
      ctx.fillStyle = C.card; roundRect(ctx, L - 24, y, R - L + 48, lh, 32); ctx.fill();
      ctx.fillStyle = C.text2; ctx.font = `600 34px ${BODY}`; ctx.fillText('BEST LIFTS THIS WEEK (EST. 1-REP MAX)', L + 8, y + 60);
      lifts.forEach((l, i) => {
        const ly = y + 120 + i * 62;
        ctx.font = `600 40px ${BODY}`;
        const right = `${l.value}${l.change ? `  ${l.change}` : ''}`;
        const rw = ctx.measureText(right).width;
        ctx.fillStyle = C.text; ctx.fillText(fitText(ctx, l.name, R - L - rw - 48), L + 8, ly);
        ctx.fillStyle = l.change && l.change.startsWith('▲') ? C.good : C.text; ctx.fillText(right, R - 8 - rw, ly);
      });
      y += lh + 32;
    }

    // Footer
    ctx.fillStyle = C.muted; ctx.font = `600 30px ${BODY}`;
    ctx.fillText(fitText(ctx, d.footer, R - L), L, Math.max(y + 40, H - 52));
    return cv;
  }

  const toBlob = (cv) => new Promise((resolve) => cv.toBlob(resolve, 'image/png'));

  // The phone's share sheet when it can take files (unless saveOnly), otherwise a download.
  // Returns 'shared', 'saved' or 'cancelled'.
  async function file(blob, name, text, saveOnly = false) {
    const f = new File([blob], name, { type: blob.type });
    if (!saveOnly && navigator.canShare?.({ files: [f] })) {
      try { await navigator.share({ files: [f], text }); return 'shared'; }
      catch (e) { if (e?.name === 'AbortError') return 'cancelled'; }
    }
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return 'saved';
  }

  return { weekCard, toBlob, file };
})();
