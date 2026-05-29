/**
 * @module compass — Device-orientation → attitude (phone as a digital compass).
 *
 * Converts W3C DeviceOrientationEvent angles (alpha, beta, gamma, degrees) into
 * structural attitudes, treating the phone as the measuring surface. Conventions:
 *
 *   - World frame is ENU (X=East, Y=North, Z=Up), per the W3C spec.
 *   - The device→world rotation is R = Rz(alpha)·Rx(beta)·Ry(gamma).
 *   - PLANE: the phone's screen normal (device +Z, out of the screen) is taken
 *     as the plane's normal — lay the phone flat on the surface, screen out.
 *     A flat, level phone reads dip 0.
 *   - LINE: the phone's long axis (device +Y, toward the top edge) is the line
 *     direction — point the top of the phone down-plunge along the lineation.
 *
 * `alpha` is typically magnetic heading; pass options.declination (degrees, East
 * positive) to correct to true north, or feed a true-north alpha and leave it 0.
 */

import { dcosToPlane, dcosToLine } from './core/conversions.js';

const DEG = Math.PI / 180;

/**
 * Device→world (ENU) rotation matrix from DeviceOrientationEvent angles.
 * R = Rz(alpha)·Rx(beta)·Ry(gamma), returned as a flat row-major 3×3.
 * @param {number} alpha @param {number} beta @param {number} gamma - degrees
 * @returns {number[]} 9-element rotation matrix; column j is device axis j in world ENU.
 */
export function deviceOrientationMatrix(alpha, beta, gamma) {
  const a = alpha * DEG, b = beta * DEG, g = gamma * DEG;
  const cA = Math.cos(a), sA = Math.sin(a);
  const cB = Math.cos(b), sB = Math.sin(b);
  const cG = Math.cos(g), sG = Math.sin(g);
  return [
    cA * cG - sA * sB * sG, -sA * cB, cA * sG + sA * sB * cG,
    sA * cG + cA * sB * sG, cA * cB, sA * sG - cA * sB * cG,
    -cB * sG, sB, cB * cG,
  ];
}

// ENU [E,N,Up] → bearing direction cosine [E, N, Down].
function enuToBearing(v) {
  return [v[0], v[1], -v[2]];
}

function applyDeclination(azimuth, declination) {
  return (((azimuth + (declination || 0)) % 360) + 360) % 360;
}

/**
 * Plane (dip direction, dip) from device orientation — phone laid on the surface,
 * screen facing out. A flat, level phone reads [*, 0].
 * @param {number} alpha @param {number} beta @param {number} gamma - degrees
 * @param {Object} [options] @param {number} [options.declination=0] - magnetic→true, °E
 * @returns {[number, number]} [dipDirection, dip] in degrees
 */
export function planeFromDeviceOrientation(alpha, beta, gamma, options = {}) {
  const R = deviceOrientationMatrix(alpha, beta, gamma);
  const normalENU = [R[2], R[5], R[8]];           // device +Z (screen normal)
  const [dipDir, dip] = dcosToPlane(enuToBearing(normalENU));
  return [applyDeclination(dipDir, options.declination), dip];
}

/**
 * Line (trend, plunge) from device orientation — point the top of the phone
 * down-plunge along the lineation (device +Y axis is the line direction).
 * @param {number} alpha @param {number} beta @param {number} gamma - degrees
 * @param {Object} [options] @param {number} [options.declination=0] - magnetic→true, °E
 * @returns {[number, number]} [trend, plunge] in degrees
 */
export function lineFromDeviceOrientation(alpha, beta, gamma, options = {}) {
  const R = deviceOrientationMatrix(alpha, beta, gamma);
  const dirENU = [R[1], R[4], R[7]];              // device +Y (top edge)
  const [trend, plunge] = dcosToLine(enuToBearing(dirENU));
  return [applyDeclination(trend, options.declination), plunge];
}
