// Renders docs/*.md to PDF with a print stylesheet.
// Needs: npm i marked playwright (and a Chromium). Run: node tools/pdf.mjs
import fs from 'node:fs';
import { marked } from 'marked';
import { chromium } from 'playwright';

const docs = new URL('../docs/', import.meta.url);
const css = `
  @page { size: A4; margin: 18mm 16mm 20mm; }
  * { box-sizing: border-box; }
  body { font: 10.5pt/1.5 "Barlow", "Helvetica Neue", Arial, sans-serif; color: #1d1915; }
  .cover { height: 245mm; display: flex; flex-direction: column; justify-content: flex-end; padding-bottom: 30mm; border-left: 10mm solid #cf4a30; padding-left: 12mm; page-break-after: always; }
  .cover .kicker { font: 600 10pt "IBM Plex Mono", monospace; letter-spacing: 2px; text-transform: uppercase; color: #8a7d6a; }
  .cover h1 { font: 800 44pt/1 "Big Shoulders Display", "Arial Narrow", Impact, sans-serif; text-transform: uppercase; letter-spacing: 1px; margin: 8mm 0 5mm; }
  .cover p { font-size: 14pt; max-width: 130mm; margin: 0; color: #4a4036; }
  .cover .date { margin-top: 10mm; font: 600 10pt "IBM Plex Mono", monospace; color: #8a7d6a; }
  h1 { font: 800 21pt/1.1 "Big Shoulders Display", "Arial Narrow", sans-serif; text-transform: uppercase; letter-spacing: .5px; color: #1d1915; border-bottom: 2.5pt solid #cf4a30; padding-bottom: 2mm; margin: 9mm 0 4mm; page-break-after: avoid; }
  h2 { font: 800 14pt/1.2 "Big Shoulders Display", "Arial Narrow", sans-serif; text-transform: uppercase; letter-spacing: .4px; color: #8f2f1c; margin: 6mm 0 2mm; page-break-after: avoid; }
  h3 { font-size: 11pt; margin: 4mm 0 1mm; page-break-after: avoid; }
  p, li { orphans: 3; widows: 3; }
  table { width: 100%; border-collapse: collapse; margin: 3mm 0 4mm; font-size: 9.5pt; page-break-inside: avoid; }
  th { text-align: left; font: 600 8pt "IBM Plex Mono", monospace; text-transform: uppercase; letter-spacing: .5px; color: #6b5f50; border-bottom: 1.2pt solid #1d1915; padding: 1.5mm 2mm 1.5mm 0; }
  td { border-bottom: .5pt solid #d6ccbd; padding: 1.5mm 2mm 1.5mm 0; vertical-align: top; }
  td[align=right], th[align=right] { text-align: right; font-variant-numeric: tabular-nums; }
  blockquote { margin: 4mm 0; padding: 3mm 4mm; background: #f6efe4; border-left: 3pt solid #e2a63c; }
  blockquote p { margin: 0; }
  code { font: 9pt "IBM Plex Mono", monospace; background: #f3ece2; padding: 0 1mm; border-radius: 1mm; }
  strong { color: #000; }
  a { color: #8f2f1c; text-decoration: none; }
  ol li, ul li { margin: .8mm 0; }
  h1 + p, h2 + p { margin-top: 0; }
`;
const files = process.argv.slice(2).length ? process.argv.slice(2) : ['research-report.md', 'full-guide.md'];
const browser = await chromium.launch();
const page = await browser.newPage();
for (const f of files) {
  const src = fs.readFileSync(new URL(f, docs), 'utf8');
  const fm = {}; let body = src;
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (m) { for (const line of m[1].split('\n')) { const [k, ...v] = line.split(':'); fm[k.trim()] = v.join(':').trim().replace(/^"|"$/g, ''); } body = src.slice(m[0].length); }
  const html = `<!doctype html><html><head><meta charset="utf-8">
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@800&family=Barlow:wght@400;600;700&family=IBM+Plex+Mono:wght@600&display=swap">
    <style>${css}</style></head><body>
    <section class="cover"><div class="kicker">Shredded System</div><h1>${fm.title?.replace('Shredded System: ', '') || ''}</h1><p>${fm.subtitle || ''}</p><div class="date">${fm.date || ''} · Not medical advice</div></section>
    ${marked.parse(body)}</body></html>`;
  await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => page.setContent(html));
  await page.pdf({ path: new URL(f.replace(/\.md$/, '.pdf'), docs).pathname, format: 'A4', printBackground: true, displayHeaderFooter: true,
    headerTemplate: '<span></span>',
    footerTemplate: `<div style="width:100%;font:8px Arial;color:#8a7d6a;padding:0 16mm;display:flex;justify-content:space-between"><span>${fm.title || ''}</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
    margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' } });
  console.log('wrote', f.replace(/\.md$/, '.pdf'));
}
await browser.close();
