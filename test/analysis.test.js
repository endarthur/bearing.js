import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { bestFitGreatCircle, bestFitPlane, foldAxis, unfold } from '../src/analysis.js';
import { greatCircle } from '../src/core/curves.js';
import { lineToDcos, planeToDcos } from '../src/core/conversions.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('bestFitGreatCircle / foldAxis', () => {
  // A cylindrical fold: poles to bedding lie on the great circle perpendicular
  // to the fold axis. Generate that girdle and recover the axis.
  const axisVec = lineToDcos(120, 10);
  const poles = greatCircle(axisVec, 48); // points perpendicular to the axis

  it('recovers the fold axis (V3 parallel to the true axis)', () => {
    const { pole } = bestFitGreatCircle(poles);
    assert.ok(Math.abs(dot(pole, axisVec)) > 0.999, `|pole·axis| = ${Math.abs(dot(pole, axisVec))}`);
  });

  it('reports the axis as [trend, plunge] matching the input', () => {
    const [trend, plunge] = foldAxis(poles);
    assert.ok(Math.abs(trend - 120) < 0.5 || Math.abs(trend - 300) < 0.5, `trend ${trend}`);
    assert.ok(Math.abs(plunge - 10) < 0.5, `plunge ${plunge}`);
  });

  it('a clean girdle has a high girdle index', () => {
    assert.ok(bestFitGreatCircle(poles).girdle > 0.9);
  });

  it('eigenvalues descend and sum to ~1', () => {
    const { eigenvalues } = bestFitGreatCircle(poles);
    assert.ok(eigenvalues[0] >= eigenvalues[1] && eigenvalues[1] >= eigenvalues[2]);
    assert.ok(Math.abs(eigenvalues.reduce((s, v) => s + v, 0) - 1) < 1e-9);
  });

  it('bestFitPlane returns the same plane as bestFitGreatCircle', () => {
    const gc = bestFitGreatCircle(poles);
    const bp = bestFitPlane(poles);
    assert.deepStrictEqual(bp.plane, gc.plane);
  });
});

describe('unfold', () => {
  it("restores the reference plane's pole to vertical", () => {
    for (const [dd, dip] of [[90, 30], [200, 55], [0, 80], [315, 12]]) {
      const pole = planeToDcos(dd, dip);
      const [restored] = unfold([pole], dd, dip);
      assert.ok(Math.abs(restored[0]) < 1e-9, `x ${restored[0]}`);
      assert.ok(Math.abs(restored[1]) < 1e-9, `y ${restored[1]}`);
      assert.ok(Math.abs(restored[2] + 1) < 1e-9, `z ${restored[2]} (want -1)`);
    }
  });

  it('leaves an already-horizontal dataset unchanged', () => {
    const data = [lineToDcos(10, 20), lineToDcos(200, 40)];
    const out = unfold(data, 90, 0); // dip 0 → no rotation
    for (let i = 0; i < data.length; i++) {
      for (let k = 0; k < 3; k++) assert.ok(Math.abs(out[i][k] - data[i][k]) < 1e-9);
    }
  });

  it('preserves angles between data (rigid rotation)', () => {
    const a = lineToDcos(30, 25), b = lineToDcos(150, 60);
    const before = dot(a, b);
    const [ra, rb] = unfold([a, b], 75, 40);
    assert.ok(Math.abs(dot(ra, rb) - before) < 1e-9);
  });
});
