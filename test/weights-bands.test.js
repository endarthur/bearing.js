// densityGrid weights (Terzaghi and the like) and the banded heatmap (filled contours)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { densityGrid } from '../src/contouring.js';
import { Stereonet } from '../src/stereonet.js';
import { planeToDcos } from '../src/core/conversions.js';

const poles = [[0, 80], [10, 75], [350, 82], [180, 40], [200, 45]].map(([dd, dip]) => planeToDcos(dd, dip));

test('weights all equal reproduce the unweighted grid (both methods)', () => {
  for (const method of ['kamb', 'fisher']) {
    const a = densityGrid(poles, { method, gridSize: 21 }), b = densityGrid(poles, { method, gridSize: 21, weights: poles.map(() => 7) });
    for (let i = 0; i < a.grid.length; i++) if (!Number.isNaN(a.grid[i])) assert.ok(Math.abs(a.grid[i] - b.grid[i]) < 1e-9, `${method} ${i}`);
  }
});

test('a heavier weight pulls density toward its measurement; a bad weight counts as 0; a wrong length is ignored', () => {
  const g0 = densityGrid(poles, { method: 'fisher', gridSize: 31 });
  const g1 = densityGrid(poles, { method: 'fisher', gridSize: 31, weights: [1, 1, 1, 10, 10] });
  const max = (g) => { let k = -1, v = -Infinity; g.grid.forEach((x, i) => { if (x > v) { v = x; k = i; } }); return k; };
  assert.notEqual(max(g0), max(g1), 'the peak moved to the heavy pair');
  const bad = densityGrid(poles, { method: 'kamb', gridSize: 21, weights: [1, 1, 1, NaN, -3] });
  const zero = densityGrid(poles, { method: 'kamb', gridSize: 21, weights: [1, 1, 1, 0, 0] });
  assert.deepEqual([...bad.grid].map((v) => (Number.isNaN(v) ? 'n' : v.toFixed(9))), [...zero.grid].map((v) => (Number.isNaN(v) ? 'n' : v.toFixed(9))), 'NaN and negative weights count as 0');
  const wrong = densityGrid(poles, { method: 'kamb', gridSize: 21, weights: [1, 2] }), plain = densityGrid(poles, { method: 'kamb', gridSize: 21 });
  assert.deepEqual([...wrong.grid].map((v) => (Number.isNaN(v) ? 'n' : v.toFixed(9))), [...plain.grid].map((v) => (Number.isNaN(v) ? 'n' : v.toFixed(9))));
});

test('a banded heatmap colours each cell by the band its density falls in, and leaves cells below the first level empty', () => {
  const sn = new Stereonet({ size: 200 });
  sn.heatmap(poles, { method: 'kamb', gridSize: 31, levels: [0.5, 1.2], colors: ['#aaa', '#333'] });
  const fills = new Set(); let n = 0;
  sn._heatmapCells((x, y, s, f) => { fills.add(f); n++; });
  assert.ok(n > 0 && [...fills].every((f) => f === '#aaa' || f === '#333'), [...fills].join());
  const { grid, gridSize, step, projR } = sn._heatmapData;
  let above = 0;
  for (let j = 0; j < gridSize; j++) for (let i = 0; i < gridSize; i++) {
    const v = grid[j * gridSize + i], x = -projR + i * step, y = projR - j * step;
    if (!Number.isNaN(v) && v >= 0.5 && x * x + y * y <= projR * projR) above++;
  }
  assert.equal(n, above, 'one cell per grid value ≥ the first level, inside the net');
});

test('a graticule spacing of 0 draws no graticule', () => {
  const on = new Stereonet({ size: 200 }).svg(), off = new Stereonet({ size: 200, gridSpacing: 0 }).svg();
  assert.ok(off.length < on.length * 0.5, `${off.length} vs ${on.length}`);
});

test('a weighted rose sums weights per sector (both ends, when axial); no weights counts as before', async () => {
  const { roseBins } = await import('../src/rose.js');
  const az = [10, 12, 100];
  const plain = roseBins(az, { binWidth: 10 }), w = roseBins(az, { binWidth: 10, weights: [2, 3, 10] });
  assert.equal(plain.bins[1].count, 2); assert.equal(w.bins[1].count, 5); assert.equal(w.bins[10].count, 10); assert.equal(w.maxCount, 10);
  const ax = roseBins(az, { binWidth: 10, axial: true, weights: [2, 3, 10] });
  assert.equal(ax.bins[19].count, 5, 'the opposite end carries the same weight');
  assert.equal(roseBins(az, { binWidth: 10, weights: [1, -4, NaN] }).n, 1, 'a weight that is not positive counts 0');
});
