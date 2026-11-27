// Geology oracles: tests against KNOWN STRUCTURAL GEOLOGY, not just mathematical properties.
// The rest of the suite checks shapes and identities (orthonormal, opposite signs, return types);
// these check that a normal fault comes out as a normal fault. Each case below failed before the
// fix it guards (review of 0.2.4, 2026-11-22).
//
// Conventions (see the module headers): x = East, y = North, z = Up; a fault is (pole, slip) with
// slip the HANGING-WALL motion. The sign of the pole doesn't matter: every function takes either.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSense, ptAxes, michael, principalStresses, dihedraGrid } from '../src/fault.js';
import { planeToDcos, lineToDcos, dcosToLine } from '../src/core/conversions.js';
import { fisherStats, meanVector, confidenceCone } from '../src/statistics.js';
import { densityGrid } from '../src/contouring.js';
import { inverse as eaInverse } from '../src/projections/equal-area.js';
import { inverse as egInverse } from '../src/projections/equal-angle.js';
import * as vec3 from '../src/core/vec3.js';

const tp = (v) => dcosToLine(v);                                   // [trend, plunge] (lower hemisphere)
const angDiff = (a, b) => { const d = Math.abs(((a - b) % 360 + 360) % 360); return Math.min(d, 360 - d); };
const axialTrendNear = (t, want, tol) => angDiff(t, want) <= tol || angDiff(t, want + 180) <= tol;

// a fault from a plane (dip direction / dip), a slickenline (trend / plunge) and a sense code
const fault = (dd, dip, tr, pl, sense, { upPole = false } = {}) => {
  const n = planeToDcos(dd, dip);
  const { slip, defined } = resolveSense(upPole ? vec3.negate(n) : n, lineToDcos(tr, pl), sense);
  return { n: upPole ? vec3.negate(n) : n, slip, defined };
};

describe('P and T axes', () => {
  for (const upPole of [false, true]) {
    it(`normal fault 090/60, down-dip slip: P steep, T horizontal E–W (${upPole ? 'upward' : 'downward'} pole)`, () => {
      const f = fault(90, 60, 90, 60, 'N', { upPole });
      const { p, t } = ptAxes(f.n, f.slip);
      assert.ok(tp(p)[1] > 60, `P ${tp(p)} should be steep`);
      assert.ok(tp(t)[1] < 30 && axialTrendNear(tp(t)[0], 90, 1), `T ${tp(t)} should be ~horizontal E–W`);
    });
    it(`reverse fault 090/30, up-dip slip: P horizontal E–W, T steep (${upPole ? 'upward' : 'downward'} pole)`, () => {
      const f = fault(90, 30, 90, 30, 'R', { upPole });
      const { p, t } = ptAxes(f.n, f.slip);
      assert.ok(tp(p)[1] < 30 && axialTrendNear(tp(p)[0], 90, 1), `P ${tp(p)} should be ~horizontal E–W`);
      assert.ok(tp(t)[1] > 60, `T ${tp(t)} should be steep`);
    });
  }
  it('dextral strike-slip on a vertical E–W plane: P NW–SE, T NE–SW, both horizontal', () => {
    // dextral on an E–W fault: the north block moves E, the south block W — the square's NE corner
    // runs away from its SW corner (T NE–SW) and its NW and SE corners close in (P NW–SE)
    for (const pole of [planeToDcos(0, 90), planeToDcos(180, 90)]) {
      const { slip } = resolveSense(pole, lineToDcos(90, 0), 'D');
      const { p, t } = ptAxes(pole, slip);
      assert.ok(tp(p)[1] < 1 && tp(t)[1] < 1, 'both horizontal');
      assert.ok(axialTrendNear(tp(p)[0], 135, 1), `P ${tp(p)} should be NW–SE`);
      assert.ok(axialTrendNear(tp(t)[0], 45, 1), `T ${tp(t)} should be NE–SW`);
    }
  });
});

describe('resolveSense: the sense of slip', () => {
  // plane 090/80: strikes N, dips E; the hanging wall is the east block
  for (const [tr, pl] of [[0, 2], [180, 2]]) {
    it(`dextral on 090/80, slickenline ${tr}/${pl}: the east (hanging-wall) block moves S`, () => {
      const f = fault(90, 80, tr, pl, 'D');
      assert.ok(angDiff(Math.atan2(f.slip[0], f.slip[1]) * 180 / Math.PI, 180) < 5, `slip ${f.slip.map((v) => v.toFixed(3))} should point ~S`);
    });
    it(`sinistral on 090/80, slickenline ${tr}/${pl}: the east block moves N`, () => {
      const f = fault(90, 80, tr, pl, 'S');
      assert.ok(angDiff(Math.atan2(f.slip[0], f.slip[1]) * 180 / Math.PI, 0) < 5, `slip ${f.slip.map((v) => v.toFixed(3))} should point ~N`);
    });
  }
  it('normal codes move the hanging wall DOWN, reverse codes UP — whichever way the slickenline is given', () => {
    for (const line of [lineToDcos(90, 60), vec3.negate(lineToDcos(90, 60))]) {
      for (const c of ['N', 'n', '2', '-', 'normal']) assert.ok(resolveSense(planeToDcos(90, 60), line, c).slip[2] < 0, `${c} → down`);
      for (const c of ['I', 'R', 'r', '1', '+', 'reverse', 'inverse', 'thrust']) assert.ok(resolveSense(planeToDcos(90, 60), line, c).slip[2] > 0, `${c} → up`);
    }
  });
  it('dextral / sinistral codes and words (D 3 right-lateral · S L 4 left-lateral)', () => {
    const go = (c) => Math.atan2(...fault(90, 80, 0, 2, c).slip.slice(0, 2)) * 180 / Math.PI;
    for (const c of ['D', 'd', '3', 'dextral', 'right-lateral']) assert.ok(angDiff(go(c), 180) < 5, `${c} → dextral`);
    for (const c of ['S', 's', 'L', 'l', '4', 'sinistral', 'left-lateral']) assert.ok(angDiff(go(c), 0) < 5, `${c} → sinistral`);
  });
  it('unknown and unrecognised codes are NOT defined (U F 0 5 ? "" and anything else)', () => {
    for (const c of ['U', 'F', '0', '5', '?', '', 'X', 'q', null, undefined]) {
      assert.equal(resolveSense(planeToDcos(90, 60), lineToDcos(90, 60), c).defined, false, `code ${JSON.stringify(c)}`);
    }
  });
});

describe('paleostress', () => {
  // conjugate-ish normal faults all round + an anisotropy so σ2/σ3 are defined (the review's probe 3)
  const set = (sense, dip, upPole) => {
    const planes = [], slips = [];
    for (const dd of [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 90, 270, 90, 270]) {
      const pl = sense === 'N' ? dip : dip;
      const f = fault(dd, dip, dd, pl, sense, { upPole });
      planes.push(f.n); slips.push(f.slip);
    }
    return principalStresses(michael(planes, slips).stress);
  };
  for (const upPole of [false, true]) {
    it(`Michael: normal faults → σ1 vertical, σ3 horizontal (${upPole ? 'upward' : 'downward'} poles)`, () => {
      const ps = set('N', 60, upPole);
      assert.ok(tp(ps.axes[0])[1] > 80, `σ1 ${tp(ps.axes[0])} should be vertical`);
      assert.ok(tp(ps.axes[2])[1] < 10, `σ3 ${tp(ps.axes[2])} should be horizontal`);
    });
    it(`Michael: thrust faults → σ3 vertical, σ1 horizontal (${upPole ? 'upward' : 'downward'} poles)`, () => {
      const ps = set('R', 30, upPole);
      assert.ok(tp(ps.axes[2])[1] > 80, `σ3 ${tp(ps.axes[2])} should be vertical`);
      assert.ok(tp(ps.axes[0])[1] < 10, `σ1 ${tp(ps.axes[0])} should be horizontal`);
    });
    it(`right dihedra: the vertical is in the P (positive) dihedron of a normal fault (${upPole ? 'upward' : 'downward'} pole)`, () => {
      const f = fault(90, 60, 90, 60, 'N', { upPole });
      const g = dihedraGrid([f.n], [f.slip], { gridSize: 41 });
      assert.ok(g.grid[20 * 41 + 20] > 0, `centre ${g.grid[20 * 41 + 20]}`);
    });
  }
});

describe('axial data: a pole and its antipode are the same thing', () => {
  // a tight cluster of poles to ~090/88 and ~270/88 planes: ONE orientation family, straddling the primitive
  const poles = [];
  for (let i = 0; i < 20; i++) poles.push(planeToDcos(i % 2 ? 90 + (i % 5) : 270 - (i % 5), 88));
  const flipped = poles.map((p, i) => (i % 3 ? vec3.negate(p) : p));

  it('Fisher (axial): the mean of a cluster straddling the primitive is horizontal E–W, κ high, α95 small', () => {
    const fs = fisherStats(poles, { axial: true });
    assert.ok(tp(fs.mean)[1] < 5 && axialTrendNear(tp(fs.mean)[0], 90, 5), `mean ${tp(fs.mean)}`);
    assert.ok(fs.kappa > 50, `κ ${fs.kappa}`);
    assert.ok(fs.alpha95 < 5, `α95 ${fs.alpha95}`);
  });
  it('Fisher (axial), meanVector and confidenceCone don’t change when vectors flip to their antipodes', () => {
    const a = fisherStats(poles, { axial: true }), b = fisherStats(flipped, { axial: true });
    assert.ok(Math.abs(Math.abs(vec3.dot(a.mean, b.mean)) - 1) < 1e-12 && Math.abs(a.kappa - b.kappa) < 1e-9 && Math.abs(a.alpha95 - b.alpha95) < 1e-9);
    assert.ok(Math.abs(Math.abs(vec3.dot(meanVector(poles, { axial: true }), meanVector(flipped, { axial: true }))) - 1) < 1e-12);
    const ca = confidenceCone(poles, 0.95, { axial: true }), cb = confidenceCone(flipped, 0.95, { axial: true });
    assert.ok(Math.abs(ca.halfAngle - cb.halfAngle) < 1e-9 && Math.abs(ca.halfAngle - a.alpha95) < 1e-9);
  });
  for (const method of ['fisher', 'kamb']) {
    it(`density (${method}) is invariant when any vector flips to its antipode, and symmetric across the primitive`, () => {
      const g = densityGrid(poles, { gridSize: 41, method }), h = densityGrid(flipped, { gridSize: 41, method });
      for (let k = 0; k < g.grid.length; k++) {
        if (Number.isNaN(g.grid[k])) { assert.ok(Number.isNaN(h.grid[k])); continue; }
        assert.ok(Math.abs(g.grid[k] - h.grid[k]) < 1e-9, `cell ${k}: ${g.grid[k]} vs ${h.grid[k]}`);
      }
      const row = 20 * 41;
      assert.ok(Math.abs(g.grid[row + 1] - g.grid[row + 39]) < 1e-6 * Math.max(1, Math.abs(g.grid[row + 1])), `W ${g.grid[row + 1]} vs E ${g.grid[row + 39]}`);
    });
  }
});

describe('the primitive circle', () => {
  it('Tocher (1979): a grid node just past the rim reads the density at the diametrically opposite point', () => {
    // poles straddling the primitive near E–W. The Fisher kernel is continuous and axial, so a node beyond the
    // rim must read exactly the kernel sum at its own (upper-hemisphere) direction — which IS the value at the
    // diametrically opposite point inside the net. (Copying the rim's value differs measurably.)
    const poles = []; for (let i = 0; i < 30; i++) poles.push(planeToDcos(i % 2 ? 88 + (i % 4) : 268 - (i % 4), 85 + (i % 5)));
    const n = 40, g = densityGrid(poles, { gridSize: n }), sigma = 90 / Math.sqrt(poles.length) * Math.PI / 180, kappa = 1 / (1 - Math.cos(sigma));
    const mud = (d) => kappa / poles.length * poles.reduce((a, q) => a + Math.exp(kappa * (Math.abs(q[0] * d[0] + q[1] * d[1] + q[2] * d[2]) - 1)), 0);
    let checked = 0, differs = 0;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const px = -g.projR + i * g.step, py = g.projR - j * g.step, r2 = px * px + py * py;
      if (r2 <= g.projR * g.projR || r2 > g.projR * g.projR * 1.02) continue;
      const s = Math.sqrt(1 - r2 / 4), d = [px * s, py * s, r2 / 2 - 1];      // its true direction (upper hemisphere)
      assert.ok(d[2] > 0, 'beyond the rim is the upper hemisphere');
      assert.ok(Math.abs(g.grid[j * n + i] - mud(d)) < 1e-9, `node ${i},${j}: ${g.grid[j * n + i]} vs ${mud(d)}`);
      const k = Math.SQRT2 / Math.sqrt(r2), rim = [px * k * Math.sqrt(1 - r2 * k * k / 4), py * k * Math.sqrt(1 - r2 * k * k / 4), 0];
      if (Math.abs(mud(rim) - mud(d)) > 1e-6) differs++;
      checked++;
    }
    assert.ok(checked > 10 && differs > 0, `${checked} band nodes, ${differs} where the rim's value would differ`);
  });

  it('inverse projections are defined ON the rim, both sides', () => {
    for (const [inv, R] of [[eaInverse, Math.SQRT2], [egInverse, 1]]) {
      for (const [x, y] of [[R, 0], [-R, 0], [0, R], [0, -R], [R * Math.SQRT1_2, R * Math.SQRT1_2]]) {
        const d = inv(x, y);
        assert.ok(d && Math.abs(vec3.length(d) - 1) < 1e-12 && Math.abs(d[2]) < 1e-9, `inverse(${x}, ${y}) = ${d}`);
      }
      assert.equal(inv(R * 1.01, 0), null, 'clearly outside stays null');
    }
  });
  it('the default 40-cell grid has no NaN ring: every cell within the rim band (≥ 1.5 cells past the rim) is a number (contours close)', () => {
    const poles = [lineToDcos(90, 5), lineToDcos(270, 5), lineToDcos(0, 80)];
    for (const method of ['fisher', 'kamb']) {
      const g = densityGrid(poles, { method }), n = g.gridSize;
      for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
        // the band runs at least a cell and a half past the rim (cells straddling it need all four corners, or a
        // contour near the rim comes out dashed) — and never less than the 1.02 allowance
        const band = Math.max(g.projR * g.projR * 1.02, (g.projR + 1.5 * g.step) ** 2);
        const px = -g.projR + i * g.step, py = g.projR - j * g.step, inside = px * px + py * py <= band;
        assert.equal(Number.isFinite(g.grid[j * n + i]), inside, `${method} cell ${i},${j}`);
      }
    }
  });
  it('a density grid has no NaN ring at the rim: both edge cells of the middle row are numbers', () => {
    const poles = [lineToDcos(90, 5), lineToDcos(270, 5), lineToDcos(0, 80)];
    for (const gridSize of [40, 41]) {
      const g = densityGrid(poles, { gridSize }), mid = Math.floor(gridSize / 2) * gridSize;
      if (gridSize % 2) { assert.ok(Number.isFinite(g.grid[mid]) && Number.isFinite(g.grid[mid + gridSize - 1]), `gridSize ${gridSize}: ${g.grid[mid]} / ${g.grid[mid + gridSize - 1]}`); }
    }
  });
});
