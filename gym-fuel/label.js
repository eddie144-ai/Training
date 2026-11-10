'use strict';
/* Read a UK nutrition panel on the phone. Tesseract.js (no key, no server) turns a photo into text;
   parseLabel keeps the per 100 g column (kcal, fat, carbohydrate, protein) and drops kJ and the RI column.
   The first read downloads the reader; after that it stays on the phone. If reading fails, the form
   still accepts the numbers typed from the pack. */
const Label = (() => {
  const TESS = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
  const WORKER = 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.1.1/dist/worker.min.js';
  const CORE = 'https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1';
  const LANG = 'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0';

  const linesOf = (text) => String(text || '').replace(/\u00a0/g, ' ').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  function amounts(line) {
    const out = [];
    const re = /<?\s*(\d+(?:[.,]\d+)?)/g;
    let m;
    while ((m = re.exec(line))) {
      const n = parseFloat(m[1].replace(',', '.'));
      if (Number.isFinite(n)) out.push(n);
    }
    return out;
  }
  // 0 = first number on the row is per 100 g (the usual UK panel). 1 when a serving column sits in front of it.
  function per100Column(lines) {
    for (const line of lines) {
      const s = line.toLowerCase();
      const i100 = s.search(/1[0o][0o]\s*g/);
      if (i100 < 0) continue;
      const iServ = s.search(/serving/);
      if (iServ >= 0 && iServ < i100) return 1;
      return 0;
    }
    return 0;
  }
  function kindOf(line) {
    const s = line.toLowerCase();
    if (/of which|saturat|sugar|fibre|fiber|\bsalt\b/.test(s)) return '';
    if (/\bk\s*j\b/.test(s) && !/kcal|k\s*cal|keal|\bkel\b/.test(s)) return '';
    if (/kcal|k\s*cal|keal|\bkel\b/.test(s) || (/\benergy\b/.test(s) && /cal|\bkel\b/.test(s))) return 'kcal';
    if (/\bfat\b/.test(s)) return 'f';
    if (/carb/.test(s)) return 'c';
    if (/prot/.test(s)) return 'p';
    return '';
  }
  // Prefer the per 100 g column. If that figure is impossible for 100 g (the RI slipped into it), use a smaller one on the row.
  function choose(nums, col, max) {
    if (!nums.length) return null;
    let v = nums[Math.min(col, nums.length - 1)];
    if (v > max) {
      const smaller = nums.filter((n) => n <= max);
      if (smaller.length) v = smaller[0];
    }
    return v <= max ? v : null;
  }
  // Numbers after the nutrient word. A photo of the whole pack often glues the ingredients onto the same line, and those can contain digits ("01") that are not the per 100 g column.
  function amountsAfter(line, kind) {
    const s = line.toLowerCase();
    const m = kind === 'kcal' ? s.match(/kcal|k\s*cal|keal|\bkel\b|\benergy\b/)
      : kind === 'f' ? s.match(/\bfat\b/)
        : kind === 'c' ? s.match(/carb\w*/)
          : s.match(/prot\w*/);
    const from = m ? m.index + m[0].length : 0;
    return amounts(line.slice(from));
  }
  function valueAt(lines, i, col, max) {
    const kind = kindOf(lines[i]);
    let nums = amountsAfter(lines[i], kind);
    if (!nums.length) {
      const next = lines[i + 1] || '';
      if (next && !kindOf(next)) nums = amounts(next);
    }
    return choose(nums, col, max);
  }

  function parseLabel(text) {
    const lines = linesOf(text);
    const col = per100Column(lines);
    const out = { kcal: null, f: null, c: null, p: null };
    const max = { kcal: 900, f: 100, c: 100, p: 100 };
    for (let i = 0; i < lines.length; i++) {
      const kind = kindOf(lines[i]);
      if (!kind || out[kind] != null) continue;
      const v = valueAt(lines, i, col, max[kind]);
      if (v == null) continue;
      out[kind] = kind === 'kcal' ? Math.round(v) : Math.round(v * 10) / 10;
    }
    return { ...out, ok: out.kcal != null };
  }

  // per is per 100 g. grams is what was eaten. kcal rounded, macros to 0.1 g.
  function scale100(per, grams) {
    const g = Number(grams);
    if (!per || !Number.isFinite(g) || g <= 0) return null;
    const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
    const k = g / 100;
    // Tenths first, so 3.6 g × 4 stays 14.4 and not a hair under it.
    const tenth = (v) => Math.round(n(v) * 10);
    return {
      kcal: Math.round(n(per.kcal) * k),
      p: Math.round(tenth(per.p) * k) / 10,
      c: Math.round(tenth(per.c) * k) / 10,
      f: Math.round(tenth(per.f) * k) / 10,
    };
  }

  let scriptP = null;
  function loadScript() {
    if (self.Tesseract?.createWorker) return Promise.resolve();
    if (scriptP) return scriptP;
    scriptP = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = TESS;
      s.async = true;
      s.onload = () => (self.Tesseract?.createWorker ? resolve() : reject(new Error('no tesseract')));
      s.onerror = () => reject(new Error('offline'));
      document.head.appendChild(s);
    }).catch((e) => { scriptP = null; throw e; });
    return scriptP;
  }
  let workerP = null;
  function getWorker() {
    workerP ||= self.Tesseract.createWorker('eng', 1, { workerPath: WORKER, corePath: CORE, langPath: LANG });
    return workerP.catch((e) => { workerP = null; throw e; });
  }
  function shrink(file) {
    if (typeof createImageBitmap !== 'function') return Promise.resolve(file);
    return createImageBitmap(file).then((bmp) => new Promise((resolve) => {
      const max = 1600;
      const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bmp.width * scale));
      canvas.height = Math.max(1, Math.round(bmp.height * scale));
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      bmp.close?.();
      canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.92);
    })).catch(() => file);
  }
  async function readImage(file) {
    try {
      await loadScript();
      const src = await shrink(file);
      const worker = await getWorker();
      const { data } = await worker.recognize(src);
      const text = data?.text || '';
      return { ok: true, text, per: parseLabel(text) };
    } catch {
      return { ok: false, error: 'Couldn\'t read the label on this phone. Type the per 100 g numbers from the pack.' };
    }
  }

  return { parseLabel, scale100, readImage };
})();
