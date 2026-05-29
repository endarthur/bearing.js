/**
 * @module statistics — Directional statistics for orientation data.
 *
 * All functions take arrays of direction cosines [x, y, z] (unit vectors,
 * lower hemisphere).  Use conversions.planeToDcos / lineToDcos to convert
 * from degree-based representations first.
 */

import * as vec3 from './core/vec3.js';
import { symmetricEigen3 } from './core/eigen.js';
import { dcosToLine } from './core/conversions.js';
import { chiSquareSF, fSF } from './core/special.js';

const RAD2DEG = 180 / Math.PI;

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

/**
 * Fisher cone of confidence about the mean direction, for an arbitrary
 * confidence level. Generalises fisherStats().alpha95 (which it equals at
 * confidence = 0.95).
 *
 * @param {Array<number[]>} dcos
 * @param {number} [confidence=0.95] - e.g. 0.95, 0.99
 * @returns {{ mean: [number, number], halfAngle: number, confidence: number }}
 *   mean as [trend, plunge] in degrees; halfAngle in degrees (0 if undefined).
 */
export function confidenceCone(dcos, confidence = 0.95) {
  const n = dcos.length;
  const res = resultant(dcos);
  const R = vec3.length(res);
  const meanVec = R > 1e-10 ? vec3.scale(res, 1 / R) : [0, 0, -1];

  let halfAngle = 0;
  if (n >= 2 && R > 1e-10 && n - R > 1e-10) {
    const p = 1 - confidence;
    const cosA = 1 - ((n - R) / R) * (Math.pow(1 / p, 1 / (n - 1)) - 1);
    halfAngle = Math.acos(Math.max(-1, Math.min(1, cosA))) * RAD2DEG;
  }
  return { mean: dcosToLine(meanVec), halfAngle, confidence };
}

// ---------------------------------------------------------------------------
//  Hypothesis tests
// ---------------------------------------------------------------------------

/**
 * Bingham test of uniformity for axial (undirected) orientation data: are the
 * orientations uniformly distributed on the sphere, or is there a preferred
 * fabric (cluster or girdle)? Based on the orientation-tensor eigenvalues τᵢ:
 * under uniformity τᵢ → 1/3 and the statistic (15n/2)·(Στᵢ² − 1/3) is
 * approximately χ² with 5 degrees of freedom.
 *
 * Use this for orientation data (poles, lineations) — unlike a vector Rayleigh
 * test it is not biased by confining data to the lower hemisphere, and it
 * detects girdles as well as clusters.
 *
 * @param {Array<number[]>} dcos
 * @returns {{ n:number, eigenvalues:number[], statistic:number, df:number, p:number }}
 *   Small p ⇒ reject uniformity (a preferred fabric exists).
 */
export function uniformityTest(dcos) {
  const n = dcos.length;
  if (n === 0) return { n: 0, eigenvalues: [1 / 3, 1 / 3, 1 / 3], statistic: 0, df: 5, p: 1 };
  const { values } = symmetricEigen3(orientationTensor(dcos));
  const sumSq = values[0] * values[0] + values[1] * values[1] + values[2] * values[2];
  const statistic = (15 * n / 2) * (sumSq - 1 / 3);
  return { n, eigenvalues: values, statistic, df: 5, p: chiSquareSF(statistic, 5) };
}

/**
 * Watson–Williams two-sample test for a common mean direction on the sphere
 * (parametric, assumes Fisher samples of similar, large concentration).
 * Tests H₀: the two samples share a mean direction.
 *
 * @param {Array<number[]>} a
 * @param {Array<number[]>} b
 * @returns {{ F:number, df1:number, df2:number, p:number, Ra:number, Rb:number, R:number }}
 *   Small p ⇒ the mean directions differ. Note: only reliable when both samples
 *   are well concentrated (R̄ ≳ 0.7); sparse/dispersed data violate the assumption.
 */
export function commonMeanTest(a, b) {
  const N = a.length + b.length;
  const Ra = vec3.length(resultant(a));
  const Rb = vec3.length(resultant(b));
  const R = vec3.length(resultant(a.concat(b)));
  const F = (N - 2) * (Ra + Rb - R) / (N - Ra - Rb);
  const df1 = 2, df2 = 2 * (N - 2);
  return { F, df1, df2, p: fSF(F, df1, df2), Ra, Rb, R };
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

/**
 * Confidence ellipse about a principal eigenvector of the orientation tensor.
 *
 * Uses the asymptotic eigenvector standard error (Jupp & Kent): the angular
 * standard error between the estimated and true eigenvector i, measured toward
 * eigenvector j, is σ_ij = √( λᵢλⱼ / (N (λᵢ − λⱼ)²) ). The confidence semi-axis
 * is √(χ²₂) · σ_ij with the 2-DOF χ² quantile χ²₂ = −2·ln(1 − confidence).
 * Approximate — assumes a large sample and a well-separated eigenvalue.
 *
 * @param {Array<number[]>} dcos
 * @param {Object} [options]
 * @param {number} [options.confidence=0.95]
 * @param {'max'|'min'} [options.about='max'] - centre on V1 (cluster mean) or V3 (girdle pole)
 * @returns {{ center:[number,number], azimuth:[number,number], a:number, b:number,
 *             centerDir:number[], majorDir:number[], minorDir:number[], confidence:number }}
 *   center/azimuth as [trend,plunge] degrees; a ≥ b are angular semi-axes in
 *   degrees (clamped to 90°); *Dir are the unit eigenvectors.
 */
export function confidenceEllipse(dcos, options = {}) {
  const confidence = options.confidence != null ? options.confidence : 0.95;
  const about = options.about || 'max';
  const n = dcos.length;
  const { eigenvalues, eigenvectors } = principalAxes(dcos);

  const ci = about === 'min' ? 2 : 0;             // centre eigenvector index
  const others = [0, 1, 2].filter(k => k !== ci);
  const chi2 = -2 * Math.log(1 - confidence);
  const li = eigenvalues[ci];

  const semi = others.map(j => {
    const lj = eigenvalues[j];
    const denom = (li - lj) * (li - lj);
    const variance = denom > 1e-12 ? chi2 * (li * lj) / (n * denom) : Infinity;
    return { j, angle: Math.min(Math.PI / 2, Math.sqrt(variance)) };
  });
  semi.sort((p, q) => q.angle - p.angle);         // major first
  const [major, minor] = semi;

  return {
    center: dcosToLine(eigenvectors[ci]),
    azimuth: dcosToLine(eigenvectors[major.j]),
    a: major.angle * RAD2DEG,
    b: minor.angle * RAD2DEG,
    centerDir: eigenvectors[ci],
    majorDir: eigenvectors[major.j],
    minorDir: eigenvectors[minor.j],
    confidence,
  };
}

// ---------------------------------------------------------------------------
//  Bootstrap (non-parametric) confidence regions
// ---------------------------------------------------------------------------

// Tangent-plane basis (u, w) at a unit vector `a`.
function tangentBasis(a) {
  const ref = Math.abs(a[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = vec3.normalize(vec3.cross(a, ref));
  return [u, vec3.cross(a, u)];
}

// Resample-with-replacement index helper.
function resample(arr, rng) {
  const n = arr.length;
  const out = new Array(n);
  for (let i = 0; i < n; i++) out[i] = arr[(rng() * n) | 0];
  return out;
}

/**
 * Non-parametric bootstrap confidence cone for the mean direction. Resamples the
 * data with replacement, recomputes the mean each iteration, and takes the
 * `confidence` quantile of the angular deviation from the full-sample mean as
 * the cone half-angle. Assumption-light alternative to the Fisher α₉₅.
 *
 * @param {Array<number[]>} dcos
 * @param {Object} [options]
 * @param {number} [options.confidence=0.95]
 * @param {number} [options.iterations=1000]
 * @param {()=>number} [options.rng=Math.random] - uniform [0,1) source (inject for determinism)
 * @returns {{ mean:[number,number], meanDir:number[], halfAngle:number, confidence:number, iterations:number }}
 */
export function bootstrapMeanConfidence(dcos, options = {}) {
  const confidence = options.confidence != null ? options.confidence : 0.95;
  const iterations = options.iterations || 1000;
  const rng = options.rng || Math.random;
  const mean0 = meanVector(dcos);

  const angles = [];
  for (let it = 0; it < iterations; it++) {
    const m = meanVector(resample(dcos, rng));
    let d = m[0] * mean0[0] + m[1] * mean0[1] + m[2] * mean0[2];
    if (d < 0) d = -d;                       // axial safety
    angles.push(Math.acos(Math.max(-1, Math.min(1, d))));
  }
  angles.sort((x, y) => x - y);
  const idx = Math.min(angles.length - 1, Math.floor(confidence * angles.length));
  return {
    mean: dcosToLine(mean0),
    meanDir: mean0,
    halfAngle: angles[idx] * RAD2DEG,
    confidence,
    iterations,
  };
}

/**
 * Non-parametric bootstrap confidence ellipse about a principal eigenvector.
 * Resamples, recomputes the eigenvector each iteration, and fits a Gaussian in
 * the tangent plane at the full-sample eigenvector; semi-axes are √(χ²₂)·σ along
 * the covariance principal directions (χ²₂ = −2·ln(1−confidence)). Returns the
 * same shape as confidenceEllipse, so it feeds straight into Stereonet.ellipse.
 *
 * @param {Array<number[]>} dcos
 * @param {Object} [options]
 * @param {number} [options.confidence=0.95]
 * @param {'max'|'min'} [options.about='max']
 * @param {number} [options.iterations=1000]
 * @param {()=>number} [options.rng=Math.random]
 * @returns {{ center:[number,number], a:number, b:number, centerDir:number[],
 *             majorDir:number[], minorDir:number[], confidence:number, iterations:number }}
 */
export function bootstrapEigenvectorConfidence(dcos, options = {}) {
  const confidence = options.confidence != null ? options.confidence : 0.95;
  const iterations = options.iterations || 1000;
  const about = options.about || 'max';
  const rng = options.rng || Math.random;
  const ci = about === 'min' ? 2 : 0;

  const ref = principalAxes(dcos).eigenvectors[ci];
  const [u, w] = tangentBasis(ref);

  let sxx = 0, sxy = 0, syy = 0, count = 0;
  for (let it = 0; it < iterations; it++) {
    let v = principalAxes(resample(dcos, rng)).eigenvectors[ci];
    if (v[0] * ref[0] + v[1] * ref[1] + v[2] * ref[2] < 0) v = vec3.negate(v);
    const x = v[0] * u[0] + v[1] * u[1] + v[2] * u[2];   // tangent coords (≈ radians)
    const y = v[0] * w[0] + v[1] * w[1] + v[2] * w[2];
    sxx += x * x; sxy += x * y; syy += y * y; count += 1;
  }
  sxx /= count; sxy /= count; syy /= count;

  // 2×2 covariance eigen-decomposition.
  const tr = sxx + syy;
  const det = sxx * syy - sxy * sxy;
  const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
  const l1 = tr / 2 + disc;   // larger variance
  const l2 = tr / 2 - disc;
  // principal direction (in the u,w plane) of the larger-variance axis
  let ax = sxy, ay = l1 - sxx;
  if (Math.abs(ax) < 1e-15 && Math.abs(ay) < 1e-15) { ax = 1; ay = 0; }
  const an = Math.hypot(ax, ay) || 1;
  ax /= an; ay /= an;

  const chi2 = -2 * Math.log(1 - confidence);
  const majorDir = [
    u[0] * ax + w[0] * ay, u[1] * ax + w[1] * ay, u[2] * ax + w[2] * ay,
  ];
  const minorDir = [
    u[0] * -ay + w[0] * ax, u[1] * -ay + w[1] * ax, u[2] * -ay + w[2] * ax,
  ];

  return {
    center: dcosToLine(ref),
    a: Math.min(90, Math.sqrt(chi2 * Math.max(0, l1)) * RAD2DEG),
    b: Math.min(90, Math.sqrt(chi2 * Math.max(0, l2)) * RAD2DEG),
    centerDir: ref,
    majorDir,
    minorDir,
    confidence,
    iterations,
  };
}
