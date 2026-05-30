/**
 * @module quat — Unit-quaternion rotations, scalar-first [w, x, y, z].
 *
 * The natural space for rotation statistics: unit quaternions double-cover SO(3)
 * (q and −q are the same rotation). Interoperates with mat3 (flat row-major 3×3).
 */

import * as vec3 from './vec3.js';

/** Identity rotation. */
export function identity() {
  return [1, 0, 0, 0];
}

/** Normalise to a unit quaternion. */
export function normalize(q) {
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Conjugate (inverse rotation for a unit quaternion). */
export function conjugate(q) {
  return [q[0], -q[1], -q[2], -q[3]];
}

/** Hamilton product a·b (apply b, then a). */
export function multiply(a, b) {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0],
  ];
}

/** Quaternion from axis (unit) and angle (radians). */
export function fromAxisAngle(axis, angle) {
  const a = vec3.normalize(axis);
  const h = angle / 2, s = Math.sin(h);
  return [Math.cos(h), a[0] * s, a[1] * s, a[2] * s];
}

/**
 * Axis and (minimal, [0,π]) angle of a quaternion.
 * @returns {{ axis: number[], angle: number }} angle in radians
 */
export function toAxisAngle(q) {
  let [w, x, y, z] = normalize(q);
  if (w < 0) { w = -w; x = -x; y = -y; z = -z; }   // shortest rotation
  const angle = 2 * Math.acos(Math.min(1, w));
  const s = Math.sqrt(Math.max(0, 1 - w * w));
  if (s < 1e-9) return { axis: [0, 0, 1], angle: 0 };
  return { axis: [x / s, y / s, z / s], angle };
}

/** Rotation angle (radians, [0,π]). */
export function angle(q) {
  return 2 * Math.acos(Math.min(1, Math.abs(normalize(q)[0])));
}

/** Quaternion → flat row-major 3×3 rotation matrix. */
export function toMatrix(q) {
  const [w, x, y, z] = normalize(q);
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
    2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
    2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y),
  ];
}

/** Flat row-major 3×3 rotation matrix → quaternion (Shepperd's method). */
export function fromMatrix(m) {
  const tr = m[0] + m[4] + m[8];
  let w, x, y, z;
  if (tr > 0) {
    const S = Math.sqrt(tr + 1) * 2;
    w = 0.25 * S; x = (m[7] - m[5]) / S; y = (m[2] - m[6]) / S; z = (m[3] - m[1]) / S;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const S = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    w = (m[7] - m[5]) / S; x = 0.25 * S; y = (m[1] + m[3]) / S; z = (m[2] + m[6]) / S;
  } else if (m[4] > m[8]) {
    const S = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    w = (m[2] - m[6]) / S; x = (m[1] + m[3]) / S; y = 0.25 * S; z = (m[5] + m[7]) / S;
  } else {
    const S = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    w = (m[3] - m[1]) / S; x = (m[2] + m[6]) / S; y = (m[5] + m[7]) / S; z = 0.25 * S;
  }
  return normalize([w, x, y, z]);
}

/** Spherical linear interpolation between two rotations (shortest path). */
export function slerp(a, b, t) {
  let [aw, ax, ay, az] = normalize(a);
  let [bw, bx, by, bz] = normalize(b);
  let dot = aw * bw + ax * bx + ay * by + az * bz;
  if (dot < 0) { bw = -bw; bx = -bx; by = -by; bz = -bz; dot = -dot; }
  if (dot > 0.9995) {
    return normalize([aw + t * (bw - aw), ax + t * (bx - ax), ay + t * (by - ay), az + t * (bz - az)]);
  }
  const theta0 = Math.acos(dot), theta = theta0 * t;
  const sinTheta0 = Math.sin(theta0);
  const s1 = Math.sin(theta) / sinTheta0;
  const s0 = Math.cos(theta) - dot * s1;
  return [s0 * aw + s1 * bw, s0 * ax + s1 * bx, s0 * ay + s1 * by, s0 * az + s1 * bz];
}
