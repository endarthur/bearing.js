// The inversions, checked against stresses we choose: faults are generated from a known tensor (each slips
// along the shear traction it carries — Wallace–Bott, tension positive), and an inversion must give that
// tensor's axes and φ back. Also the misfit, the bootstrap, the counting dihedra, and the density methods
// 'percent' and 'cosine' (direct count = field, and a uniform spread reads ≈ 1).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fault, densityGrid, densityField } from '../src/index.js';

const { michael, fryInversion, principalStresses, stressRatio, slipMisfit, shearTraction, bootstrapStress, dihedraCountGrid } = fault;
const norm = (v) => { const l = Math.hypot(...v); return v.map((x) => x / l); };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const axAngle = (u, v) => Math.acos(Math.min(1, Math.abs(dot(u, v)))) * 180 / Math.PI;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// a stress from principal axes (σ1 most compressive, tension positive) and values
function tensor(axes, values) {
  const S = new Array(9).fill(0);
  axes.forEach((a, k) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i * 3 + j] += values[k] * a[i] * a[j]; });
  return S;
}
// faults of random attitude slipping along their shear traction; noise: degrees of random turn in the plane
function faultsFrom(S, n, seed, noise = 0) {
  const r = rng(seed), planes = [], slips = [];
  while (planes.length < n) {
    const p = norm([r() - 0.5, r() - 0.5, r() - 0.5]), tau = shearTraction(S, p), l = Math.hypot(...tau);
    if (l < 0.05) continue;
    let s = tau.map((x) => x / l);
    if (noise) {                                         // turn the slip in the plane by a random angle up to ±noise
      const up = fault.upwardNormal(p), b = norm([up[1] * s[2] - up[2] * s[1], up[2] * s[0] - up[0] * s[2], up[0] * s[1] - up[1] * s[0]]);
      const a = (r() * 2 - 1) * noise * Math.PI / 180;
      s = norm(s.map((x, k) => x * Math.cos(a) + b[k] * Math.sin(a)));
    }
    planes.push(p); slips.push(s);
  }
  return { planes, slips };
}
const E = [1, 0, 0], N = [0, 1, 0], U = [0, 0, 1];
const NORMAL = { axes: [U, N, E], values: [-1, -0.6, 0], phi: 0.6 };              // σ1 vertical, σ3 E–W
const THRUST = { axes: [norm([1, 1, 0]), norm([1, -1, 0]), U], values: [-1, -0.25, 0], phi: 0.25 };   // σ1 NE–SW horizontal, σ3 vertical

describe('fault inversions recover the stress the faults came from', () => {
  for (const [name, T] of [['normal faulting', NORMAL], ['thrusting', THRUST]]) {
    const S = tensor(T.axes, T.values);
    for (const [label, invert] of [['Fry (B axis)', (P, Sl) => fryInversion(P, Sl).stress], ['Michael', (P, Sl) => michael(P, Sl).stress]]) {
      it(`${label}, ${name}: σ1, σ3 and φ back from 40 exact faults`, () => {
        const { planes, slips } = faultsFrom(S, 40, 3);
        const st = invert(planes, slips), p = principalStresses(st);
        // Michael assumes every fault carries the same shear magnitude; these don't, so it is a little off
        // (1–2°) even on exact data — the bias Fry's B-axis condition doesn't have
        const tol = label.startsWith('Fry') ? 1 : 3;
        assert.ok(axAngle(p.axes[0], T.axes[0]) < tol, `σ1 off by ${axAngle(p.axes[0], T.axes[0]).toFixed(2)}°`);
        assert.ok(axAngle(p.axes[2], T.axes[2]) < tol, `σ3 off by ${axAngle(p.axes[2], T.axes[2]).toFixed(2)}°`);
        if (label.startsWith('Fry')) {                   // Fry assumes nothing of the shear magnitudes: φ exact
          assert.ok(Math.abs(stressRatio(st) - T.phi) < 0.01, `φ ${stressRatio(st).toFixed(3)} vs ${T.phi}`);
          assert.ok(slipMisfit(st, planes, slips).mean < 0.5);
        }
      });
    }
    it(`Fry, ${name}: with ±10° of noise on the slips, the axes within a few degrees`, () => {
      const { planes, slips } = faultsFrom(S, 60, 9, 10);
      const p = principalStresses(fryInversion(planes, slips).stress);
      assert.ok(axAngle(p.axes[0], T.axes[0]) < 6 && axAngle(p.axes[2], T.axes[2]) < 6);
    });
  }
  it('the sense decides the sign: the same lines with every slip reversed give σ1 and σ3 swapped', () => {
    const { planes, slips } = faultsFrom(tensor(NORMAL.axes, NORMAL.values), 40, 4);
    const a = principalStresses(fryInversion(planes, slips).stress), b = principalStresses(fryInversion(planes, slips.map((v) => v.map((x) => -x))).stress);
    assert.ok(axAngle(a.axes[0], b.axes[2]) < 1 && axAngle(a.axes[2], b.axes[0]) < 1);
  });
  it('fryInversion returns a deviatoric tensor of unit norm, its eigenvalues ascending, the first ≈ 0 for exact data', () => {
    const { planes, slips } = faultsFrom(tensor(THRUST.axes, THRUST.values), 30, 8);
    const r = fryInversion(planes, slips);
    assert.ok(Math.abs(r.stress[0] + r.stress[4] + r.stress[8]) < 1e-12);
    assert.ok(Math.abs(Math.hypot(...r.stress) - 1) < 1e-9);
    assert.ok(r.eigenvalues[0] < 1e-9 && r.eigenvalues[1] > 1e-3);
  });
});

describe('slipMisfit and stressRatio', () => {
  const S = tensor(NORMAL.axes, NORMAL.values), { planes, slips } = faultsFrom(S, 20, 2);
  it('0° for slips that follow the shear traction, 180° for slips against it', () => {
    assert.ok(slipMisfit(S, planes, slips).mean < 1e-6);
    assert.ok(Math.abs(slipMisfit(S, planes, slips.map((v) => v.map((x) => -x))).mean - 180) < 1e-6);
  });
  it('φ of a tensor built with known values', () => { assert.ok(Math.abs(stressRatio(S) - 0.6) < 1e-12); });
});

describe('bootstrapStress', () => {
  const S = tensor(NORMAL.axes, NORMAL.values);
  it('clean data: tight cones and a φ interval holding the truth; the same seed gives the same answer', () => {
    const { planes, slips } = faultsFrom(S, 40, 5, 5);
    for (const method of ['fry', 'michael']) {
      const b = bootstrapStress(planes, slips, { method, n: 200, seed: 7 });
      assert.ok(b.sigma1.cone95 < 8 && b.sigma3.cone95 < 8, `${method}: cones ${b.sigma1.cone95.toFixed(1)} / ${b.sigma3.cone95.toFixed(1)}`);
      if (method === 'fry') assert.ok(b.phi.lo <= 0.6 && 0.6 <= b.phi.hi, `φ [${b.phi.lo.toFixed(2)}, ${b.phi.hi.toFixed(2)}]`);
      assert.deepEqual(bootstrapStress(planes, slips, { method, n: 200, seed: 7 }), b);
    }
  });
  it('noisier data → wider cones', () => {
    const a = faultsFrom(S, 30, 6, 2), b = faultsFrom(S, 30, 6, 25);
    assert.ok(bootstrapStress(b.planes, b.slips, { method: 'fry', n: 200 }).sigma1.cone95 > bootstrapStress(a.planes, a.slips, { method: 'fry', n: 200 }).sigma1.cone95);
  });
});

describe('dihedraCountGrid (Angelier & Mechler 1977)', () => {
  it('normal faults: ≈ 100 % P at the vertical (σ1), ≈ 0 % at the horizontal σ3; values are percentages', () => {
    const { planes, slips } = faultsFrom(tensor(NORMAL.axes, NORMAL.values), 40, 11);
    const g = dihedraCountGrid(planes, slips, { gridSize: 41 }), c = 20;   // the centre cell = straight down
    assert.ok(g.grid[c * 41 + c] > 95, `centre ${g.grid[c * 41 + c]}`);
    // σ3 is E–W: the east rim (lower hemisphere, horizontal east) is at the right edge of the middle row
    const east = g.grid[c * 41 + 40 - 1];
    assert.ok(east < 10, `east ${east}`);
    for (const v of g.grid) if (Number.isFinite(v)) assert.ok(v >= 0 && v <= 100);
  });
});

describe("density methods 'percent' and 'cosine'", () => {
  const r = rng(21), uniform = Array.from({ length: 4000 }, () => { const z = -r(), a = r() * 2 * Math.PI, q = Math.sqrt(1 - z * z); return [q * Math.sin(a), q * Math.cos(a), z]; });
  for (const method of ['percent', 'cosine']) {
    it(`${method}: a uniform spread reads ≈ 1 (per cent per 1 % area / MUD), and the field matches the direct count`, () => {
      const g = densityGrid(uniform, { method, gridSize: 31, field: false });
      const vals = [...g.grid].filter(Number.isFinite), mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      assert.ok(Math.abs(mean - 1) < 0.15, `mean ${mean.toFixed(3)}`);
      // against the field at a kernel the 1.2° nodes can follow (the default for 4 000 points is ~1.4° wide)
      const o = { method, gridSize: 31, ...(method === 'cosine' ? { cosinePower: 60 } : {}) };
      const g2 = densityGrid(uniform, { ...o, field: false }), f = densityGrid(uniform, { ...o, field: true });
      let worst = 0; for (let i = 0; i < g2.grid.length; i++) if (Number.isFinite(g2.grid[i])) worst = Math.max(worst, Math.abs(g2.grid[i] - f.grid[i]));
      assert.ok(worst < 0.35, `worst ${worst.toFixed(3)}`);
    });
  }
  it("'percent' takes its circle's area: 2 % of the hemisphere counts more per circle, the same per 1 %", () => {
    const f1 = densityField(uniform, { method: 'percent', areaPercent: 1 }), f2 = densityField(uniform, { method: 'percent', areaPercent: 2 });
    const m = (f) => [...f.values].reduce((a, b) => a + b, 0) / f.values.length;
    assert.ok(Math.abs(m(f1) - m(f2)) < 0.1);
  });
});
