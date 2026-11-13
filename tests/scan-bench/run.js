#!/usr/bin/env node
// Scan benchmark: renders synthetic tabs in many print styles, runs the in-page scanner on them and reports accuracy.
//   node tests/scan-bench/run.js [--filter text] [--verbose] [--dump dir] [--seeds n]
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const root = path.resolve(__dirname, '../..');

const STYLES = [
  { name: 'sans-14', st: {} },
  { name: 'sans-bold-14', st: { weight: '700' } },
  { name: 'serif-14', st: { font: 'Liberation Serif', fsize: 1.25 } },
  { name: 'dejavu-14', st: { font: 'DejaVu Sans', fsize: 1.05 } },
  { name: 'inter-16', st: { font: 'Inter', sp: 16 } },
  { name: 'freesans-12', st: { font: 'FreeSans', sp: 12 } },
  { name: 'small-8', st: { sp: 8, barW: 30 } },
  { name: 'small-10-serif', st: { sp: 10, font: 'Liberation Serif', fsize: 1.25 } },
  { name: 'large-22', st: { sp: 22, barsPerLine: 3, lineW: 2 } },
  { name: 'large-30-bold', st: { sp: 30, barsPerLine: 2, lineW: 2, weight: '700' } },
  { name: 'no-erase', st: { erase: false } },
  { name: 'no-erase-bold', st: { erase: false, weight: '700', fsize: 1.25 } },
  { name: 'black-lines', st: { lineGray: 0 } },
  { name: 'faint-lines', st: { lineGray: 170 } },
  { name: 'grey-ink', st: { ink: 70, lineGray: 150 } },
  { name: 'cream-paper', st: { bg: 238, ink: 30, lineGray: 120 } },
  { name: 'dense-16ths', st: { barW: 34 }, piece: { kind: 'sixteenth' } },
  { name: 'dense-16ths-small', st: { sp: 10, barW: 34 }, piece: { kind: 'sixteenth' } },
  { name: 'melody-high-frets', st: {}, piece: { kind: 'melody' } },
  { name: 'melody-serif', st: { font: 'Liberation Serif', fsize: 1.25 }, piece: { kind: 'melody' } },
  { name: 'quarter-chords', st: {}, piece: { kind: 'quarter' } },
  { name: 'quarter-chords-noerase', st: { erase: false }, piece: { kind: 'quarter' } },
  { name: 'mixed', st: {}, piece: { kind: 'mix' } },
  { name: 'mixed-bold-serif', st: { font: 'DejaVu Serif', weight: '700', fsize: 1.05 }, piece: { kind: 'mix' } },
  { name: 'no-stems', st: { stems: false } },
  { name: 'no-stems-noclef', st: { stems: false, clef: false, chords: false } },
  { name: 'muted-x', st: {}, piece: { x: .15 } },
  { name: 'downscaled-0.6', st: { sp: 20, lineW: 2, scale: .6 } },
  { name: 'upscaled-blurry', st: { sp: 9, scale: 1.8 } },
  { name: 'blur-1px', st: { blur: 1 } },
  { name: 'jpeg-q40', st: {}, jpeg: .4 },
  { name: 'jpeg-q25-small', st: { sp: 11 }, jpeg: .25 },
  { name: 'high-frets', st: {}, piece: { high: .6 } },
  { name: 'high-frets-serif', st: { font: 'Liberation Serif', fsize: 1.25 }, piece: { high: .6 } },
  { name: 'through-stems', st: { stemThrough: true } },
  { name: 'through-stems-mix', st: { stemThrough: true, font: 'Liberation Serif', fsize: 1.25 }, piece: { kind: 'mix' } },
  { name: 'through-stems-small', st: { stemThrough: true, sp: 11 }, piece: { kind: 'mix', high: .3 } },
  { name: 'through-low-quarter', st: { stemThrough: 'low' }, piece: { kind: 'quarter' } },
  { name: 'through-quarter', st: { stemThrough: true }, piece: { kind: 'quarter' } },
  { name: 'through-quarter-noerase', st: { stemThrough: true, erase: false, font: 'FreeSans' }, piece: { kind: 'quarter' } },
  { name: 'through-ones', st: { stemThrough: true }, piece: { kind: 'quarter', only: [1, 1, 0, 2] } },
  { name: 'through-ones-serif', st: { stemThrough: true, font: 'Liberation Serif', fsize: 1.25, sp: 12 }, piece: { kind: 'mix', only: [1, 1, 1, 3, 11] } },
  { name: 'strum-arrows', st: {}, piece: { kind: 'strum' } },
  { name: 'strum-arrows-filled', st: { arrowFill: true, sp: 12 }, piece: { kind: 'strum' } },
  { name: 'strum-arrows-large', st: { sp: 20, lineW: 2, barsPerLine: 3 }, piece: { kind: 'strum' } },
  { name: 'wide-bars', st: { barW: 44, barsPerLine: 2 } },
  { name: 'narrow-bars', st: { barW: 20, barsPerLine: 5 } },
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('pageerror', e.message));
  await page.goto('file://' + path.join(root, process.env.HTML || 'index.html'));
  await page.addScriptTag({ path: path.join(__dirname, 'render.js') });
  await page.evaluate(() => document.fonts.ready);
  const filter = opt('filter'), seeds = +(opt('seeds') || 3), dump = opt('dump');
  if (dump && dump !== true) fs.mkdirSync(dump, { recursive: true });
  const tot = { tp: 0, fp: 0, fn: 0, timed: 0, wrong: 0, chordOk: 0, chordN: 0 }, rows = [];
  for (const s of STYLES) {
    if (filter && filter !== true && !s.name.includes(filter)) continue;
    const agg = { tp: 0, fp: 0, fn: 0, timed: 0, wrong: 0, chordOk: 0, chordN: 0, errs: [], ms: 0 };
    for (let seed = 1; seed <= seeds; seed++) {
      const r = await page.evaluate(async ({ s, seed, wantPng }) => {
        const piece = TabBench.randomPiece(seed * 7919 + s.name.length, s.piece), cv = TabBench.render(piece, s.st);
        let src = cv;
        if (s.jpeg) { const blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', s.jpeg)); src = await createImageBitmap(blob); }
        const t0 = performance.now(); let res, err = null;
        try { const px = TabScan.prepare(src); res = TabScan.scan(px, { slots: 'auto' }); } catch (e) { err = String(e && e.stack || e); }
        const ms = performance.now() - t0;
        const sc = err ? { tp: 0, fp: 0, fn: piece.bars.reduce((n, b) => n + b.events.reduce((m, e) => m + e.notes.length, 0), 0), timed: 0, wrongDigit: 0, chordOk: 0, chordN: 0, errs: ['CRASH ' + err], bars: [piece.bars.length, 0] } : TabBench.score(piece, res);
        return { sc, ms, png: wantPng ? cv.toDataURL('image/png') : null, text: err ? '' : TabScan.toText(res) };
      }, { s, seed, wantPng: !!dump });
      if (dump && dump !== true) { fs.writeFileSync(path.join(dump, `${s.name}-${seed}.png`), Buffer.from(r.png.split(',')[1], 'base64')); fs.writeFileSync(path.join(dump, `${s.name}-${seed}.txt`), r.text + '\n\n' + r.sc.errs.join('\n')); }
      agg.tp += r.sc.tp; agg.fp += r.sc.fp; agg.fn += r.sc.fn; agg.timed += r.sc.timed; agg.wrong += r.sc.wrongDigit; agg.chordOk += r.sc.chordOk; agg.chordN += r.sc.chordN; agg.ms += r.ms;
      if (r.sc.bars[0] !== r.sc.bars[1]) agg.errs.push(`seed ${seed}: ${r.sc.bars[1]} bars read, ${r.sc.bars[0]} expected`);
      r.sc.errs.forEach(e => agg.errs.push(`seed ${seed}: ${e}`));
    }
    const n = agg.tp + agg.fn, pc = (a, b) => b ? (100 * a / b).toFixed(1).padStart(5) : '    -';
    rows.push(`${s.name.padEnd(24)} notes ${String(n).padStart(4)}  recall ${pc(agg.tp, n)}  precision ${pc(agg.tp, agg.tp + agg.fp)}  timing ${pc(agg.timed, n)}  chords ${pc(agg.chordOk, agg.chordN)}  ${Math.round(agg.ms / seeds)}ms`);
    console.log(rows[rows.length - 1]);
    if (opt('verbose')) agg.errs.slice(0, 25).forEach(e => console.log('    ' + e));
    for (const k in tot) tot[k] += agg[k];
  }
  const n = tot.tp + tot.fn, pc = (a, b) => b ? (100 * a / b).toFixed(2) : '-';
  console.log(`\nTOTAL notes ${n}  recall ${pc(tot.tp, n)}  precision ${pc(tot.tp, tot.tp + tot.fp)}  timing ${pc(tot.timed, n)}  chords ${pc(tot.chordOk, tot.chordN)}  misses ${tot.fn} extras ${tot.fp} (wrong digit ${tot.wrong})`);
  await browser.close();
})();
