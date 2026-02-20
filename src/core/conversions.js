/** @module conversions — Attitude <-> direction cosines. */

const DEG = Math.PI / 180;
const INV_DEG = 180 / Math.PI;

/**
 * Plane (dip direction, dip) -> direction cosines of the pole (downward normal).
 * dd and dip in degrees.
 */
export function planeToDcos(dd, dip) {
  const ddR = dd * DEG;
  const dipR = dip * DEG;
  return [
    -Math.sin(dipR) * Math.sin(ddR),
    -Math.sin(dipR) * Math.cos(ddR),
    -Math.cos(dipR),
  ];
}

/**
 * Direction cosines (pole) -> (dip direction, dip) in degrees.
 */
export function dcosToPlane(dcos) {
  let [x, y, z] = dcos;
  // Ensure lower hemisphere
  if (z > 0) { x = -x; y = -y; z = -z; }
  const dip = Math.acos(Math.max(-1, Math.min(1, -z))) * INV_DEG;
  let dd = Math.atan2(-x, -y) * INV_DEG;
  if (dd < 0) dd += 360;
  return [dd, dip];
}

/**
 * Line (trend, plunge) -> direction cosines.
 * trend and plunge in degrees.
 */
export function lineToDcos(trend, plunge) {
  const tR = trend * DEG;
  const pR = plunge * DEG;
  return [
    Math.cos(pR) * Math.sin(tR),
    Math.cos(pR) * Math.cos(tR),
    -Math.sin(pR),
  ];
}

/**
 * Direction cosines -> (trend, plunge) in degrees.
 */
export function dcosToLine(dcos) {
  let [x, y, z] = dcos;
  // Ensure lower hemisphere
  if (z > 0) { x = -x; y = -y; z = -z; }
  const plunge = Math.asin(Math.max(-1, Math.min(1, -z))) * INV_DEG;
  let trend = Math.atan2(x, y) * INV_DEG;
  if (trend < 0) trend += 360;
  return [trend, plunge];
}

/**
 * Strike/dip (right-hand rule) -> dip direction/dip.
 */
export function strikeToDD(strike, dip) {
  return [(strike + 90) % 360, dip];
}

/**
 * Batch convert: array of [dd, dip] -> array of dcos.
 */
export function planesToDcos(planes) {
  return planes.map(([dd, dip]) => planeToDcos(dd, dip));
}

/**
 * Batch convert: array of [trend, plunge] -> array of dcos.
 */
export function linesToDcos(lines) {
  return lines.map(([t, p]) => lineToDcos(t, p));
}

// ---------------------------------------------------------------------------
//  Rake conversions
// ---------------------------------------------------------------------------

/**
 * Rake on a plane -> direction cosines of the line.
 * dd = dip direction, dip = dip angle, rake = rake angle (all degrees).
 * Rake measured from strike (right-hand rule: strike = dd - 90).
 * Formula from auttitude's dcos_rake.
 */
export function rakeToDcos(dd, dip, rake) {
  const ddR = dd * DEG;
  const dR = dip * DEG;
  const rk = rake * DEG;
  return [
    Math.sin(rk) * Math.cos(dR) * Math.sin(ddR) - Math.cos(rk) * Math.cos(ddR),
    Math.sin(rk) * Math.cos(dR) * Math.cos(ddR) + Math.cos(rk) * Math.sin(ddR),
    -Math.sin(rk) * Math.sin(dR),
  ];
}

/**
 * Rake on a plane -> (trend, plunge).
 */
export function rakeToLine(dd, dip, rake) {
  return dcosToLine(rakeToDcos(dd, dip, rake));
}

/**
 * Given a plane (dd, dip) and a line (trend, plunge) on it,
 * return the rake angle in degrees.
 */
export function lineOnPlane(dd, dip, trend, plunge) {
  const ddR = dd * DEG;
  const dR = dip * DEG;
  const tR = trend * DEG;
  const pR = plunge * DEG;

  // Line direction cosines
  const lx = Math.cos(pR) * Math.sin(tR);
  const ly = Math.cos(pR) * Math.cos(tR);
  const lz = -Math.sin(pR);

  // Strike direction (right-hand rule: strike = dd - 90)
  const sx = -Math.cos(ddR);
  const sy = Math.sin(ddR);

  // Down-dip direction
  const dx = Math.cos(dR) * Math.sin(ddR);
  const dy = Math.cos(dR) * Math.cos(ddR);
  const dz = -Math.sin(dR);

  // Rake = atan2(component along dip, component along strike)
  const alongStrike = lx * sx + ly * sy;
  const alongDip = lx * dx + ly * dy + lz * dz;

  return Math.atan2(alongDip, alongStrike) * INV_DEG;
}

// ---------------------------------------------------------------------------
//  Plane intersection convenience
// ---------------------------------------------------------------------------

import * as vec3 from './vec3.js';

/**
 * Intersection line of two planes given as (dd, dip) pairs.
 * Returns [trend, plunge] or null if planes are parallel.
 */
export function planeIntersectionLine(dd1, dip1, dd2, dip2) {
  const pole1 = planeToDcos(dd1, dip1);
  const pole2 = planeToDcos(dd2, dip2);
  const c = vec3.cross(pole1, pole2);
  const len = vec3.length(c);
  if (len < 1e-10) return null;
  const n = vec3.normalize(c);
  return dcosToLine(n);
}

// ---------------------------------------------------------------------------
//  Data rotation
// ---------------------------------------------------------------------------

/**
 * Rotate direction cosines around an axis by an angle (degrees).
 * axis is a direction cosines array [x, y, z].
 */
export function rotateDcos(dcos, axis, angle) {
  const theta = angle * DEG;
  return vec3.rotate(dcos, axis, theta);
}

/**
 * Batch rotate an array of direction cosines.
 */
export function rotateDcosArray(dcosArray, axis, angle) {
  const theta = angle * DEG;
  return dcosArray.map(d => vec3.rotate(d, axis, theta));
}
