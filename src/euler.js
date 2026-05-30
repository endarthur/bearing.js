/**
 * @module euler — Conversions between rotation notations.
 *
 * "Euler angles" is not one convention but 24: intrinsic vs extrinsic, 12 axis
 * sequences (Tait–Bryan XYZ… and proper ZXZ…), times sign/active-passive
 * choices. Mining/geoscience packages each pick differently, and a wrong choice
 * silently mis-orients data. This module converts any of them to/from a
 * canonical rotation matrix (and quaternion), plus verifiable presets.
 *
 * Matrices are flat row-major 3×3 (active rotations, body → world). Angles are
 * in degrees by default (options.radians to switch). Extraction uses Shoemake's
 * general algorithm (Graphics Gems IV).
 */

import * as mat3 from './core/mat3.js';
import * as quat from './core/quat.js';

const DEG = Math.PI / 180;
const AXIS = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const IDX = { X: 0, Y: 1, Z: 2 };
const EUL_NEXT = [1, 2, 0, 1];

/**
 * Build a rotation matrix from three Euler angles.
 * @param {number[]} angles - [a, b, c]
 * @param {string} [order='XYZ'] - axis sequence, e.g. 'XYZ', 'ZYX', 'ZXZ'
 * @param {Object} [options]
 * @param {boolean} [options.intrinsic=false] - rotate about the moving frame (intrinsic) vs fixed axes (extrinsic)
 * @param {boolean} [options.radians=false] - angles already in radians
 * @returns {number[]} flat row-major 3×3
 */
export function eulerToMatrix(angles, order = 'XYZ', options = {}) {
  const o = order.toUpperCase();
  const k = options.radians ? 1 : DEG;
  const Ra = mat3.rotationFromAxisAngle(AXIS[o[0]], angles[0] * k);
  const Rb = mat3.rotationFromAxisAngle(AXIS[o[1]], angles[1] * k);
  const Rc = mat3.rotationFromAxisAngle(AXIS[o[2]], angles[2] * k);
  // Intrinsic (moving axes): R = Ra·Rb·Rc. Extrinsic (fixed axes): R = Rc·Rb·Ra.
  return options.intrinsic
    ? mat3.multiply(Ra, mat3.multiply(Rb, Rc))
    : mat3.multiply(Rc, mat3.multiply(Rb, Ra));
}

// Decode an order string into Shoemake's (i, j, k, repetition, parity).
function getOrd(order) {
  const i = IDX[order[0]], mid = IDX[order[1]], last = IDX[order[2]];
  const rep = order[0] === order[2];
  let parity;
  if (rep) {
    parity = EUL_NEXT[i] === mid ? 0 : 1;
  } else {
    const even = (i === 0 && mid === 1 && last === 2)
      || (i === 1 && mid === 2 && last === 0)
      || (i === 2 && mid === 0 && last === 1);
    parity = even ? 0 : 1;
  }
  return { i, j: EUL_NEXT[i + parity], k: EUL_NEXT[i + 1 - parity], rep, parity };
}

// Extract extrinsic Euler angles (radians) for the given order — the inverse of
// the extrinsic forward (R = Rc·Rb·Ra).
function extractExtrinsic(R, order) {
  const { i, j, k, rep, parity } = getOrd(order);
  const M = (r, c) => R[r * 3 + c];
  let a, b, c;
  if (rep) {
    const sy = Math.hypot(M(i, j), M(i, k));
    if (sy > 1e-12) {
      a = Math.atan2(M(i, j), M(i, k));
      b = Math.atan2(sy, M(i, i));
      c = Math.atan2(M(j, i), -M(k, i));
    } else {
      a = Math.atan2(-M(j, k), M(j, j)); b = Math.atan2(sy, M(i, i)); c = 0;
    }
  } else {
    const cy = Math.hypot(M(i, i), M(j, i));
    if (cy > 1e-12) {
      a = Math.atan2(M(k, j), M(k, k));
      b = Math.atan2(-M(k, i), cy);
      c = Math.atan2(M(j, i), M(i, i));
    } else {
      a = Math.atan2(-M(j, k), M(j, j)); b = Math.atan2(-M(k, i), cy); c = 0;
    }
  }
  if (parity) { a = -a; b = -b; c = -c; }
  return [a, b, c];
}

/**
 * Extract three Euler angles from a rotation matrix for a given convention.
 * Inverse of eulerToMatrix. (At gimbal lock the third angle is set to 0.)
 * @param {number[]} R - flat row-major 3×3
 * @param {string} [order='XYZ']
 * @param {Object} [options] - same intrinsic/radians as eulerToMatrix
 * @returns {number[]} [a, b, c]
 */
export function matrixToEuler(R, order = 'XYZ', options = {}) {
  const o = order.toUpperCase();
  // Intrinsic ABC ≡ extrinsic CBA with the angle triple reversed.
  let res;
  if (options.intrinsic) {
    const e = extractExtrinsic(R, o[2] + o[1] + o[0]);
    res = [e[2], e[1], e[0]];
  } else {
    res = extractExtrinsic(R, o);
  }
  const div = options.radians ? 1 : DEG;
  return res.map(v => v / div);
}

/** Euler angles → quaternion. */
export function eulerToQuat(angles, order = 'XYZ', options = {}) {
  return quat.fromMatrix(eulerToMatrix(angles, order, options));
}

/** Quaternion → Euler angles. */
export function quatToEuler(q, order = 'XYZ', options = {}) {
  return matrixToEuler(quat.toMatrix(q), order, options);
}

/**
 * Named conventions expressible as (order, intrinsic). Extend with your own
 * package's convention once you've verified its axis order and frame.
 */
export const conventions = {
  bunge: { order: 'ZXZ', intrinsic: true },     // crystallography (φ1, Φ, φ2)
  xyz: { order: 'XYZ', intrinsic: false },
  zyx: { order: 'ZYX', intrinsic: false },       // yaw-pitch-roll (aerospace, extrinsic)
};

/** Crystallographic Bunge Euler angles (φ1, Φ, φ2) → matrix. */
export function bungeToMatrix(phi1, Phi, phi2, options = {}) {
  return eulerToMatrix([phi1, Phi, phi2], 'ZXZ', { intrinsic: true, radians: options.radians });
}
/** Matrix → Bunge Euler angles (φ1, Φ, φ2). */
export function matrixToBunge(R, options = {}) {
  return matrixToEuler(R, 'ZXZ', { intrinsic: true, radians: options.radians });
}

/**
 * GSLIB anisotropy angles (ang1 azimuth, ang2 dip, ang3 plunge/rake) → rotation
 * matrix, following the `setrot` convention (Deutsch & Journel) with unit
 * anisotropy. The matrix maps a vector from data coordinates into the rotated
 * (principal) frame: `rotated = R · v`.
 *
 * NOTE: GSLIB/mining angle conventions vary by package and version — verify
 * against your tool's documented `setrot` before relying on this quantitatively.
 *
 * @returns {number[]} flat row-major 3×3
 */
export function gslibToMatrix(ang1, ang2, ang3) {
  const alpha = ((ang1 >= 0 && ang1 < 270) ? (90 - ang1) : (450 - ang1)) * DEG;
  const beta = -ang2 * DEG;
  const theta = ang3 * DEG;
  const sa = Math.sin(alpha), ca = Math.cos(alpha);
  const sb = Math.sin(beta), cb = Math.cos(beta);
  const st = Math.sin(theta), ct = Math.cos(theta);
  return [
    cb * ca, cb * sa, -sb,
    -ct * sa + st * sb * ca, ct * ca + st * sb * sa, st * cb,
    st * sa + ct * sb * ca, -st * ca + ct * sb * sa, ct * cb,
  ];
}

/** Rotation matrix → GSLIB anisotropy angles [ang1, ang2, ang3] (degrees). */
export function matrixToGslib(R) {
  const M = (r, c) => R[r * 3 + c];
  const sb = -M(0, 2);
  const beta = Math.asin(Math.max(-1, Math.min(1, sb)));
  const cb = Math.cos(beta);
  let alpha, theta;
  if (Math.abs(cb) > 1e-9) {
    alpha = Math.atan2(M(0, 1), M(0, 0));
    theta = Math.atan2(M(1, 2), M(2, 2));
  } else {                                   // gimbal lock (dip ±90)
    alpha = Math.atan2(-M(1, 0), M(1, 1));
    theta = 0;
  }
  let ang1 = 90 - alpha / DEG;
  ang1 = ((ang1 % 360) + 360) % 360;
  const ang2 = -beta / DEG;
  const ang3 = theta / DEG;
  return [ang1, ang2, ang3];
}
