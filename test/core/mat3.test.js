import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as mat3 from '../../src/core/mat3.js';

const EPSILON = 1e-10;

function approx(a, b, msg) {
  assert.ok(Math.abs(a - b) < EPSILON, msg || `${a} ≈ ${b}`);
}

function approxArr(a, b) {
  assert.strictEqual(a.length, b.length);
  for (let i = 0; i < a.length; i++) approx(a[i], b[i], `index ${i}`);
}

describe('mat3', () => {
  it('identity', () => {
    assert.deepStrictEqual(mat3.identity(), [1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it('multiply by identity', () => {
    const m = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    approxArr(mat3.multiply(mat3.identity(), m), m);
    approxArr(mat3.multiply(m, mat3.identity()), m);
  });

  it('transformVec3 with identity', () => {
    const v = [1, 2, 3];
    approxArr(mat3.transformVec3(mat3.identity(), v), v);
  });

  it('rotationFromAxisAngle — 90° around z', () => {
    const m = mat3.rotationFromAxisAngle([0, 0, 1], Math.PI / 2);
    const result = mat3.transformVec3(m, [1, 0, 0]);
    approxArr(result, [0, 1, 0]);
  });

  it('rotation matrix is orthogonal (R^T * R = I)', () => {
    const m = mat3.rotationFromAxisAngle([1, 0, 0], 0.7);
    const prod = mat3.multiply(mat3.transpose(m), m);
    approxArr(prod, mat3.identity());
  });

  it('transpose', () => {
    const m = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    assert.deepStrictEqual(mat3.transpose(m), [1, 4, 7, 2, 5, 8, 3, 6, 9]);
  });

  it('multiply two rotations', () => {
    const rz = mat3.rotationFromAxisAngle([0, 0, 1], Math.PI / 2);
    const ry = mat3.rotationFromAxisAngle([0, 1, 0], Math.PI / 2);
    const combined = mat3.multiply(ry, rz);
    // Rz maps x->y, then Ry maps y->y, so x->y
    const result = mat3.transformVec3(combined, [1, 0, 0]);
    approxArr(result, [0, 1, 0]);
  });
});
