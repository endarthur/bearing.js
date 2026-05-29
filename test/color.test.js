import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scales, sampleScale, colorScale, mapValue } from '../src/color.js';

describe('color scales', () => {
  it('sampleScale returns a CSS rgb() string', () => {
    assert.match(sampleScale('viridis', 0.5), /^rgb\(\d+,\d+,\d+\)$/);
  });

  it('endpoints match the first and last control points', () => {
    const v = scales.viridis;
    const first = `rgb(${v[0][0]},${v[0][1]},${v[0][2]})`;
    const last = `rgb(${v[4][0]},${v[4][1]},${v[4][2]})`;
    assert.strictEqual(sampleScale('viridis', 0), first);
    assert.strictEqual(sampleScale('viridis', 1), last);
  });

  it('clamps out-of-range t', () => {
    assert.strictEqual(sampleScale('magma', -5), sampleScale('magma', 0));
    assert.strictEqual(sampleScale('magma', 5), sampleScale('magma', 1));
  });

  it('unknown scale falls back to viridis', () => {
    assert.strictEqual(sampleScale('nope', 0.3), sampleScale('viridis', 0.3));
  });

  it('grayscale midpoint is mid-gray', () => {
    assert.strictEqual(sampleScale('grayscale', 0.5), 'rgb(128,128,128)');
  });

  it('colorScale returns an interpolator; reverse flips endpoints', () => {
    const fwd = colorScale('viridis');
    const rev = colorScale('viridis', { reverse: true });
    assert.strictEqual(typeof fwd, 'function');
    assert.strictEqual(rev(0), fwd(1));
    assert.strictEqual(rev(1), fwd(0));
  });

  it('mapValue maps min→start and max→end', () => {
    assert.strictEqual(mapValue('plasma', 10, 10, 20), sampleScale('plasma', 0));
    assert.strictEqual(mapValue('plasma', 20, 10, 20), sampleScale('plasma', 1));
    assert.strictEqual(mapValue('plasma', 15, 10, 20), sampleScale('plasma', 0.5));
  });

  it('mapValue handles a degenerate range', () => {
    assert.strictEqual(mapValue('viridis', 5, 5, 5), sampleScale('viridis', 0));
  });
});
