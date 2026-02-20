/** @module vec3 — Functional operations on [x, y, z] arrays. */

export function create(x = 0, y = 0, z = 0) {
  return [x, y, z];
}

export function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

export function length(v) {
  return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
}

export function normalize(v) {
  const len = length(v);
  if (len === 0) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

export function scale(v, s) {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function add(a, b) {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function negate(v) {
  return [-v[0], -v[1], -v[2]];
}

export function angle(a, b) {
  const d = dot(normalize(a), normalize(b));
  return Math.acos(Math.max(-1, Math.min(1, d)));
}

/**
 * Rodrigues' rotation: rotate vector v around unit axis k by angle theta (radians).
 */
export function rotate(v, axis, theta) {
  const k = normalize(axis);
  const cosT = Math.cos(theta);
  const sinT = Math.sin(theta);
  const kDotV = dot(k, v);
  const kCrossV = cross(k, v);
  return [
    v[0] * cosT + kCrossV[0] * sinT + k[0] * kDotV * (1 - cosT),
    v[1] * cosT + kCrossV[1] * sinT + k[1] * kDotV * (1 - cosT),
    v[2] * cosT + kCrossV[2] * sinT + k[2] * kDotV * (1 - cosT),
  ];
}
