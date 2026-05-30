import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  dipVector, resolveSense, ptAxes, michael, principalStresses, dihedraGrid,
} from '../src/fault.js';
import { planeToDcos } from '../src/core/conversions.js';
import * as vec3 from '../src/core/vec3.js';

const mulMatVec = (m, v) => [
  m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
  m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
  m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
];
// Shear-traction (slip) direction a stress σ produces on a plane with normal n.
const shearSlip = (sigma, n) => {
  const t = mulMatVec(sigma, n);
  const tau = vec3.sub(t, vec3.scale(n, vec3.dot(t, n)));
  return vec3.normalize(tau);
};
const alignsWith = (a, b) => Math.abs(vec3.dot(vec3.normalize(a), vec3.normalize(b))) > 0.99;

describe('dipVector', () => {
  it('points down-dip (toward the dip direction, downward)', () => {
    const d = dipVector(planeToDcos(90, 45)); // dips East at 45°
    assert.ok(d[0] > 0.5, `east component ${d[0]}`);
    assert.ok(d[2] < 0, `downward ${d[2]}`);
    assert.ok(Math.abs(vec3.length(d) - 1) < 1e-9);
  });
});

describe('resolveSense', () => {
  const n = planeToDcos(90, 60);
  const line = [0, 0, -1];
  it('normal keeps the line; inverse flips it', () => {
    assert.deepStrictEqual(resolveSense(n, line, 'n'), { slip: line, defined: true });
    assert.deepStrictEqual(resolveSense(n, line, 'i').slip, vec3.negate(line));
  });
  it('unknown sense is undefined', () => {
    assert.strictEqual(resolveSense(n, line, 'u').defined, false);
  });
  it('dextral and sinistral give opposite slip', () => {
    const d = resolveSense(n, line, 'd').slip;
    const s = resolveSense(n, line, 's').slip;
    assert.deepStrictEqual(d, vec3.negate(s));
  });
});

describe('ptAxes', () => {
  it('P and T are orthonormal and at 45° to plane and slip', () => {
    const n = [0, 0, -1], s = [1, 0, 0];
    const { p, t } = ptAxes(n, s);
    assert.ok(Math.abs(vec3.length(p) - 1) < 1e-9 && Math.abs(vec3.length(t) - 1) < 1e-9);
    assert.ok(Math.abs(vec3.dot(p, t)) < 1e-9, 'P ⟂ T');
    assert.ok(Math.abs(Math.abs(vec3.dot(p, n)) - Math.SQRT1_2) < 1e-9, 'P at 45° to n');
    assert.ok(Math.abs(Math.abs(vec3.dot(t, s)) - Math.SQRT1_2) < 1e-9, 'T at 45° to s');
  });
});

describe('michael paleostress inversion', () => {
  // Planted deviatoric stress with principal axes along x (σ-extreme) and z.
  const sigma = [1, 0, 0, 0, 0, 0, 0, 0, -1];
  const planes = [
    [1, 1, 1], [1, -1, 1], [1, 1, -1], [2, 1, 1],
    [1, 2, 1], [1, 1, 2], [2, -1, 1], [1, 2, -1],
  ].map(vec3.normalize);
  const slips = planes.map(n => shearSlip(sigma, n));

  it('recovers the stress tensor up to scale/sign', () => {
    // Michael's unit-traction assumption makes recovery of physical shear-
    // direction data approximate, so this is a strong but not exact match.
    const { stress } = michael(planes, slips);
    const dotF = sigma.reduce((acc, v, i) => acc + v * stress[i], 0);
    const cos = dotF / (Math.hypot(...sigma) * Math.hypot(...stress));
    assert.ok(Math.abs(cos) > 0.99, `proportional, |cos| = ${Math.abs(cos)}`);
  });

  it('explains noise-free synthetic slip well (small relative residual)', () => {
    const { residual } = michael(planes, slips);
    assert.ok(residual >= 0 && residual / slips.length < 0.05, `relative residual ${residual / slips.length}`);
  });

  it('principal axes recover the planted eigenvectors', () => {
    const { axes } = principalStresses(michael(planes, slips).stress);
    // extreme axes (σ1, σ3) align with x and z; intermediate (σ2) with y
    assert.ok(alignsWith(axes[0], [1, 0, 0]) || alignsWith(axes[0], [0, 0, 1]));
    assert.ok(alignsWith(axes[2], [1, 0, 0]) || alignsWith(axes[2], [0, 0, 1]));
    assert.ok(alignsWith(axes[1], [0, 1, 0]));
  });
});

describe('dihedraGrid', () => {
  const planes = [planeToDcos(90, 60), planeToDcos(80, 55)];
  const slips = [[0, 0, -1], [0.1, 0, -0.99]].map(vec3.normalize);

  it('matches the densityGrid return shape', () => {
    const g = dihedraGrid(planes, slips, { gridSize: 30 });
    assert.deepStrictEqual(Object.keys(g).sort(), ['grid', 'gridSize', 'projR', 'projection', 'step']);
    assert.strictEqual(g.grid.length, 30 * 30);
  });

  it('has both compressional (+) and extensional (−) cells', () => {
    const { grid } = dihedraGrid(planes, slips, { gridSize: 36 });
    const finite = [...grid].filter(Number.isFinite);
    assert.ok(finite.some(v => v > 0), 'a P (compression) dihedron exists');
    assert.ok(finite.some(v => v < 0), 'a T (extension) dihedron exists');
  });
});
