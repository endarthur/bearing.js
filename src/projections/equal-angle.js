/**
 * @module equal-angle — Wulff stereographic (equal-angle) projection.
 * Lower hemisphere: z < 0 projects inside the primitive circle.
 */

/**
 * Project a 3D unit vector to 2D stereographic coordinates.
 * Returns [px, py] in range [-1, 1] for lower hemisphere points.
 * Upper hemisphere points (z > 0) are flipped to lower hemisphere.
 */
export function project(dcos) {
  let [x, y, z] = dcos;
  if (z > 0) { x = -x; y = -y; z = -z; }
  const denom = 1 - z; // z <= 0, so denom >= 1
  return [x / denom, y / denom];
}

/**
 * Inverse: 2D stereographic coords -> 3D unit vector (lower hemisphere).
 * Returns [x, y, z] on the unit sphere with z <= 0.
 */
export function inverse(px, py) {
  const r2 = px * px + py * py;
  if (r2 > 1) return null; // outside the projection circle
  const denom = 1 + r2;
  return [
    2 * px / denom,
    2 * py / denom,
    -(1 - r2) / denom,
  ];
}
