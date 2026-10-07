'use strict';
/* Barcode scanning and food lookup.
   - Camera scanning uses the browser's BarcodeDetector (Chrome on Android). Elsewhere you type the number.
   - Lookup uses Open Food Facts (free, no account): only the barcode is sent. Results are saved in your
     foods so the same product works offline next time. */
const Scan = (() => {
  const API = 'https://world.openfoodfacts.org/api/v2/product/';
  const FIELDS = 'product_name,brands,nutriments,serving_quantity';
  const validCode = (c) => /^\d{8,14}$/.test(String(c || '').trim());
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null);

  // Per-100 g values from an Open Food Facts product, or null if it has no usable energy value.
  function parse(code, p) {
    const nu = p?.nutriments || {};
    let kcal = n(nu['energy-kcal_100g']);
    if (kcal == null && n(nu.energy_100g) != null) kcal = n(nu.energy_100g) / 4.184; // kJ
    if (kcal == null || kcal > 950) return null;
    const name = [p.product_name, p.brands].filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()).join(' · ').slice(0, 80) || `Product ${code}`;
    return {
      code, name,
      kcal: Math.round(kcal), p: n(nu.proteins_100g) ?? 0, f: n(nu.fat_100g) ?? 0, c: n(nu.carbohydrates_100g) ?? 0,
      fib: n(nu.fiber_100g) ?? 0, sat: n(nu['saturated-fat_100g']) ?? 0,
      serving: n(p.serving_quantity),
    };
  }
  async function lookup(code) {
    if (!validCode(code)) return { ok: false, error: 'That doesn\'t look like a barcode (8 to 14 digits).' };
    let res;
    try { res = await fetch(`${API}${encodeURIComponent(code)}.json?fields=${FIELDS}`, { headers: { Accept: 'application/json' } }); }
    catch { return { ok: false, error: 'Couldn\'t reach Open Food Facts. Check your connection, or enter the food by hand.' }; }
    if (res.status === 404) return { ok: false, error: 'Not in Open Food Facts. Enter it by hand below.' };
    if (!res.ok) return { ok: false, error: `Open Food Facts didn't answer (error ${res.status}). Try again later.` };
    let j; try { j = await res.json(); } catch { return { ok: false, error: 'Open Food Facts sent something unreadable.' }; }
    if (j.status === 0 || !j.product) return { ok: false, error: 'Not in Open Food Facts. Enter it by hand below.' };
    const food = parse(code, j.product);
    return food ? { ok: true, food } : { ok: false, error: 'That product has no calorie information. Enter it by hand below.' };
  }

  const canScan = () => 'BarcodeDetector' in self && !!navigator.mediaDevices?.getUserMedia;
  let stream = null, timer = null;
  async function start(video, onCode) {
    const formats = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];
    const det = new BarcodeDetector({ formats: (await BarcodeDetector.getSupportedFormats?.())?.filter((f) => formats.includes(f)) || formats });
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    video.srcObject = stream;
    await video.play();
    const tick = async () => {
      if (!stream) return;
      try { const codes = await det.detect(video); const hit = codes.find((c) => validCode(c.rawValue)); if (hit) { stop(); onCode(hit.rawValue); return; } } catch { /* frame not ready */ }
      timer = setTimeout(tick, 250);
    };
    tick();
  }
  function stop() {
    clearTimeout(timer); timer = null;
    if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  }
  return { lookup, parse, validCode, canScan, start, stop };
})();
