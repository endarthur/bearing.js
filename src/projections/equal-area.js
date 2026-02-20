/**
 * @module equal-area — Schmidt-Lambert equal-area projection.
 * Lower hemisphere: z < 0 projects inside the primitive circle.
 */

/**
 * Project a 3D unit vector to 2D equal-area coordinates.
 * Returns [px, py] in range [-√2, √2] for lower hemisphere points.
 * Upper hemisphere points (z > 0) are flipped to lower hemisphere.
 */
export function project(dcos) {
  let [x, y, z] = dcos;
  if (z > 0) { x = -x; y = -y; z = -z; }
  const denom = 1 - z; // z <= 0, so denom >= 1
  const scale = Math.sqrt(2 / denom);
  return [x * scale, y * scale];
}

/**
 * Inverse: 2D equal-area coords -> 3D unit vector (lower hemisphere).
 * Returns [x, y, z] on the unit sphere with z <= 0.
 */
export function inverse(px, py) {
  const r2 = px * px + py * py;
  if (r2 > 2) return null; // outside the projection circle
  const z = -(1 - r2 / 2);
  const scale = Math.sqrt(1 - r2 / 4);
  return [px * scale, py * scale, z];
}
