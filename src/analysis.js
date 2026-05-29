/**
 * @module analysis — Structural analysis workflows built on the orientation tensor.
 *
 * Fold-axis / best-fit-great-circle (π) analysis, best-fit plane, and dataset
 * rotation / unfolding (tilt test). All take and return direction cosines
 * (unit vectors); use conversions.* to move to/from degree representations.
 */

import { principalAxes } from './statistics.js';
import {
  dcosToLine, dcosToPlane, lineToDcos, rotateDcosArray,
} from './core/conversions.js';

/**
 * Best-fit great circle (girdle) through a set of direction cosines, via the
 * orientation tensor. The smallest-eigenvalue eigenvector (V3) is the pole to
 * the girdle:
 *   - for poles-to-bedding around a cylindrical fold, V3 is the fold (β) axis;
 *   - for a set of lineations, V3 is the normal of the plane containing them.
 *
 * @param {Array<number[]>} dcos
 * @returns {{ pole:number[], axis:[number,number], plane:[number,number],
 *             eigenvalues:number[], girdle:number }}
 *   pole — V3 unit vector;
 *   axis — [trend, plunge] of V3 (the fold / β axis);
 *   plane — [dipDir, dip] of the best-fit great circle;
 *   eigenvalues — [S1, S2, S3] of the (normalised) orientation tensor;
 *   girdle — Vollmer girdle index 2·(S2 − S3): ~1 for a clean girdle, ~0 otherwise.
 */
export function bestFitGreatCircle(dcos) {
  const { eigenvalues, eigenvectors } = principalAxes(dcos);
  const pole = eigenvectors[2];
  return {
    pole,
    axis: dcosToLine(pole),
    plane: dcosToPlane(pole),
    eigenvalues,
    girdle: 2 * (eigenvalues[1] - eigenvalues[2]),
  };
}

/**
 * Best-fit plane to a set of lineations that (approximately) share a plane.
 * Equivalent to bestFitGreatCircle but framed as "the plane": returns the plane
 * [dipDir, dip] and its pole, plus the eigenvalues.
 * @param {Array<number[]>} dcos
 * @returns {{ pole:number[], plane:[number,number], eigenvalues:number[], girdle:number }}
 */
export function bestFitPlane(dcos) {
  const { pole, plane, eigenvalues, girdle } = bestFitGreatCircle(dcos);
  return { pole, plane, eigenvalues, girdle };
}

/**
 * Fold (β) axis from poles to folded bedding — the best-fit girdle pole as
 * [trend, plunge].
 * @param {Array<number[]>} poles
 * @returns {[number, number]}
 */
export function foldAxis(poles) {
  return bestFitGreatCircle(poles).axis;
}

/**
 * Rotate a dataset about an axis by an angle (degrees). Convenience over
 * conversions.rotateDcosArray for analysis workflows.
 * @param {Array<number[]>} dcos
 * @param {number[]} axis - rotation axis (unit vector)
 * @param {number} angleDeg
 * @returns {Array<number[]>}
 */
export function rotateData(dcos, axis, angleDeg) {
  return rotateDcosArray(dcos, axis, angleDeg);
}

/**
 * Restore a planar fabric to horizontal ("unfolding" / tilt correction): rotate
 * the whole dataset about the strike of the reference plane so that plane
 * becomes horizontal. Use for tilt tests — e.g. does a second fabric tighten
 * once bedding is restored?
 *
 * The reference plane's own pole maps to vertical ([0,0,-1]) after unfolding.
 *
 * @param {Array<number[]>} dcos - data to rotate
 * @param {number} dipDir - reference plane dip direction (degrees)
 * @param {number} dip - reference plane dip (degrees)
 * @returns {Array<number[]>} rotated direction cosines
 */
export function unfold(dcos, dipDir, dip) {
  const strike = lineToDcos(dipDir - 90, 0); // horizontal strike axis
  return rotateDcosArray(dcos, strike, -dip);
}
