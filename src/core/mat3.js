/** @module mat3 — 3x3 matrix ops stored as flat 9-element arrays (row-major). */

export function identity() {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function multiply(a, b) {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],

    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],

    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

export function transformVec3(m, v) {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/**
 * Build rotation matrix from axis-angle (Rodrigues).
 * axis must be a unit vector.
 */
export function rotationFromAxisAngle(axis, theta) {
  const [kx, ky, kz] = axis;
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  const t = 1 - c;
  return [
    c + kx * kx * t,       kx * ky * t - kz * s,  kx * kz * t + ky * s,
    ky * kx * t + kz * s,  c + ky * ky * t,        ky * kz * t - kx * s,
    kz * kx * t - ky * s,  kz * ky * t + kx * s,   c + kz * kz * t,
  ];
}

export function transpose(m) {
  return [
    m[0], m[3], m[6],
    m[1], m[4], m[7],
    m[2], m[5], m[8],
  ];
}

/**
 * Re-orthonormalize a 3x3 rotation matrix via Gram-Schmidt on rows.
 * Corrects accumulated floating-point drift.
 */
export function orthonormalize(m) {
  // Row vectors
  let r0 = [m[0], m[1], m[2]];
  let r1 = [m[3], m[4], m[5]];
  let r2;

  // Normalize r0
  let len = Math.sqrt(r0[0] * r0[0] + r0[1] * r0[1] + r0[2] * r0[2]);
  r0 = [r0[0] / len, r0[1] / len, r0[2] / len];

  // r1 = r1 - (r1·r0) * r0, then normalize
  let d = r1[0] * r0[0] + r1[1] * r0[1] + r1[2] * r0[2];
  r1 = [r1[0] - d * r0[0], r1[1] - d * r0[1], r1[2] - d * r0[2]];
  len = Math.sqrt(r1[0] * r1[0] + r1[1] * r1[1] + r1[2] * r1[2]);
  r1 = [r1[0] / len, r1[1] / len, r1[2] / len];

  // r2 = r0 × r1 (guaranteed orthonormal)
  r2 = [
    r0[1] * r1[2] - r0[2] * r1[1],
    r0[2] * r1[0] - r0[0] * r1[2],
    r0[0] * r1[1] - r0[1] * r1[0],
  ];

  return [
    r0[0], r0[1], r0[2],
    r1[0], r1[1], r1[2],
    r2[0], r2[1], r2[2],
  ];
}
