import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  frameFromPlaneLine, misorientation, compose, slerp, eulerPole, meanRotation,
} from '../src/rotation.js';
import * as mat3 from '../src/core/mat3.js';
import * as vec3 from '../src/core/vec3.js';
import { planeToDcos, lineToDcos } from '../src/core/conversions.js';

const col = (m, j) => [m[j], m[3 + j], m[6 + j]];
const approxArr = (a, b, tol = 1e-9) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < tol, `${a[i]}≈${b[i]}`); };

describe('frameFromPlaneLine', () => {
  it('is an orthonormal right-handed rotation', () => {
    const R = frameFromPlaneLine(90, 60, 90, 60); // lineation down-dip
    approxArr(mat3.multiply(mat3.transpose(R), R), mat3.identity(), 1e-9);
  });

  it('Z column is the plane pole; X lies in the plane', () => {
    const R = frameFromPlaneLine(120, 45, 120, 45);
    approxArr(col(R, 2), vec3.normalize(planeToDcos(120, 45)), 1e-9);
    // X ⟂ pole
    assert.ok(Math.abs(vec3.dot(col(R, 0), col(R, 2))) < 1e-9);
  });
});

describe('misorientation', () => {
  it('is zero for identical rotations', () => {
    const R = mat3.rotationFromAxisAngle([0, 1, 0], 0.5);
    assert.ok(misorientation(R, R).angle < 1e-9);
  });

  it('equals the relative rotation angle', () => {
    const R1 = mat3.rotationFromAxisAngle([0, 0, 1], 0.3);
    const delta = mat3.rotationFromAxisAngle([0, 0, 1], 30 * Math.PI / 180);
    const R2 = mat3.multiply(delta, R1);
    const m = misorientation(R1, R2);
    assert.ok(Math.abs(m.angle - 30) < 1e-6, `angle ${m.angle}`);
    assert.ok(Math.abs(Math.abs(vec3.dot(m.axis, [0, 0, 1])) - 1) < 1e-6, 'axis is z');
  });
});

describe('compose / slerp / eulerPole', () => {
  it('compose applies the first rotation first', () => {
    const A = mat3.rotationFromAxisAngle([0, 0, 1], Math.PI / 2);
    const B = mat3.rotationFromAxisAngle([1, 0, 0], Math.PI / 2);
    approxArr(compose(A, B), mat3.multiply(B, A), 1e-9);
  });

  it('slerp endpoints return the inputs', () => {
    const R0 = mat3.rotationFromAxisAngle([0, 1, 0], 0.2);
    const R1 = mat3.rotationFromAxisAngle([0, 1, 0], 1.2);
    approxArr(slerp(R0, R1, 0), R0, 1e-9);
    approxArr(slerp(R0, R1, 1), R1, 1e-9);
  });

  it('eulerPole recovers axis and angle', () => {
    const R = mat3.rotationFromAxisAngle(vec3.normalize([1, 1, 0]), 40 * Math.PI / 180);
    const { axis, angle } = eulerPole(R);
    assert.ok(Math.abs(angle - 40) < 1e-6, `angle ${angle}`);
    assert.strictEqual(axis.length, 2); // [trend, plunge]
  });
});

describe('meanRotation', () => {
  it('returns the rotation exactly for identical inputs', () => {
    const R = mat3.rotationFromAxisAngle(vec3.normalize([1, 2, 1]), 0.9);
    const { mean, spread } = meanRotation([R, R, R]);
    approxArr(mean, R, 1e-9);
    assert.ok(spread < 1e-9);
  });

  it('recovers the centre of a tight cluster of rotations', () => {
    const R0 = mat3.rotationFromAxisAngle(vec3.normalize([0, 1, 1]), 0.6);
    const rots = [];
    for (let i = 0; i < 12; i++) {
      const wobble = mat3.rotationFromAxisAngle(vec3.normalize([1, i % 3 - 1, (i % 5 - 2) * 0.5 + 0.01]), (i % 7 - 3) * 0.02);
      rots.push(mat3.multiply(wobble, R0));
    }
    const { mean, concentration, spread } = meanRotation(rots);
    assert.ok(misorientation(mean, R0).angle < 5, `mean within 5° of centre`);
    assert.ok(concentration > 0.9 && concentration <= 1.0000001, `concentration ${concentration}`);
    assert.ok(spread < 10, `spread ${spread}`);
  });

  it('handles empty input', () => {
    const { mean } = meanRotation([]);
    approxArr(mean, mat3.identity(), 1e-12);
  });
});
