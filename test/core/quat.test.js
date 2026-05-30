import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as quat from '../../src/core/quat.js';
import * as mat3 from '../../src/core/mat3.js';
import * as vec3 from '../../src/core/vec3.js';

const approxArr = (a, b, tol = 1e-9) => {
  assert.strictEqual(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < tol, `index ${i}: ${a[i]} ≈ ${b[i]}`);
};
const axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1], vec3.normalize([1, 2, 3]), vec3.normalize([-2, 1, 0.5])];
const angles = [0.1, Math.PI / 4, 1.7, Math.PI - 0.05];

describe('quat', () => {
  it('toMatrix(fromAxisAngle) matches mat3.rotationFromAxisAngle', () => {
    for (const ax of axes) for (const an of angles) {
      approxArr(quat.toMatrix(quat.fromAxisAngle(ax, an)), mat3.rotationFromAxisAngle(ax, an), 1e-9);
    }
  });

  it('matrix → quaternion → matrix round-trips', () => {
    for (const ax of axes) for (const an of angles) {
      const m = mat3.rotationFromAxisAngle(ax, an);
      approxArr(quat.toMatrix(quat.fromMatrix(m)), m, 1e-9);
    }
  });

  it('axis-angle round-trips', () => {
    for (const ax of axes) for (const an of angles) {
      const r = quat.toAxisAngle(quat.fromAxisAngle(ax, an));
      assert.ok(Math.abs(r.angle - an) < 1e-9, `angle ${r.angle} vs ${an}`);
      assert.ok(Math.abs(Math.abs(vec3.dot(r.axis, ax)) - 1) < 1e-9, 'axis parallel');
    }
  });

  it('multiply matches matrix multiplication', () => {
    const qa = quat.fromAxisAngle([0, 0, 1], 0.7);
    const qb = quat.fromAxisAngle([1, 0, 0], 1.1);
    approxArr(quat.toMatrix(quat.multiply(qa, qb)), mat3.multiply(quat.toMatrix(qa), quat.toMatrix(qb)), 1e-9);
  });

  it('conjugate inverts the rotation', () => {
    const q = quat.fromAxisAngle(vec3.normalize([1, 1, 2]), 1.3);
    approxArr(quat.multiply(q, quat.conjugate(q)), quat.identity(), 1e-9);
  });

  it('slerp endpoints and halfway angle', () => {
    const a = quat.identity();
    const b = quat.fromAxisAngle([0, 0, 1], 1.0);
    approxArr(quat.toMatrix(quat.slerp(a, b, 0)), quat.toMatrix(a), 1e-9);
    approxArr(quat.toMatrix(quat.slerp(a, b, 1)), quat.toMatrix(b), 1e-9);
    assert.ok(Math.abs(quat.angle(quat.slerp(a, b, 0.5)) - 0.5) < 1e-9);
  });

  it('angle equals the axis-angle magnitude', () => {
    assert.ok(Math.abs(quat.angle(quat.fromAxisAngle([0, 1, 0], 1.234)) - 1.234) < 1e-9);
  });
});
