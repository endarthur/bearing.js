import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  eulerToMatrix, matrixToEuler, eulerToQuat, quatToEuler,
  bungeToMatrix, matrixToBunge, gslibToMatrix, matrixToGslib,
} from '../src/euler.js';
import * as mat3 from '../src/core/mat3.js';
import * as quat from '../src/core/quat.js';

const ALL_ORDERS = [
  'XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX',           // Tait–Bryan
  'XYX', 'XZX', 'YXY', 'YZY', 'ZXZ', 'ZYZ',           // proper Euler
];
const approxArr = (a, b, tol = 1e-7) => {
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < tol, `index ${i}: ${a[i]} ≈ ${b[i]}`);
};

describe('euler general engine', () => {
  it('round-trips matrix for all 24 conventions (matrix → angles → matrix)', () => {
    const angles = [37, 22, -54]; // non-degenerate
    for (const order of ALL_ORDERS) {
      for (const intrinsic of [false, true]) {
        const R = eulerToMatrix(angles, order, { intrinsic });
        const back = matrixToEuler(R, order, { intrinsic });
        const R2 = eulerToMatrix(back, order, { intrinsic });
        approxArr(R2, R, 1e-7);
      }
    }
  });

  it('produces proper rotations (RᵀR = I) for every order', () => {
    for (const order of ALL_ORDERS) {
      const R = eulerToMatrix([15, 35, 65], order);
      approxArr(mat3.multiply(mat3.transpose(R), R), mat3.identity(), 1e-9);
    }
  });

  it('extrinsic XYZ [90,0,0] is a 90° rotation about X', () => {
    approxArr(eulerToMatrix([90, 0, 0], 'XYZ'), mat3.rotationFromAxisAngle([1, 0, 0], Math.PI / 2), 1e-9);
  });

  it('intrinsic ABC equals extrinsic CBA reversed (standard identity)', () => {
    const a = [20, 40, 70];
    const intr = eulerToMatrix(a, 'XYZ', { intrinsic: true });
    const extr = eulerToMatrix([a[2], a[1], a[0]], 'ZYX', { intrinsic: false });
    approxArr(intr, extr, 1e-9);
  });

  it('radians option matches the degree equivalent', () => {
    const deg = eulerToMatrix([30, 45, 60], 'ZXZ');
    const rad = eulerToMatrix([30 * Math.PI / 180, 45 * Math.PI / 180, 60 * Math.PI / 180], 'ZXZ', { radians: true });
    approxArr(rad, deg, 1e-12);
  });

  it('quaternion conversions agree with the matrix path', () => {
    const angles = [12, 34, 56];
    const q = eulerToQuat(angles, 'ZYX');
    // eulerToQuat → matrix equals eulerToMatrix
    approxArr(quat.toMatrix(q), eulerToMatrix(angles, 'ZYX'), 1e-9);
    // quatToEuler round-trips back to the same rotation
    approxArr(eulerToMatrix(quatToEuler(q, 'ZYX'), 'ZYX'), eulerToMatrix(angles, 'ZYX'), 1e-7);
  });
});

describe('Bunge crystallographic angles', () => {
  it('round-trips through the matrix', () => {
    const R = bungeToMatrix(35, 50, 80);
    approxArr(eulerToMatrix(matrixToBunge(R), 'ZXZ', { intrinsic: true }), R, 1e-7);
  });
});

describe('GSLIB anisotropy angles', () => {
  it('produces a proper rotation', () => {
    const R = gslibToMatrix(40, 25, 15);
    approxArr(mat3.multiply(mat3.transpose(R), R), mat3.identity(), 1e-9);
  });

  it('round-trips angles within the valid range', () => {
    for (const [a1, a2, a3] of [[0, 0, 0], [40, 25, 15], [200, 60, -30], [310, 10, 45]]) {
      const [r1, r2, r3] = matrixToGslib(gslibToMatrix(a1, a2, a3));
      assert.ok(Math.abs(r1 - a1) < 1e-6 || Math.abs(r1 - a1 - 360) < 1e-6 || Math.abs(r1 - a1 + 360) < 1e-6, `ang1 ${r1} vs ${a1}`);
      assert.ok(Math.abs(r2 - a2) < 1e-6, `ang2 ${r2} vs ${a2}`);
      assert.ok(Math.abs(r3 - a3) < 1e-6, `ang3 ${r3} vs ${a3}`);
    }
  });
});
