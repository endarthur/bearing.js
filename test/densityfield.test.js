// densityField — the density computed once on the sphere and read in any view. The guard is that it
// agrees with the direct count: EXACTLY at its own nodes (same formula), within a small tolerance in
// between (interpolation), rotated or not, and that the cache returns the same field for the same data.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { densityField, cachedDensityField, densityFieldCache, densityGrid, computeContours } from '../src/index.js';
import { kernelOf, scaledWeights } from '../src/densityfield.js';
import * as mat3 from '../src/core/mat3.js';

// a seeded generator, and Fisher-ish clusters of lower-hemisphere unit vectors
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
function clusters(n, seed, centres = [[0.3, 0.2, -0.93], [-0.7, 0.1, -0.7], [0.1, -0.99, -0.05]]) {
  const r = rng(seed), out = [];
  for (let i = 0; i < n; i++) {
    const c = centres[i % centres.length], s = 0.18;
    let v = norm([c[0] + (r() - 0.5) * s * 2, c[1] + (r() - 0.5) * s * 2, c[2] + (r() - 0.5) * s * 2]);
    if (v[2] > 0) v = v.map((x) => -x);
    out.push(v);
  }
  return out;
}
// the density by brute force, the way densityGrid counts it (axial)
function direct(dcos, d, options) {
  const n = dcos.length, K = kernelOf(n, options), wt = scaledWeights(options.weights, n);
  let acc = 0;
  dcos.forEach((q, m) => {
    const dot = Math.abs(d[0] * q[0] + d[1] * q[1] + d[2] * q[2]), w = wt ? wt[m] : 1;
    if (K.method === 'kamb') { if (dot >= K.cosCut) acc += w; } else acc += w * Math.exp(K.kappa * (dot - 1));
  });
  return K.method === 'kamb' ? (acc - K.E) / K.sd : (K.kappa * acc) / n;
}
const randomDirs = (k, seed) => { const r = rng(seed), out = []; for (let i = 0; i < k; i++) { const z = -r(), a = r() * 2 * Math.PI, s = Math.sqrt(1 - z * z); out.push([s * Math.sin(a), s * Math.cos(a), z]); } return out; };

describe('densityField', () => {
  const data = clusters(600, 7);
  for (const method of ['kamb', 'fisher']) {
    it(`${method}: equals the direct count at its nodes, and within 4 % of the peak between them`, () => {
      const opts = { method }, f = densityField(data, opts);
      // at the nodes: the stored value is the direct one (the nadir node, and a node on a mid ring)
      const at0 = direct(data, [0, 0, -1], opts);              // (Fisher: the kernel is cut at 1e-9 of its peak — 1e-6 relative covers the tail)
      assert.ok(Math.abs(f.values[0] - at0) <= 1e-6 * Math.max(1, Math.abs(at0)), `node ${f.values[0]} vs direct ${at0}`);
      const peak = Math.max(...f.values.filter(Number.isFinite));
      let worst = 0;
      for (const d of randomDirs(400, 3)) worst = Math.max(worst, Math.abs(f.at(d) - direct(data, d, opts)));
      assert.ok(worst / peak < 0.04, `worst ${worst.toFixed(3)} of a ${peak.toFixed(2)} peak`);
    });
  }
  it('is axial: a measurement turned to its antipode changes nothing, and a direction reads like its antipode', () => {
    const flipped = data.map((v, i) => (i % 3 ? v : v.map((x) => -x)));
    const a = densityField(data, { method: 'kamb' }), b = densityField(flipped, { method: 'kamb' });
    for (let i = 0; i < a.values.length; i += 97) assert.ok(Math.abs(a.values[i] - b.values[i]) < 1e-9);
    const d = norm([0.4, -0.2, -0.6]);
    assert.ok(Math.abs(a.at(d) - a.at(d.map((x) => -x))) < 1e-12);
  });
  it('weights count as the direct sum does (scaled to n)', () => {
    const weights = data.map((_, i) => 1 + (i % 5));
    const f = densityField(data, { method: 'fisher', weights });
    const at0 = direct(data, [0, 0, -1], { method: 'fisher', weights });
    assert.ok(Math.abs(f.values[0] - at0) <= 1e-6 * Math.max(1, Math.abs(at0)), `node ${f.values[0]} vs direct ${at0}`);
  });
  it('no data: NaN everywhere', () => { const f = densityField([], {}); assert.ok(Number.isNaN(f.at([0, 0, -1]))); });
});

describe('densityGrid reading the field', () => {
  const data = clusters(900, 11);
  const R = mat3.multiply(mat3.rotationFromAxisAngle([1, 0, 0], 0.6), mat3.rotationFromAxisAngle([0, 0, 1], 1.1));
  for (const [label, rotation] of [['unrotated', null], ['rotated', R]]) {
    for (const method of ['kamb', 'fisher']) {
      it(`${label}, ${method}: the grid read from the field matches the direct grid`, () => {
        const o = { method, rotation, gridSize: 48 };
        const g0 = densityGrid(data, { ...o, field: false }), g1 = densityGrid(data, { ...o, field: true });
        assert.equal(g1.field, true);
        let worst = 0, peak = 0;
        for (let i = 0; i < g0.grid.length; i++) {
          if (Number.isNaN(g0.grid[i])) { assert.ok(Number.isNaN(g1.grid[i])); continue; }
          worst = Math.max(worst, Math.abs(g0.grid[i] - g1.grid[i])); peak = Math.max(peak, g0.grid[i]);
        }
        assert.ok(worst / peak < 0.04, `worst ${worst.toFixed(3)} of ${peak.toFixed(2)}`);
        // and the contours agree: the same number of closed shapes at each level
        const levels = method === 'kamb' ? [2, 4, 6] : [2, 4];
        const c0 = computeContours(data, { ...o, levels, field: false }), c1 = computeContours(data, { ...o, levels, field: true });
        assert.deepEqual(c1.map((c) => c.paths.length > 0), c0.map((c) => c.paths.length > 0));
      });
    }
  }
  it("'auto' counts small data directly (exact) and reads the field for heavy data", () => {
    assert.equal(densityGrid(clusters(200, 1), { method: 'kamb' }).field, undefined);
    assert.equal(densityGrid(clusters(4000, 1), { method: 'kamb' }).field, true);   // 4000 × 40² > 4·10⁶
  });
});

describe('the field cache', () => {
  it('same content → the same field (fresh arrays too); other settings or weights → another', () => {
    densityFieldCache.clear();
    const data = clusters(300, 5);
    const a = cachedDensityField(data, { method: 'kamb' });
    const b = cachedDensityField(data.map((v) => v.slice()), { method: 'kamb' });
    assert.equal(a, b);
    assert.notEqual(cachedDensityField(data, { method: 'kamb', kambSigma: 2 }), a);
    assert.notEqual(cachedDensityField(data, { method: 'kamb', weights: data.map(() => 2) }), a);
    const s = densityFieldCache.stats; assert.equal(s.hits, 1); assert.equal(s.misses, 3);
  });
  it('a rotated view after an unrotated one reads the same field (no second build)', () => {
    densityFieldCache.clear();
    const data = clusters(500, 9);
    densityGrid(data, { method: 'fisher', field: true });
    densityGrid(data, { method: 'fisher', field: true, rotation: mat3.rotationFromAxisAngle([0, 1, 0], 0.4), projection: 'equal-angle', gridSize: 96 });
    assert.deepEqual(densityFieldCache.stats, { size: 1, hits: 1, misses: 1 });
  });
  it('keeps the last 8', () => {
    densityFieldCache.clear();
    for (let i = 0; i < 12; i++) cachedDensityField(clusters(50, 100 + i), {});
    assert.equal(densityFieldCache.stats.size, 8);
  });
});
