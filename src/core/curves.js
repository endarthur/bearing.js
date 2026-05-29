/** @module curves — Great circles, small circles, arcs on the unit sphere. */

import * as vec3 from './vec3.js';

/**
 * Generate points along the great circle whose pole is the given unit vector.
 * Returns array of [x,y,z] points on the unit sphere.
 */
export function greatCircle(pole, nPoints = 180) {
  const p = vec3.normalize(pole);
  // Find a vector perpendicular to the pole
  const ref = Math.abs(p[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = vec3.normalize(vec3.cross(p, ref));
  const v = vec3.cross(p, u);

  const step = (2 * Math.PI) / nPoints;
  const points = [];
  for (let i = 0; i <= nPoints; i++) {
    const theta = i * step;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    points.push([
      u[0] * cos + v[0] * sin,
      u[1] * cos + v[1] * sin,
      u[2] * cos + v[2] * sin,
    ]);
  }
  return points;
}

/**
 * Generate points along a small circle centered on axis with given half-angle (radians).
 */
export function smallCircle(axis, halfAngle, nPoints = 180) {
  const a = vec3.normalize(axis);
  const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = vec3.normalize(vec3.cross(a, ref));
  const v = vec3.cross(a, u);

  const cosH = Math.cos(halfAngle);
  const sinH = Math.sin(halfAngle);
  const step = (2 * Math.PI) / nPoints;
  const points = [];
  for (let i = 0; i <= nPoints; i++) {
    const theta = i * step;
    const cos = Math.cos(theta);
    const sin = Math.sin(theta);
    points.push([
      a[0] * cosH + (u[0] * cos + v[0] * sin) * sinH,
      a[1] * cosH + (u[1] * cos + v[1] * sin) * sinH,
      a[2] * cosH + (u[2] * cos + v[2] * sin) * sinH,
    ]);
  }
  return points;
}

/**
 * Generate points along an elliptical "small circle" on the unit sphere, centred
 * on `axis`, with angular semi-axes `semiMajor` and `semiMinor` (radians). The
 * major axis points toward the component of `majorDir` perpendicular to `axis`.
 * Reduces to smallCircle() when semiMajor === semiMinor. Returns [x,y,z] points.
 */
export function ellipse(axis, majorDir, semiMajor, semiMinor, nPoints = 120) {
  const a = vec3.normalize(axis);
  // u: tangent direction of the major axis (perpendicular component of majorDir)
  let u = vec3.sub(majorDir, vec3.scale(a, vec3.dot(majorDir, a)));
  if (vec3.length(u) < 1e-10) {
    const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    u = vec3.cross(a, ref);
  }
  u = vec3.normalize(u);
  const w = vec3.cross(a, u); // unit, completes the right-handed tangent basis

  const step = (2 * Math.PI) / nPoints;
  const points = [];
  for (let i = 0; i <= nPoints; i++) {
    const phi = i * step;
    const cp = Math.cos(phi), sp = Math.sin(phi);
    // Polar form of an ellipse with semi-axes (semiMajor along u, semiMinor along w):
    // angular radius rho(phi) = a·b / sqrt(b²cos²φ + a²sin²φ).
    const denom = Math.sqrt(
      semiMinor * semiMinor * cp * cp + semiMajor * semiMajor * sp * sp,
    );
    const rho = denom > 1e-12 ? (semiMajor * semiMinor) / denom : 0;
    const cr = Math.cos(rho), sr = Math.sin(rho);
    const t0 = u[0] * cp + w[0] * sp;
    const t1 = u[1] * cp + w[1] * sp;
    const t2 = u[2] * cp + w[2] * sp;
    points.push([a[0] * cr + t0 * sr, a[1] * cr + t1 * sr, a[2] * cr + t2 * sr]);
  }
  return points;
}

/**
 * Arc on the unit sphere from vector a to vector b, by angle.
 */
export function arc(a, b, nPoints = 60) {
  const na = vec3.normalize(a);
  const nb = vec3.normalize(b);
  const theta = vec3.angle(na, nb);
  if (theta < 1e-10) return [na];

  const points = [];
  for (let i = 0; i <= nPoints; i++) {
    const t = i / nPoints;
    const angle = t * theta;
    points.push(vec3.rotate(na, vec3.normalize(vec3.cross(na, nb)), angle));
  }
  return points;
}

/**
 * Intersection line of two planes given by their poles.
 * Returns the two antipodal direction cosines (or null if parallel).
 */
export function planeIntersection(pole1, pole2) {
  const c = vec3.cross(pole1, pole2);
  const len = vec3.length(c);
  if (len < 1e-10) return null;
  const n = vec3.normalize(c);
  return [n, vec3.negate(n)];
}
