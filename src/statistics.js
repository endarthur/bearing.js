/**
 * @module statistics — Directional statistics for orientation data.
 *
 * All functions take arrays of direction cosines [x, y, z] (unit vectors,
 * lower hemisphere).  Use conversions.planeToDcos / lineToDcos to convert
 * from degree-based representations first.
 */

import * as vec3 from './core/vec3.js';
import { symmetricEigen3 } from './core/eigen.js';

// ---------------------------------------------------------------------------
//  Basic descriptive statistics
// ---------------------------------------------------------------------------

/**
 * Resultant vector — sum of unit vectors (not normalised).
 * @param {Array<number[]>} dcos
 * @returns {number[]} [x, y, z]
 */
export function resultant(dcos) {
  const s = [0, 0, 0];
  for (const d of dcos) { s[0] += d[0]; s[1] += d[1]; s[2] += d[2]; }
  return s;
}

/**
 * Mean direction — normalised resultant.
 * @param {Array<number[]>} dcos
 * @returns {number[]} unit vector [x, y, z]
 */
export function meanVector(dcos) {
  return vec3.normalize(resultant(dcos));
}

// ---------------------------------------------------------------------------
//  Fisher statistics
// ---------------------------------------------------------------------------

/**
 * Fisher statistics for a set of direction cosines.
 *
 * @param {Array<number[]>} dcos - array of unit vectors (lower hemisphere)
 * @returns {{ n: number, R: number, Rbar: number, mean: number[],
 *             kappa: number, alpha95: number }}
 *   n       — sample size
 *   R       — resultant length |Σ dᵢ|
 *   Rbar    — mean resultant length R/n  (0 = uniform, 1 = perfect cluster)
 *   mean    — mean direction (unit vector)
 *   kappa   — Fisher concentration parameter (ML estimate)
 *   alpha95 — 95 % confidence cone half-angle in degrees
 */
export function fisherStats(dcos) {
  const n = dcos.length;
  const res = resultant(dcos);
  const R = vec3.length(res);
  const Rbar = R / n;
  const mean = R > 1e-10 ? vec3.scale(res, 1 / R) : [0, 0, -1];

  // Concentration parameter (ML estimate, bias-corrected for small n)
  let kappa = Infinity;
  if (n > R + 1e-10) {
    kappa = n >= 3 ? (n - 2) / (n - R) : (n - 1) / (n - R);
  }

  // 95 % confidence cone
  let alpha95 = 0;
  if (n >= 2 && R > 1e-10 && n - R > 1e-10) {
    const cosA = 1 - ((n - R) / R) * (Math.pow(20, 1 / (n - 1)) - 1);
    alpha95 = Math.acos(Math.max(-1, Math.min(1, cosA))) * (180 / Math.PI);
  }

  return { n, R, Rbar, mean, kappa, alpha95 };
}

// ---------------------------------------------------------------------------
//  Orientation tensor & principal-axis analysis
// ---------------------------------------------------------------------------

/**
 * Normalised orientation tensor  T = (1/n) Σ (dᵢ ⊗ dᵢ).
 * Returns a 3×3 symmetric matrix as a flat 9-element row-major array.
 * Eigenvalues of T sum to 1.
 *
 * @param {Array<number[]>} dcos
 * @returns {number[]} flat 3×3 matrix
 */
export function orientationTensor(dcos) {
  const n = dcos.length;
  const T = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const d of dcos) {
    T[0] += d[0] * d[0]; T[1] += d[0] * d[1]; T[2] += d[0] * d[2];
    T[3] += d[1] * d[0]; T[4] += d[1] * d[1]; T[5] += d[1] * d[2];
    T[6] += d[2] * d[0]; T[7] += d[2] * d[1]; T[8] += d[2] * d[2];
  }
  for (let k = 0; k < 9; k++) T[k] /= n;
  return T;
}

/**
 * Principal-axis analysis of a set of direction cosines.
 *
 * Computes the normalised orientation tensor, then its eigendecomposition.
 * Eigenvectors are flipped to the lower hemisphere (z ≤ 0).
 *
 * @param {Array<number[]>} dcos
 * @returns {{ eigenvalues: number[], eigenvectors: number[][],
 *             K: number, C: number, P: number, G: number, R: number,
 *             kappa1: number, kappa2: number }}
 *   eigenvalues  — [S1, S2, S3] descending, sum ≈ 1
 *   eigenvectors — [V1, V2, V3] corresponding unit vectors (lower hemisphere)
 *   K — Woodcock shape parameter  ln(S1/S2) / ln(S2/S3)
 *       K > 1 → cluster,  K < 1 → girdle
 *   C — Woodcock strength parameter  ln(S1/S3)
 *       C ≈ 0 → uniform,  C large → strong fabric
 *   P — Vollmer point index  (S1 - S2), 1 = perfect cluster
 *   G — Vollmer girdle index 2(S2 - S3), 1 = perfect girdle
 *   R — Vollmer random index  3·S3,      1 = uniform
 *   kappa1 — Bingham concentration parameter along V2 (≈ n·(S2 - S1))
 *   kappa2 — Bingham concentration parameter along V3 (≈ n·(S3 - S1))
 */
export function principalAxes(dcos) {
  const T = orientationTensor(dcos);
  const { values, vectors } = symmetricEigen3(T);

  // Flip eigenvectors to lower hemisphere
  for (let i = 0; i < 3; i++) {
    if (vectors[i][2] > 0) {
      vectors[i] = vec3.negate(vectors[i]);
    }
  }

  // Woodcock parameters
  // K = ln(S1/S2) / ln(S2/S3):  K>1 → cluster, K<1 → girdle
  // C = ln(S1/S3):              strength of preferred orientation
  // JS handles edge cases naturally: 0/Infinity=0, finite/0=Infinity, 0/0=NaN
  const s1 = values[0], s2 = values[1], s3 = values[2];
  const K = Math.log(s1 / s2) / Math.log(s2 / s3);
  const C = Math.log(s1 / s3);

  // Vollmer parameters (P + G + R = 1)
  const P = s1 - s2;
  const G = 2 * (s2 - s3);
  const R = 3 * s3;

  // Bingham concentration parameters (approximate from eigenvalues)
  const n = dcos.length;
  const kappa1 = n * (s2 - s1);
  const kappa2 = n * (s3 - s1);

  return { eigenvalues: values, eigenvectors: vectors, K, C, P, G, R, kappa1, kappa2 };
}
