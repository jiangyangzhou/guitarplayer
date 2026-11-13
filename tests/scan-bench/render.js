// Synthetic tab renderer for the scan benchmark. Runs inside the page (needs canvas).
// A piece is {bars:[{chord, events:[{on,dur,notes:[[string(1=high e),fret|'x']]}]}]} with on/dur in 16th notes.
window.TabBench = (function () {
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  const SHAPES = {   // frets low E first
    C: [-1, 3, 2, 0, 1, 0], G: [3, 2, 0, 0, 0, 3], Am: [-1, 0, 2, 2, 1, 0], Em: [0, 2, 2, 0, 0, 0], F: [1, 3, 3, 2, 1, 1],
    D: [-1, -1, 0, 2, 3, 2], Dm: [-1, -1, 0, 2, 3, 1], E: [0, 2, 2, 1, 0, 0], A: [-1, 0, 2, 2, 2, 0], Bm: [-1, 2, 4, 4, 3, 2],
    G7: [3, 2, 0, 0, 0, 1], Cmaj7: [-1, 3, 2, 0, 0, 0], Fmaj7: [-1, -1, 3, 2, 1, 0], Am7: [-1, 0, 2, 0, 1, 0], Em7: [0, 2, 0, 0, 0, 0]
  };
  // string number (1 = high e) of the fret at low-E-first index i
  const sn = i => 6 - i;

  function randomPiece(seed, o) {
    o = Object.assign({ bars: 8, kind: 'arp', high: .15, x: 0 }, o || {});
    const R = rng(seed), pick = a => a[Math.floor(R() * a.length)], names = Object.keys(SHAPES), bars = [];
    for (let b = 0; b < o.bars; b++) {
      const chord = pick(names), sh = SHAPES[chord], bassI = sh.findIndex(f => f >= 0), ev = [];
      const fretAt = i => { let f = sh[i] < 0 ? 0 : sh[i]; if (R() < o.high) f = Math.floor(R() * 20) + 3; return (o.x && R() < o.x) ? 'x' : f; };
      const kind = o.kind === 'mix' ? pick(['arp', 'arp', 'sixteenth', 'melody', 'quarter']) : o.kind;
      if (kind === 'arp') {
        const pat = pick([[3, 2, 1, 2, 3, 2, 1], [3, 2, 3, 1, 3, 2, 3], [4, 3, 2, 3, 1, 3, 2], [3, 1, 2, 3, 1, 2, 3]]);
        for (let k = 0; k < 8; k++) {
          const notes = k === 0 ? [[sn(bassI), fretAt(bassI)]] : [[pat[k - 1], fretAt(6 - pat[k - 1])]];
          if (k === 4 && R() < .5) notes.push([sn(Math.min(bassI + 1, 3)), fretAt(Math.min(bassI + 1, 3))]);
          if (k === 0 && R() < .3) notes.push([1, fretAt(5)]);
          ev.push({ on: k * 2, dur: 2, notes });
        }
      } else if (kind === 'sixteenth') {
        const pat = [0, 3, 2, 1, 2, 3, 2, 1, 0, 3, 2, 1, 2, 3, 2, 1];
        for (let k = 0; k < 16; k++) { const s = pat[k] === 0 ? sn(bassI) : pat[k]; ev.push({ on: k, dur: 1, notes: [[s, fretAt(6 - s)]] }); }
      } else if (kind === 'melody') {
        let on = 0; while (on < 16) { const dur = Math.min(16 - on, pick([2, 2, 2, 4, 1, 1])), s = 1 + Math.floor(R() * 4), f = Math.floor(R() * (R() < .3 ? 17 : 8));
          const d2 = (dur === 1 && on % 2 === 0 && on + 2 <= 16) ? 1 : dur; ev.push({ on, dur: d2, notes: [[s, f]] }); on += d2; if (d2 === 1 && on % 2) { ev.push({ on, dur: 1, notes: [[1 + Math.floor(R() * 4), Math.floor(R() * 8)]] }); on += 1; } }
      } else if (kind === 'quarter') {
        for (let k = 0; k < 4; k++) { const notes = []; for (let i = 0; i < 6; i++) if (sh[i] >= 0 && (k === 0 || i >= 2) && R() < .8) notes.push([sn(i), fretAt(i)]); if (!notes.length) notes.push([sn(bassI), fretAt(bassI)]); ev.push({ on: k * 4, dur: 4, notes }); }
      }
      // one note per string in a column
      ev.forEach(e => { const seen = new Set(); e.notes = e.notes.filter(n => !seen.has(n[0]) && seen.add(n[0])); });
      bars.push({ chord, events: ev });
    }
    return { bars };
  }

  // Draw the piece. Returns a canvas.
  function render(piece, st) {
    st = Object.assign({ sp: 14, font: 'Liberation Sans', weight: '400', fsize: 1.15, lineGray: 90, lineW: 1, ink: 0, erase: true, stems: true, chords: true,
      barsPerLine: 4, barW: 28, clef: true, scale: 1, bg: 255, numbersBold: false, beamW: .32, stemGap: .45 }, st || {});
    const sp = st.sp, mL = Math.round(sp * 2), barW = Math.round(sp * st.barW), W = mL * 2 + barW * st.barsPerLine;
    const lines = Math.ceil(piece.bars.length / st.barsPerLine), sysH = Math.round(sp * (st.stems ? 13 : 11)), topPad = Math.round(sp * 5);
    const H = topPad + lines * sysH + Math.round(sp * 2);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    const col = v => `rgb(${v},${v},${v})`;
    g.fillStyle = col(st.bg); g.fillRect(0, 0, W, H);
    for (let L = 0; L < lines; L++) {
      const y0 = topPad + L * sysH, ly = i => Math.round(y0 + i * sp) + (st.lineW % 2 ? .5 : 0), xa = mL, xb = W - mL;
      g.strokeStyle = col(st.lineGray); g.lineWidth = st.lineW;
      for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(xa, ly(i)); g.lineTo(xb, ly(i)); g.stroke(); }
      const lineBars = piece.bars.slice(L * st.barsPerLine, (L + 1) * st.barsPerLine);
      g.strokeStyle = col(st.ink); g.lineWidth = Math.max(1, st.lineW);
      for (let b = 0; b <= st.barsPerLine; b++) { const x = Math.round(xa + b * barW) + .5; g.beginPath(); g.moveTo(x, ly(0)); g.lineTo(x, ly(5)); g.stroke(); }
      if (st.clef) { g.fillStyle = col(st.ink); g.font = `700 ${Math.round(sp * 1.5)}px "Liberation Serif"`; g.textAlign = 'center'; g.textBaseline = 'middle';
        ['T', 'A', 'B'].forEach((ch, k) => g.fillText(ch, xa + sp * 1.1, y0 + sp * (1 + k * 1.5))); }
      lineBars.forEach((bar, bi) => {
        const bx = xa + bi * barW, lead = (bi === 0 && st.clef ? sp * 2.6 : sp * 1.0), inner = barW - lead - sp * .6, xOf = on => Math.round(bx + lead + (on + .5) / 16 * inner);
        if (st.chords && bar.chord) { g.fillStyle = col(st.ink); g.font = `700 ${Math.round(sp * 1.5)}px "${st.chordFont || st.font}"`; g.textAlign = 'left'; g.textBaseline = 'alphabetic'; g.fillText(bar.chord, xOf(0) - sp * .4, y0 - sp * 1.2); }
        const fpx = Math.round(sp * st.fsize);
        bar.events.forEach(e => {
          const x = xOf(e.on);
          e.notes.forEach(([s, f]) => {
            const y = Math.round(y0 + (s - 1) * sp), txt = String(f === 'x' ? '×' : f);
            g.font = `${st.weight} ${f === 'x' ? Math.round(fpx * 1.25) : fpx}px "${st.font}"`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
            const m = g.measureText(txt), asc = m.actualBoundingBoxAscent, desc = m.actualBoundingBoxDescent, w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
            if (st.erase && f !== 'x') { g.fillStyle = col(st.bg); g.fillRect(Math.round(x - w / 2 - 1), y - 2, Math.round(w + 2), 5); }
            g.fillStyle = col(st.ink); g.fillText(txt, x, Math.round(y + (asc - desc) / 2));
          });
          if (st.stems) {
            const low = Math.max(...e.notes.map(n => n[0])), sy0 = Math.round(y0 + 5 * sp + sp * st.stemGap), sy1 = Math.round(y0 + 5 * sp + sp * 2.6);
            g.strokeStyle = col(st.ink); g.lineWidth = Math.max(1, Math.round(sp * .09)); const X = x + (g.lineWidth % 2 ? .5 : 0);
            g.beginPath(); g.moveTo(X, low === 6 ? sy0 + sp * .35 : sy0); g.lineTo(X, sy1); g.stroke();
            e._x = x; e._sy1 = sy1;
          }
        });
        if (st.stems) {   // beams within each beat
          const bh = Math.max(2, Math.round(sp * st.beamW));
          for (let beat = 0; beat < 4; beat++) {
            const grp = bar.events.filter(e => e.on >= beat * 4 && e.on < beat * 4 + 4 && e.dur <= 2);
            g.fillStyle = col(st.ink);
            if (grp.length >= 2) {
              const xa2 = grp[0]._x, xb2 = grp[grp.length - 1]._x, y = grp[0]._sy1;
              g.fillRect(xa2, y - bh, xb2 - xa2 + 1, bh);
              grp.forEach((e, i) => { if (e.dur !== 1) return; const nb = grp[i + 1], pb = grp[i - 1]; const y2 = y - bh * 2 - Math.max(1, Math.round(bh * .6));
                if (nb && nb.dur === 1) g.fillRect(e._x, y2, nb._x - e._x + 1, bh);
                else if (!(pb && pb.dur === 1)) { const d = Math.round(sp * .7); if (nb) g.fillRect(e._x, y2, d, bh); else g.fillRect(e._x - d, y2, d + 1, bh); } });
            } else if (grp.length === 1) {   // lone flagged note: a short flag
              const e = grp[0]; g.strokeStyle = col(st.ink); g.lineWidth = Math.max(1.5, sp * .12);
              for (let k = 0; k < (e.dur === 1 ? 2 : 1); k++) { g.beginPath(); g.moveTo(e._x, e._sy1 - k * sp * .45); g.quadraticCurveTo(e._x + sp * .5, e._sy1 - sp * .5 - k * sp * .45, e._x + sp * .65, e._sy1 - sp * 1.0 - k * sp * .45); g.stroke(); }
            }
          }
        }
      });
    }
    if (st.scale === 1 && !st.blur) return c;
    const c2 = document.createElement('canvas'); c2.width = Math.round(W * st.scale); c2.height = Math.round(H * st.scale); const g2 = c2.getContext('2d');
    g2.imageSmoothingQuality = 'high'; if (st.blur) g2.filter = `blur(${st.blur}px)`; g2.fillStyle = col(st.bg); g2.fillRect(0, 0, c2.width, c2.height); g2.drawImage(c, 0, 0, c2.width, c2.height); return c2;
  }

  // Compare a scan result with the piece. Notes are matched per bar; timing is scored separately.
  function score(piece, res) {
    const gt = piece.bars, got = [];
    // merge split bars (one physical bar can be cut at chord changes)
    res.bars.forEach(b => { if (b.part && got.length) { got[got.length - 1].slots.push(...b.slots); return; } got.push({ slots: b.slots.slice(), chord: b.chord, res: b.slotResolution || 4 }); });
    let tp = 0, fp = 0, fn = 0, timed = 0, wrongDigit = 0, chordOk = 0, chordN = 0; const errs = [];
    const n = Math.max(gt.length, got.length);
    for (let i = 0; i < n; i++) {
      const G = gt[i], R = got[i];
      const gs = []; if (G) G.events.forEach(e => e.notes.forEach(([s, f]) => gs.push({ on: e.on, s, f })));
      const rs = []; if (R) R.slots.forEach((sl, k) => sl && sl.forEach(nt => { if (nt.li >= 0) rs.push({ on: k * 4 / R.res, s: nt.li + 1, f: nt.f }); }));
      if (G && R && G.chord) { chordN++; if (R.chord === G.chord) chordOk++; else errs.push(`bar ${i + 1}: chord ${G.chord} read as ${R.chord}`); }
      const used = new Set();
      gs.forEach(a => {
        let k = rs.findIndex((b, j) => !used.has(j) && b.s === a.s && b.f === a.f && b.on === a.on);
        if (k >= 0) { used.add(k); tp++; timed++; return; }
        k = rs.findIndex((b, j) => !used.has(j) && b.s === a.s && b.f === a.f);
        if (k >= 0) { used.add(k); tp++; errs.push(`bar ${i + 1}: ${a.s}-${a.f} at ${a.on} placed at ${rs[k].on}`); return; }
        k = rs.findIndex((b, j) => !used.has(j) && b.s === a.s && Math.abs(b.on - a.on) <= 1);
        if (k >= 0) { used.add(k); wrongDigit++; fn++; fp++; errs.push(`bar ${i + 1}: ${a.s}-${a.f} read as ${rs[k].s}-${rs[k].f}`); return; }
        fn++; errs.push(`bar ${i + 1}: ${a.s}-${a.f} at ${a.on} missed`);
      });
      rs.forEach((b, j) => { if (!used.has(j)) { fp++; errs.push(`bar ${i + 1}: extra ${b.s}-${b.f} at ${b.on}`); } });
    }
    return { tp, fp, fn, timed, wrongDigit, chordOk, chordN, bars: [gt.length, got.length], errs };
  }
  return { randomPiece, render, score, SHAPES };
})();
