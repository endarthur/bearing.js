/**
 * @module net — Reference net geometry (grid lines and cardinal labels).
 * Generates 3D grid curves for equal-area or equal-angle nets.
 */

import * as curves from '../core/curves.js';

/**
 * Generate the stereonet reference net (great and small circle grid) as 3D curves.
 * Returns full circles on the unit sphere; clipping/projection is done by the caller.
 * @param {number} interval - grid interval in degrees (default 10)
 * @param {'polar'|'equatorial'} type - net type (default 'equatorial')
 * @returns {{ greatCircles: Array<Array<[number,number,number]>>, smallCircles: Array<Array<[number,number,number]>> }}
 */
export function generateNet(interval = 10, type = 'equatorial') {
  return type === 'polar'
    ? generatePolarNet(interval)
    : generateEquatorialNet(interval);
}

function generateEquatorialNet(interval) {
  const DEG = Math.PI / 180;
  const greatCircles = [];
  const smallCircles = [];

  // Great circles: planes through the N-S axis, rotated by alpha around Y.
  // Pole of each plane is [sin(alpha), 0, cos(alpha)].
  // alpha=0 is the equator (primitive circle in unrotated view; visible arc when rotated).
  for (let alpha = 0; alpha < 180; alpha += interval) {
    const alphaR = alpha * DEG;
    greatCircles.push(
      curves.greatCircle([Math.sin(alphaR), 0, Math.cos(alphaR)], 360)
    );
  }

  // Small circles: latitude rings around the N-S axis [0, 1, 0].
  for (let alpha = interval; alpha < 180; alpha += interval) {
    smallCircles.push(
      curves.smallCircle([0, 1, 0], alpha * DEG, 360)
    );
  }

  return { greatCircles, smallCircles };
}

function generatePolarNet(interval) {
  const DEG = Math.PI / 180;
  const greatCircles = [];
  const smallCircles = [];

  // Great circles: vertical planes at each azimuth interval.
  for (let az = 0; az < 180; az += interval) {
    const azR = az * DEG;
    greatCircles.push(
      curves.greatCircle([Math.cos(azR), -Math.sin(azR), 0], 360)
    );
  }

  // Small circles: cones at each dip interval around the vertical axis.
  // dip=90 is the equator (primitive circle in unrotated view; visible arc when rotated).
  for (let dip = interval; dip <= 90; dip += interval) {
    smallCircles.push(
      curves.smallCircle([0, 0, -1], dip * DEG, 360)
    );
  }

  return { greatCircles, smallCircles };
}

/**
 * Cardinal point positions for labeling N, E, S, W.
 * @param {number} radius - radius of the primitive circle in SVG coords
 * @param {number} cx - center x
 * @param {number} cy - center y
 * @param {number} offset - distance beyond the primitive circle for labels
 * @returns {Array<{label: string, x: number, y: number}>}
 */
export function cardinalPoints(radius, cx, cy, offset) {
  return [
    { label: 'N', x: cx, y: cy - radius - offset },
    { label: 'E', x: cx + radius + offset, y: cy },
    { label: 'S', x: cx, y: cy + radius + offset },
    { label: 'W', x: cx - radius - offset, y: cy },
  ];
}
