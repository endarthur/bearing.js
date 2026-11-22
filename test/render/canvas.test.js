import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CanvasBuilder } from '../../src/render/canvas.js';
import { Stereonet } from '../../src/stereonet.js';

// a context that records every call and property set, like a draw-list recorder
function rec() {
  const ops = [];
  const target = {};
  return {
    ops,
    ctx: new Proxy(target, {
      get(t, k) { if (k in t) return t[k]; return (...a) => { ops.push([k, ...a]); }; },
      set(t, k, v) { ops.push(['set', k, v]); return true; },
    }),
  };
}
const calls = (ops, name) => ops.filter((o) => o[0] === name);

describe('CanvasBuilder', () => {
  it('circle: arc, filled and stroked as styled', () => {
    const { ops, ctx } = rec();
    new CanvasBuilder(ctx).circle(10, 20, 5, { fill: 'red', stroke: '#000', 'stroke-width': 2 });
    assert.deepEqual(calls(ops, 'arc')[0], ['arc', 10, 20, 5, 0, Math.PI * 2]);
    assert.equal(calls(ops, 'fill').length, 1);
    assert.equal(calls(ops, 'stroke').length, 1);
    assert.ok(ops.some((o) => o[0] === 'set' && o[1] === 'lineWidth' && o[2] === 2));
  });
  it('polyline is not filled by default; fill none and stroke none paint nothing', () => {
    const { ops, ctx } = rec();
    const b = new CanvasBuilder(ctx);
    b.polyline([[0, 0], [1, 1], [2, 0]], { stroke: 'blue' });
    assert.equal(calls(ops, 'fill').length, 0);
    assert.equal(calls(ops, 'lineTo').length, 2);
    b.rect(0, 0, 1, 1, { fill: 'none', stroke: 'none' });
    assert.equal(calls(ops, 'fill').length + calls(ops, 'stroke').length, 1);
  });
  it('opacity and fill-opacity multiply; dashes are set and cleared', () => {
    const { ops, ctx } = rec();
    new CanvasBuilder(ctx).rect(0, 0, 1, 1, { fill: 'red', opacity: 0.5, 'fill-opacity': 0.5, stroke: 'black', 'stroke-dasharray': '4 2' });
    assert.ok(ops.some((o) => o[0] === 'set' && o[1] === 'globalAlpha' && o[2] === 0.25));
    assert.deepEqual(calls(ops, 'setLineDash').map((o) => o[1]), [[4, 2], []]);
  });
  it('text: anchor and baseline map to canvas alignment', () => {
    const { ops, ctx } = rec();
    new CanvasBuilder(ctx).text(5, 6, 'N', { 'font-size': 14, 'font-family': 'serif', 'text-anchor': 'middle', 'dominant-baseline': 'central', fill: '#333' });
    const set = (k) => ops.find((o) => o[0] === 'set' && o[1] === k)[2];
    assert.equal(set('font'), '14px serif');
    assert.equal(set('textAlign'), 'center');
    assert.equal(set('textBaseline'), 'middle');
    assert.deepEqual(calls(ops, 'fillText')[0], ['fillText', 'N', 5, 6]);
  });
  it('path: M L H V Z (absolute and relative); anything else is refused', () => {
    const { ops, ctx } = rec();
    const b = new CanvasBuilder(ctx);
    b.path('M0,0L10,0V10h-5z', { stroke: 'black', fill: 'none' });
    assert.deepEqual(ops.filter((o) => ['moveTo', 'lineTo', 'closePath'].includes(o[0])), [['moveTo', 0, 0], ['lineTo', 10, 0], ['lineTo', 10, 10], ['lineTo', 5, 10], ['closePath']]);
    assert.throws(() => b.path('M0 0 C1 1 2 2 3 3'), /not supported/);
  });
  it('a clip group: save, the circle as a clip, restore', () => {
    const { ops, ctx } = rec();
    new CanvasBuilder(ctx).clipCircle('c', 50, 50, 40).openClipGroup('c').closeGroup();
    assert.deepEqual(ops.map((o) => o[0]), ['save', 'beginPath', 'arc', 'clip', 'restore']);
  });
});

describe('Stereonet.draw', () => {
  const net = () => {
    const sn = new Stereonet({ size: 300 });
    sn.pole(120, 45).line(30, 20).plane(200, 60);
    return sn;
  };
  it('draws what svg() writes: one shape per SVG shape, one text per label, balanced save/restore', () => {
    const sn = net(), svg = sn.svg(), { ops, ctx } = rec();
    sn.draw(ctx);
    const shapes = (svg.match(/<(circle|line|polyline|path|rect)\b/g) || []).length - (svg.match(/<clipPath>?[^]*?<\/clipPath>/g) || []).length;
    assert.equal(calls(ops, 'beginPath').length - calls(ops, 'clip').length, shapes);
    assert.equal(calls(ops, 'fillText').length, (svg.match(/<text\b/g) || []).length);
    assert.equal(calls(ops, 'save').length, calls(ops, 'restore').length);
  });
  it('draws at a position and size', () => {
    const { ops, ctx } = rec();
    net().draw(ctx, { x: 10, y: 20, size: 150 });
    assert.deepEqual(ops.slice(0, 3), [['save'], ['translate', 10, 20], ['scale', 0.5, 0.5]]);
  });
  it('svg() is unchanged by the refactor (a builder in, a string out)', () => {
    const s = net().svg();
    assert.ok(s.startsWith('<svg') && s.includes('</svg>') && s.includes('clip-path'));
  });
});
