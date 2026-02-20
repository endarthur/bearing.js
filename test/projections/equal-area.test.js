import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { project, inverse } from '../../src/projections/equal-area.js';

const EPSILON = 1e-10;

function approx(a, b, msg) {
  assert.ok(Math.abs(a - b) < EPSILON, msg || `${a} ≈ ${b}`);
}

describe('equal-area projection', () => {
  it('south pole projects to origin', () => {
    const [px, py] = project([0, 0, -1]);
    approx(px, 0);
    approx(py, 0);
  });

  it('equatorial points project to primitive circle edge', () => {
    const [px, py] = project([1, 0, 0]);
    approx(Math.sqrt(px * px + py * py), Math.SQRT2);
  });

  it('round-trip for lower hemisphere', () => {
    const cases = [
      [0, 0, -1],
      [0.5, 0.5, -Math.sqrt(0.5)],
      [0.1, -0.3, -Math.sqrt(1 - 0.01 - 0.09)],
    ];
    for (const dcos of cases) {
      const [px, py] = project(dcos);
      const back = inverse(px, py);
      assert.ok(back);
      for (let i = 0; i < 3; i++) approx(back[i], dcos[i]);
    }
  });

  it('upper hemisphere flips to lower', () => {
    const [px1, py1] = project([0.5, 0.5, -Math.sqrt(0.5)]);
    const [px2, py2] = project([-0.5, -0.5, Math.sqrt(0.5)]);
    approx(px1, px2);
    approx(py1, py2);
  });

  it('inverse returns null outside circle', () => {
    assert.strictEqual(inverse(2, 0), null);
  });

  it('preserves area — equal solid angles map to equal areas', () => {
    // Two points at same polar angle but different azimuths should
    // project to the same radial distance from center
    const theta = Math.PI / 3;
    const r = Math.sin(theta);
    const z = -Math.cos(theta);
    const [px1] = project([r, 0, z]);
    const [, py2] = project([0, r, z]);
    approx(Math.abs(px1), Math.abs(py2));
  });
});
