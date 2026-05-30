/**
 * @module rotation — Analysis of full 3D orientations / rotations (SO(3)).
 *
 * Where S² statistics handle a single axis, these handle complete orientations:
 * a foliation + lineation as a reference frame, misorientation between
 * orientations (restoration, grain boundaries), mean rotation and dispersion of
 * a population (quaternion averaging), and interpolation. Rotations are flat
 * row-major 3×3 matrices; use the `quat` module to move to/from quaternions.
 *
 * Crystallographic symmetry (equivalent orientations) is NOT applied — this is
 * base SO(3). Symmetry handling would be a follow-up for EBSD/CPO texture.
 */

import * as mat3 from './core/mat3.js';
import * as vec3 from './core/vec3.js';
import * as quat from './core/quat.js';
import { planeToDcos, lineToDcos, dcosToLine } from './core/conversions.js';

const RAD2DEG = 180 / Math.PI;

/**
 * Full orientation frame from a foliation/plane and a lineation on it.
 * Columns of the returned matrix are X = lineation (in-plane), Z = plane pole,
 * Y = Z × X. The lineation is projected into the plane if not exactly on it.
 * @param {number} dd - plane dip direction (deg)
 * @param {number} dip - plane dip (deg)
 * @param {number} trend - lineation trend (deg)
 * @param {number} plunge - lineation plunge (deg)
 * @returns {number[]} flat row-major 3×3 rotation matrix (body → world)
 */
export function frameFromPlaneLine(dd, dip, trend, plunge) {
  const z = vec3.normalize(planeToDcos(dd, dip));            // pole
  const l = lineToDcos(trend, plunge);
  let x = vec3.sub(l, vec3.scale(z, vec3.dot(l, z)));        // in-plane component
  if (vec3.length(x) < 1e-10) {                             // lineation ∥ pole: pick any in-plane axis
    const ref = Math.abs(z[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    x = vec3.cross(z, ref);
  }
  x = vec3.normalize(x);
  const y = vec3.cross(z, x);
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}

/**
 * Misorientation taking R1 to R2: ΔR = R2·R1ᵀ.
 * @returns {{ angle: number, axis: number[] }} angle in degrees [0,180]; rotation axis
 */
export function misorientation(R1, R2) {
  const dR = mat3.multiply(R2, mat3.transpose(R1));
  const { axis, angle } = quat.toAxisAngle(quat.fromMatrix(dR));
  return { angle: angle * RAD2DEG, axis };
}

/**
 * Compose rotations: compose(R1, R2, …) is the rotation equivalent to applying
 * R1 first, then R2, … (= Rₙ·…·R2·R1).
 * @param {...number[]} rotations
 * @returns {number[]} flat 3×3
 */
export function compose(...rotations) {
  return rotations.reduce((acc, R) => mat3.multiply(R, acc), mat3.identity());
}

/** Spherical interpolation between two rotation matrices at t∈[0,1]. */
export function slerp(R0, R1, t) {
  return quat.toMatrix(quat.slerp(quat.fromMatrix(R0), quat.fromMatrix(R1), t));
}

/**
 * Euler pole (rotation axis as a line) and angle of a rotation.
 * @param {number[]} R - flat 3×3
 * @returns {{ axis: [number,number], angle: number }} axis as [trend,plunge]; angle in degrees
 */
export function eulerPole(R) {
  const { axis, angle } = quat.toAxisAngle(quat.fromMatrix(R));
  return { axis: dcosToLine(axis), angle: angle * RAD2DEG };
}

// Dominant eigenvector of a symmetric n×n (flat) matrix by power iteration.
function dominantEigen(M, n, iters = 300) {
  let v = new Array(n).fill(0); v[0] = 1;
  for (let it = 0; it < iters; it++) {
    const w = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) w[i] += M[i * n + j] * v[j];
    const len = Math.hypot(...w) || 1;
    let delta = 0;
    for (let i = 0; i < n; i++) { const nv = w[i] / len; delta += Math.abs(nv - v[i]); v[i] = nv; }
    if (delta < 1e-13) break;
  }
  let lambda = 0;
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += M[i * n + j] * v[j]; lambda += v[i] * s; }
  return { vector: v, value: lambda };
}

/**
 * Mean rotation of a population (quaternion averaging — dominant eigenvector of
 * the 4×4 quaternion scatter matrix, Markley et al.). The q ~ −q double cover is
 * handled automatically by the outer-product scatter.
 *
 * @param {Array<number[]>} rotations - flat 3×3 matrices
 * @returns {{ mean: number[], quaternion: number[], concentration: number, spread: number }}
 *   mean = flat 3×3 mean rotation; concentration = dominant eigenvalue of the
 *   normalised scatter (∈[¼,1], →1 tight); spread = mean misorientation angle
 *   from the mean, in degrees.
 */
export function meanRotation(rotations) {
  const n = rotations.length;
  if (n === 0) return { mean: mat3.identity(), quaternion: quat.identity(), concentration: 0, spread: 0 };

  const M = new Array(16).fill(0);
  for (const R of rotations) {
    const q = quat.fromMatrix(R);
    for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) M[a * 4 + b] += q[a] * q[b] / n;
  }
  const { vector, value } = dominantEigen(M, 4);
  const meanQ = quat.normalize(vector);
  const mean = quat.toMatrix(meanQ);

  let spread = 0;
  for (const R of rotations) spread += misorientation(mean, R).angle;
  return { mean, quaternion: meanQ, concentration: value, spread: spread / n };
}
