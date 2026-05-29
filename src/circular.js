/**
 * @module circular — Circular (2D azimuthal) statistics for rose / directional data.
 *
 * Azimuths are in degrees (0 = North, clockwise). For axial data (strikes,
 * lineation trends with no sense) pass { axial: true }: angles are doubled
 * (Krumbein) so opposite directions reinforce, and the mean is halved back.
 */

const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

function components(azimuths, axial) {
  const k = axial ? 2 : 1;
  let C = 0, S = 0, n = 0;
  for (const az of azimuths) {
    if (!Number.isFinite(az)) continue;
    const a = az * k * DEG;
    C += Math.cos(a);
    S += Math.sin(a);
    n += 1;
  }
  return { C, S, n, k };
}

/**
 * Resultant of a set of azimuths.
 * @param {number[]} azimuths - degrees
 * @param {Object} [options] @param {boolean} [options.axial=false]
 * @returns {{ n:number, R:number, Rbar:number, mean:number }}
 *   R = resultant length, Rbar = R/n (0 = uniform, 1 = perfectly aligned),
 *   mean = mean azimuth in degrees [0,360) (NaN if Rbar ≈ 0).
 */
export function resultant(azimuths, options = {}) {
  const axial = !!options.axial;
  const { C, S, n, k } = components(azimuths, axial);
  const R = Math.hypot(C, S);
  let mean = NaN;
  if (R > 1e-12) {
    let m = Math.atan2(S, C) * RAD / k;
    m = ((m % 360) + 360) % 360;
    mean = m;
  }
  return { n, R, Rbar: n > 0 ? R / n : 0, mean };
}

/** Mean azimuth in degrees [0,360) (NaN if the data are uniform). */
export function circularMean(azimuths, options = {}) {
  return resultant(azimuths, options).mean;
}

/** Circular variance 1 − Rbar (0 = concentrated, 1 = dispersed). */
export function circularVariance(azimuths, options = {}) {
  return 1 - resultant(azimuths, options).Rbar;
}

/** Circular standard deviation in degrees, √(−2·ln Rbar). */
export function circularStdDev(azimuths, options = {}) {
  const { Rbar } = resultant(azimuths, options);
  if (Rbar <= 0) return Infinity;
  return Math.sqrt(-2 * Math.log(Rbar)) * RAD;
}

/**
 * von Mises concentration κ (Best & Fisher approximation from Rbar).
 * @returns {number} κ (0 = uniform, large = tight)
 */
export function vonMisesKappa(azimuths, options = {}) {
  const { Rbar } = resultant(azimuths, options);
  if (Rbar < 1e-12) return 0;
  if (Rbar < 0.53) return 2 * Rbar + Rbar ** 3 + 5 * Rbar ** 5 / 6;
  if (Rbar < 0.85) return -0.4 + 1.39 * Rbar + 0.43 / (1 - Rbar);
  return 1 / (Rbar ** 3 - 4 * Rbar ** 2 + 3 * Rbar);
}

/**
 * Rayleigh test of uniformity (is there a preferred direction?).
 * @param {number[]} azimuths - degrees
 * @param {Object} [options] @param {boolean} [options.axial=false]
 * @returns {{ n:number, Rbar:number, z:number, p:number }}
 *   z = n·Rbar² (test statistic); p = approximate significance (Fisher 1993).
 *   Small p ⇒ reject uniformity (a preferred direction exists).
 */
export function rayleighTest(azimuths, options = {}) {
  const { n, Rbar } = resultant(azimuths, options);
  if (n === 0) return { n: 0, Rbar: 0, z: 0, p: 1 };
  const z = n * Rbar * Rbar;
  // Fisher (1993) series approximation to the p-value.
  const p = Math.exp(-z) * (
    1
    + (2 * z - z * z) / (4 * n)
    - (24 * z - 132 * z * z + 76 * z ** 3 - 9 * z ** 4) / (288 * n * n)
  );
  return { n, Rbar, z, p: Math.max(0, Math.min(1, p)) };
}
