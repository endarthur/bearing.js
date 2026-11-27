// Point markers: a pole's or a line's symbol, in the SVG string and on a canvas (the same builder path).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Stereonet, MARKERS, markerPath } from '../src/index.js';

describe('point markers (style.symbol)', () => {
  it('a circle stays a circle; the other symbols are paths, centred on the point', () => {
    assert.equal(markerPath('circle', 10, 10, 3), null);
    for (const sym of MARKERS.filter((m) => m !== 'circle')) {
      const d = markerPath(sym, 50, 40, 4);
      assert.match(d, /^M/, sym);
      const nums = d.match(/-?\d+(\.\d+)?/g).map(Number), xs = nums.filter((_, i) => i % 2 === 0), ys = nums.filter((_, i) => i % 2 === 1);
      assert.ok(Math.abs((Math.min(...xs) + Math.max(...xs)) / 2 - 50) < 0.6 || sym === 'cross', `${sym} centred in x`);
    }
  });
  it('the SVG string draws a square pole as a path, a circle pole as a circle, with opacity and outline width', () => {
    const net = new Stereonet({ size: 200 });
    net.pole(45, 30, { symbol: 'square', fill: '#c00', r: 4, opacity: 0.5, strokeWidth: 2, stroke: '#000' });
    net.line(120, 40, { fill: '#00c', r: 3 });
    const svg = net.svg();
    assert.match(svg, /<path[^>]*fill="#c00"[^>]*>/);
    assert.match(svg, /<path[^>]*opacity="0.5"/);
    assert.match(svg, /<path[^>]*stroke-width="2"/);
    assert.match(svg, /<circle[^>]*fill="#00c"/);
  });
  it('a cross is a stroke in the fill colour, not a filled shape', () => {
    const net = new Stereonet({ size: 200 });
    net.line(120, 40, { symbol: 'cross', fill: '#0a0', r: 4 });
    const svg = net.svg();
    assert.match(svg, /<path[^>]*fill="none"[^>]*stroke="#0a0"/);
  });
  it('on a canvas the same marker is a path, filled', () => {
    const calls = [];
    const ctx = new Proxy({ setLineDash() {} }, { get: (t, k) => (k in t ? t[k] : (...a) => { calls.push(k); return { width: 1 }; }), set: (t, k, v) => { t[k] = v; return true; } });
    const net = new Stereonet({ size: 200 });
    net.pole(45, 30, { symbol: 'triangle', fill: '#c00', r: 4 });
    net.draw(ctx);
    assert.ok(calls.includes('lineTo') && calls.includes('closePath') && calls.includes('fill'));
  });
});
