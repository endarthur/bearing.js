/**
 * @module simulate — Sampling orientation data on the sphere.
 *
 * sampleFisher draws from a Fisher (von Mises–Fisher on S²) distribution;
 * smoothedBootstrap resamples an arbitrary fabric by sampling its Fisher kernel
 * density — the non-parametric way to generate synthetic data with the same
 * (possibly multimodal / girdle) structure, by default at the same bandwidth the
 * contouring uses. Pass options.rng for deterministic output.
 */

import * as vec3 from './core/vec3.js';

const DEG = Math.PI / 180;

// Orthonormal tangent basis (u, v) at a unit vector mu.
function tangentBasis(mu) {
  const ref = Math.abs(mu[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  const u = vec3.normalize(vec3.cross(mu, ref));
  return [u, vec3.cross(mu, u)];
}

/**
 * Default kernel concentration for a sample of size n — matches the contouring
 * default (σ ≈ 90/√n degrees, κ = 1/(1−cos σ)).
 * @param {number} n
 * @returns {number} κ
 */
export function defaultKappa(n) {
  const sigma = (90 / Math.sqrt(Math.max(1, n))) * DEG;
  return 1 / (1 - Math.cos(sigma));
}

/**
 * Sample n points from a Fisher distribution about a mean direction.
 * @param {number[]} mean - mean direction (will be normalised)
 * @param {number} kappa - concentration (0 → uniform on the sphere)
 * @param {number} n - number of samples
 * @param {()=>number} [rng=Math.random] - uniform [0,1) source
 * @returns {Array<number[]>} unit vectors
 */
export function sampleFisher(mean, kappa, n, rng = Math.random) {
  const mu = vec3.normalize(mean);
  const [u, v] = tangentBasis(mu);
  const out = [];
  for (let i = 0; i < n; i++) {
    const U = rng();
    // w = cos(angle from mu), inverse-CDF of the vMF; → uniform as kappa → 0.
    let w = kappa < 1e-6
      ? 2 * U - 1
      : 1 + Math.log(U + (1 - U) * Math.exp(-2 * kappa)) / kappa;
    w = Math.max(-1, Math.min(1, w));
    const phi = 2 * Math.PI * rng();
    const s = Math.sqrt(Math.max(0, 1 - w * w));
    const cp = Math.cos(phi), sp = Math.sin(phi);
    out.push([
      s * (cp * u[0] + sp * v[0]) + w * mu[0],
      s * (cp * u[1] + sp * v[1]) + w * mu[1],
      s * (cp * u[2] + sp * v[2]) + w * mu[2],
    ]);
  }
  return out;
}

/**
 * Fisher-kernel smoothed bootstrap: draw m synthetic orientations by repeatedly
 * picking a random datum and perturbing it with a Fisher kernel. Samples the
 * kernel-density estimate, so it preserves arbitrary structure (multimodal,
 * girdle) — unlike a tangent-space Gaussian approximation.
 *
 * @param {Array<number[]>} dcos - observed unit vectors
 * @param {number} [m=dcos.length] - number of synthetic points
 * @param {Object} [options]
 * @param {number} [options.kappa] - kernel concentration (default: defaultKappa(n))
 * @param {boolean} [options.lowerHemisphere=true] - fold samples to z ≤ 0 (axial data)
 * @param {()=>number} [options.rng=Math.random]
 * @returns {Array<number[]>} unit vectors
 */
export function smoothedBootstrap(dcos, m, options = {}) {
  const n = dcos.length;
  if (n === 0) return [];
  const count = m != null ? m : n;
  const rng = options.rng || Math.random;
  const kappa = options.kappa != null ? options.kappa : defaultKappa(n);
  const fold = options.lowerHemisphere !== false;

  const out = [];
  for (let i = 0; i < count; i++) {
    const d = dcos[(rng() * n) | 0];
    const p = sampleFisher(d, kappa, 1, rng)[0];
    if (fold && p[2] > 0) { p[0] = -p[0]; p[1] = -p[1]; p[2] = -p[2]; }
    out.push(p);
  }
  return out;
}
