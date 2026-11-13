// Scan benchmark on tabs engraved by alphaTab (Guitar Pro style), an independent renderer.
//   cd tests/scan-bench && npm install && node alphatab.js [--seeds n] [--dump dir] [--filter text] [--verbose]
const path = require('path'), fs = require('fs'); const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../..'), atd = path.join(__dirname, 'node_modules/@coderline/alphatab/dist');
const args = process.argv.slice(2), opt = k => { const i = args.indexOf('--' + k); return i < 0 ? null : (args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true); };
const CASES = [
  { name: 'at-default', scale: 1, po: {} },
  { name: 'at-scale1.4', scale: 1.4, po: {} },
  { name: 'at-scale0.7', scale: .7, po: {} },
  { name: 'at-mix', scale: 1, po: { kind: 'mix' } },
  { name: 'at-16ths', scale: 1, po: { kind: 'sixteenth' } },
  { name: 'at-melody', scale: 1.2, po: { kind: 'melody' } },
  { name: 'at-quarter', scale: 1, po: { kind: 'quarter' } },
  { name: 'at-high', scale: 1, po: { high: .5 } },
  { name: 'at-high-small', scale: .7, po: { high: .5 } },
  { name: 'at-x', scale: 1, po: { x: .15 } },
  { name: 'at-norhythm', scale: 1, po: {}, rhythm: 'Hidden' },
  { name: 'at-stems-only', scale: 1, po: { kind: 'mix' }, rhythm: 'ShowWithBeams' },
  { name: 'at-score+tab', scale: 1, po: {}, profile: 'ScoreTab', rhythm: 'Hidden' },
  { name: 'at-dpr2', scale: 1, po: { kind: 'mix' }, dpr: 2 },
];
(async () => {
  const browser = await chromium.launch(); const seeds = +(opt('seeds') || 2), dump = opt('dump'), filter = opt('filter'); if (dump) fs.mkdirSync(dump, { recursive: true });
  const tot = { tp: 0, fp: 0, fn: 0, timed: 0, chordOk: 0, chordN: 0 };
  for (const c of CASES) {
    if (filter && !c.name.includes(filter)) continue;
    const ctx = await browser.newContext({ viewport: { width: 1300, height: 900 }, deviceScaleFactor: c.dpr || 1 }); const page = await ctx.newPage(); page.on('pageerror', e => console.log('ERR', e.message));
    await page.goto('file://' + path.join(root, process.env.HTML || 'index.html')); await page.addScriptTag({ path: path.join(atd, 'alphaTab.js') }); await page.addScriptTag({ path: path.join(root, 'tests/scan-bench/render.js') });
    const agg = { tp: 0, fp: 0, fn: 0, timed: 0, chordOk: 0, chordN: 0, errs: [] };
    for (let seed = 1; seed <= seeds; seed++) {
      const info = await page.evaluate(async ({ c, seed, fontDir }) => {
        const piece = TabBench.randomPiece(seed * 104729 + c.name.length, Object.assign({ bars: 8 }, c.po));
        const D = { 1: 16, 2: 8, 4: 4 };
        const tex = '\\title "" \\tempo 90 \\staff{tabs} \\tuning E4 B3 G3 D3 A2 E2 . ' + piece.bars.map(b => b.events.map((e, i) => { const ns = e.notes.map(([s, f]) => `${f}.${s}`); return `:${D[e.dur]} ${ns.length > 1 ? '(' + ns.join(' ') + ')' : ns[0]}${i === 0 ? ` {ch "${b.chord}"}` : ''}`; }).join(' ')).join(' | ');
        let el = document.getElementById('atbox'); if (el) el.remove(); el = document.createElement('div'); el.id = 'atbox'; el.style.cssText = 'position:absolute;left:0;top:0;width:1200px;background:#fff;z-index:99999'; document.body.prepend(el); window.scrollTo(0, 0);
        const api = new alphaTab.AlphaTabApi(el, { core: { useWorkers: false, fontDirectory: fontDir, enableLazyLoading: false, engine: 'svg' }, display: { staveProfile: c.profile || 'Tab', scale: c.scale, layoutMode: 'Page' }, notation: { rhythmMode: c.rhythm || 'ShowWithBars' }, player: { enablePlayer: false } });
        const errs = []; api.error.on(e => errs.push(String(e && e.message || e)));
        await new Promise(r => { api.postRenderFinished.on(r); api.tex(tex); setTimeout(r, 8000); });
        await new Promise(r => setTimeout(r, 300));
        window._piece = piece; const bb = el.getBoundingClientRect(); return { w: Math.ceil(bb.width), h: Math.ceil(bb.height), errs, tex };
      }, { c, seed, fontDir: 'file://' + atd + '/font/' });
      if (info.errs.length) console.log('alphaTab error', info.errs, info.tex.slice(0, 300));
      const png = await page.screenshot({ clip: { x: 0, y: 0, width: info.w, height: Math.min(info.h, 6000) }, fullPage: true });
      if (dump) fs.writeFileSync(path.join(dump, `${c.name}-${seed}.png`), png);
      const r = await page.evaluate(async b64 => {
        const bin = atob(b64), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const bmp = await createImageBitmap(new Blob([u8], { type: 'image/png' }));
        try { const px = TabScan.prepare(bmp), res = TabScan.scan(px, { slots: 'auto' }); return { sc: TabBench.score(window._piece, res), text: TabScan.toText(res) }; } catch (e) { return { sc: { tp: 0, fp: 0, fn: 0, timed: 0, chordOk: 0, chordN: 0, errs: ['CRASH ' + e.stack], bars: [0, 0] }, text: '' }; }
      }, png.toString('base64'));
      if (dump) fs.writeFileSync(path.join(dump, `${c.name}-${seed}.txt`), r.text + '\n\n' + r.sc.errs.join('\n'));
      for (const k of ['tp', 'fp', 'fn', 'timed', 'chordOk', 'chordN']) agg[k] += r.sc[k];
      if (r.sc.bars[0] !== r.sc.bars[1]) agg.errs.push(`seed ${seed}: ${r.sc.bars[1]} bars read, ${r.sc.bars[0]} expected`);
      r.sc.errs.forEach(e => agg.errs.push(`seed ${seed}: ${e}`));
    }
    const n = agg.tp + agg.fn, pc = (a, b) => b ? (100 * a / b).toFixed(1).padStart(5) : '    -';
    console.log(`${c.name.padEnd(18)} notes ${String(n).padStart(4)}  recall ${pc(agg.tp, n)}  precision ${pc(agg.tp, agg.tp + agg.fp)}  timing ${pc(agg.timed, n)}  chords ${pc(agg.chordOk, agg.chordN)}`);
    if (opt('verbose')) agg.errs.slice(0, 30).forEach(e => console.log('    ' + e));
    for (const k in tot) tot[k] += agg[k]; await ctx.close();
  }
  const n = tot.tp + tot.fn; console.log(`\nTOTAL notes ${n} recall ${(100 * tot.tp / n).toFixed(2)} precision ${(100 * tot.tp / (tot.tp + tot.fp)).toFixed(2)} timing ${(100 * tot.timed / n).toFixed(2)} chords ${(100 * tot.chordOk / Math.max(1, tot.chordN)).toFixed(1)}`);
  await browser.close();
})();
