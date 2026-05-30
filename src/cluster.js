/**
 * @module cluster — Automatic identification of orientation sets.
 *
 * Axial k-means on the sphere: separates a sample into k sets (e.g. joint sets,
 * lineation populations). Similarity is |x·c| (axial — direction and its
 * antipode are equivalent); each cluster axis is the leading eigenvector of its
 * members' orientation tensor. k-means++ initialisation with multiple restarts.
 *
 * This is a heuristic clustering, not a full probabilistic mixture model — it
 * gives hard assignments and per-cluster concentration, which is usually what
 * set identification needs. Choose k yourself (or sweep it).
 */

import { symmetricEigen3 } from './core/eigen.js';
import { dcosToLine } from './core/conversions.js';

function leadingAxis(members) {
  // Leading eigenvector of the orientation tensor of the member unit vectors,
  // plus its eigenvalue (concentration τ1 ∈ [1/3, 1]).
  const T = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  for (const d of members) {
    T[0] += d[0] * d[0]; T[1] += d[0] * d[1]; T[2] += d[0] * d[2];
    T[4] += d[1] * d[1]; T[5] += d[1] * d[2]; T[8] += d[2] * d[2];
  }
  T[3] = T[1]; T[6] = T[2]; T[7] = T[5];
  const n = members.length || 1;
  for (let i = 0; i < 9; i++) T[i] /= n;
  const { values, vectors } = symmetricEigen3(T);
  return { axis: vectors[0], concentration: values[0] };
}

const adot = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);

// One k-means run from a given initialisation; returns centers, assignment, cost.
function runOnce(dcos, centers, maxIter) {
  const n = dcos.length;
  const assign = new Array(n).fill(0);
  let cost = Infinity;
  for (let iter = 0; iter < maxIter; iter++) {
    // Assign each point to the most-aligned center (axial).
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestSim = -1;
      for (let c = 0; c < centers.length; c++) {
        const sim = adot(dcos[i], centers[c]);
        if (sim > bestSim) { bestSim = sim; best = c; }
      }
      if (assign[i] !== best) { assign[i] = best; changed = true; }
    }
    // Update centers from member tensors; reseed empty clusters at the worst point.
    for (let c = 0; c < centers.length; c++) {
      const members = [];
      for (let i = 0; i < n; i++) if (assign[i] === c) members.push(dcos[i]);
      if (members.length === 0) {
        let worst = 0, worstSim = Infinity;
        for (let i = 0; i < n; i++) {
          const sim = adot(dcos[i], centers[assign[i]]);
          if (sim < worstSim) { worstSim = sim; worst = i; }
        }
        centers[c] = dcos[worst].slice();
      } else {
        centers[c] = leadingAxis(members).axis;
      }
    }
    cost = 0;
    for (let i = 0; i < n; i++) {
      const s = adot(dcos[i], centers[assign[i]]);
      cost += 1 - s * s;                       // axial within-cluster scatter
    }
    if (!changed && iter > 0) break;
  }
  return { centers, assign, cost };
}

// k-means++ seeding (axial distance 1 − |x·c|²).
function seedCenters(dcos, k, rng) {
  const n = dcos.length;
  const centers = [dcos[(rng() * n) | 0].slice()];
  while (centers.length < k) {
    const d2 = new Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      let nearest = 0;
      for (const c of centers) { const s = adot(dcos[i], c); if (s * s > nearest) nearest = s * s; }
      d2[i] = 1 - nearest; total += d2[i];
    }
    let r = rng() * (total || 1), pick = n - 1;
    for (let i = 0; i < n; i++) { r -= d2[i]; if (r <= 0) { pick = i; break; } }
    centers.push(dcos[pick].slice());
  }
  return centers;
}

/**
 * Identify k orientation sets by axial k-means.
 *
 * @param {Array<number[]>} dcos - unit vectors (lower hemisphere)
 * @param {number} k - number of sets to find
 * @param {Object} [options]
 * @param {number} [options.restarts=8] - k-means++ restarts (best kept)
 * @param {number} [options.maxIter=50]
 * @param {()=>number} [options.rng=Math.random] - inject for deterministic results
 * @returns {{ clusters: Array<{ axis:[number,number], axisDir:number[], size:number,
 *             fraction:number, concentration:number, members:number[] }>,
 *             assignments:number[], cost:number }}
 *   clusters sorted by size (desc); concentration is the leading tensor
 *   eigenvalue τ1 (≈1 tight, →1/3 diffuse); assignments[i] indexes the
 *   *returned* clusters; cost is the total axial within-cluster scatter.
 */
export function fitSets(dcos, k, options = {}) {
  const n = dcos.length;
  const restarts = options.restarts || 8;
  const maxIter = options.maxIter || 50;
  const rng = options.rng || Math.random;
  if (n === 0 || k < 1) return { clusters: [], assignments: [], cost: 0 };

  let best = null;
  for (let r = 0; r < restarts; r++) {
    const res = runOnce(dcos, seedCenters(dcos, Math.min(k, n), rng), maxIter);
    if (!best || res.cost < best.cost) best = res;
  }

  // Build cluster summaries, then sort by size and remap assignments.
  const raw = best.centers.map(() => []);
  best.assign.forEach((c, i) => raw[c].push(i));
  let clusters = raw.map((members) => {
    const vecs = members.map(i => dcos[i]);
    const { axis, concentration } = members.length ? leadingAxis(vecs) : { axis: [0, 0, -1], concentration: 1 / 3 };
    return { axisDir: axis, axis: dcosToLine(axis), size: members.length, fraction: members.length / n, concentration, members };
  }).filter(c => c.size > 0);
  clusters.sort((a, b) => b.size - a.size);

  const remap = new Map();
  clusters.forEach((c, newIdx) => c.members.forEach(i => remap.set(i, newIdx)));
  const assignments = best.assign.map((_, i) => remap.get(i));

  return { clusters, assignments, cost: best.cost };
}

// ---------------------------------------------------------------------------
//  Watson-mixture EM (soft, probabilistic) + model selection
// ---------------------------------------------------------------------------
//
// The Watson distribution f(x) ∝ exp(κ(μ·x)²) is the natural axial (direction ≡
// antipode) model on the sphere. Its normaliser uses the Kummer function
// M(½,3/2,κ) = Σ κⁿ/((2n+1)·n!); κ is recovered from the concentration r = ⟨(μ·x)²⟩
// (the leading scatter eigenvalue) by inverting r(κ) = M′/M. Both are computed
// by series; large-κ falls back to the leading asymptotic.

function watsonM(kappa) {
  if (kappa > 100) return Math.exp(kappa) / (2 * kappa);
  let term = 1, sum = 1;
  for (let i = 1; i < 200; i++) {
    term *= kappa / i;                 // κⁱ/i!
    const add = term / (2 * i + 1);
    sum += add;
    if (add < sum * 1e-15) break;
  }
  return sum;
}
function watsonMprime(kappa) {
  if (kappa > 100) return Math.exp(kappa) / (2 * kappa);
  let term = 1, sum = 1 / 3;          // i=1: κ⁰/(3·0!)
  for (let i = 2; i < 200; i++) {
    term *= kappa / (i - 1);           // κ^{i-1}/(i-1)!
    const add = term / (2 * i + 1);
    sum += add;
    if (add < sum * 1e-15) break;
  }
  return sum;
}
function rOfKappa(kappa) {
  if (kappa < 1e-9) return 1 / 3;
  if (kappa > 100) return 1 - 1 / (2 * kappa);
  return watsonMprime(kappa) / watsonM(kappa);
}
/** Concentration κ of a Watson component from its scatter eigenvalue r ∈ [1/3,1). */
function kappaFromR(r) {
  if (r <= 1 / 3) return 0;
  if (r >= 0.9995) return 200;
  let lo = 0, hi = 200;
  for (let it = 0; it < 80; it++) {
    const mid = (lo + hi) / 2;
    if (rOfKappa(mid) < r) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
function lnWatsonNorm(kappa) {            // log C₃(κ), density = C·exp(κ t²)
  const lnM = kappa > 100 ? kappa - Math.log(2 * kappa) : Math.log(watsonM(kappa));
  return -Math.log(4 * Math.PI) - lnM;
}

// Leading eigenpair of a weighted orientation scatter Σ wᵢ xᵢxᵢᵀ / Σ wᵢ.
function weightedAxis(dcos, weights) {
  const T = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  let W = 0;
  for (let i = 0; i < dcos.length; i++) {
    const w = weights[i], d = dcos[i];
    if (w <= 0) continue;
    W += w;
    T[0] += w * d[0] * d[0]; T[1] += w * d[0] * d[1]; T[2] += w * d[0] * d[2];
    T[4] += w * d[1] * d[1]; T[5] += w * d[1] * d[2]; T[8] += w * d[2] * d[2];
  }
  T[3] = T[1]; T[6] = T[2]; T[7] = T[5];
  const inv = W > 0 ? 1 / W : 0;
  for (let i = 0; i < 9; i++) T[i] *= inv;
  const { values, vectors } = symmetricEigen3(T);
  return { axis: vectors[0], concentration: values[0], weight: W };
}

function emOnce(dcos, k, centers, maxIter, tol) {
  const n = dcos.length;
  const mu = centers.map(c => c.slice());
  const kappa = new Array(k).fill(10);
  const w = new Array(k).fill(1 / k);
  const resp = Array.from({ length: n }, () => new Array(k).fill(0));
  let ll = -Infinity;

  for (let iter = 0; iter < maxIter; iter++) {
    // E-step
    let newLl = 0;
    for (let i = 0; i < n; i++) {
      const lp = new Array(k);
      let mx = -Infinity;
      for (let c = 0; c < k; c++) {
        const dot = dcos[i][0] * mu[c][0] + dcos[i][1] * mu[c][1] + dcos[i][2] * mu[c][2];
        lp[c] = Math.log(w[c] + 1e-300) + lnWatsonNorm(kappa[c]) + kappa[c] * dot * dot;
        if (lp[c] > mx) mx = lp[c];
      }
      let se = 0;
      for (let c = 0; c < k; c++) se += Math.exp(lp[c] - mx);
      const lse = mx + Math.log(se);
      newLl += lse;
      for (let c = 0; c < k; c++) resp[i][c] = Math.exp(lp[c] - lse);
    }
    // M-step
    for (let c = 0; c < k; c++) {
      const col = resp.map(r => r[c]);
      const { axis, concentration, weight } = weightedAxis(dcos, col);
      if (weight < 1e-6) { mu[c] = dcos[(iter + c) % n].slice(); kappa[c] = 1; w[c] = 1e-6; continue; }
      mu[c] = axis;
      kappa[c] = kappaFromR(Math.min(0.999, concentration));
      w[c] = weight / n;
    }
    if (Math.abs(newLl - ll) < tol * Math.abs(newLl)) { ll = newLl; break; }
    ll = newLl;
  }
  return { mu, kappa, w, resp, logLikelihood: ll };
}

/**
 * Soft (probabilistic) identification of k orientation sets by Watson-mixture EM.
 * Unlike fitSets (hard k-means), every point gets a responsibility vector across
 * the k sets, and each component carries a proper concentration κ.
 *
 * @param {Array<number[]>} dcos
 * @param {number} k
 * @param {Object} [options] @param {number} [options.restarts=5] @param {number} [options.maxIter=100]
 *   @param {()=>number} [options.rng=Math.random]
 * @returns {{ components: Array<{axis:[number,number], axisDir:number[], weight:number,
 *             kappa:number, concentration:number}>, responsibilities:number[][],
 *             assignments:number[], logLikelihood:number, bic:number }}
 *   components sorted by weight (desc); bic = −2·LL + (4k−1)·ln(n) for model selection.
 */
export function fitSetsEM(dcos, k, options = {}) {
  const n = dcos.length;
  if (n === 0 || k < 1) return { components: [], responsibilities: [], assignments: [], logLikelihood: 0, bic: Infinity };
  const restarts = options.restarts || 5;
  const maxIter = options.maxIter || 100;
  const tol = options.tol || 1e-7;
  const rng = options.rng || Math.random;

  let best = null;
  for (let rs = 0; rs < restarts; rs++) {
    const res = emOnce(dcos, Math.min(k, n), seedCenters(dcos, Math.min(k, n), rng), maxIter, tol);
    if (!best || res.logLikelihood > best.logLikelihood) best = res;
  }

  const order = best.w.map((_, i) => i).sort((a, b) => best.w[b] - best.w[a]);
  const components = order.map(c => ({
    axis: dcosToLine(best.mu[c]),
    axisDir: best.mu[c],
    weight: best.w[c],
    kappa: best.kappa[c],
    concentration: rOfKappa(best.kappa[c]),
  }));
  const responsibilities = best.resp.map(r => order.map(c => r[c]));
  const assignments = responsibilities.map(r => {
    let bi = 0; for (let c = 1; c < r.length; c++) if (r[c] > r[bi]) bi = c; return bi;
  });
  const bic = -2 * best.logLikelihood + (4 * k - 1) * Math.log(n);
  return { components, responsibilities, assignments, logLikelihood: best.logLikelihood, bic };
}

/**
 * Choose the number of sets by BIC: fit Watson mixtures for k = kMin…kMax and
 * return the model with the lowest BIC.
 * @param {Array<number[]>} dcos
 * @param {Object} [options] @param {number} [options.kMin=1] @param {number} [options.kMax=5] plus fitSetsEM options
 * @returns {{ best:Object, bestK:number, bics:Array<{k:number,bic:number}> }}
 */
export function selectSets(dcos, options = {}) {
  const kMin = options.kMin || 1;
  const kMax = options.kMax || 5;
  const rng = options.rng || Math.random;
  let best = null, bestK = kMin;
  const bics = [];
  for (let k = kMin; k <= kMax; k++) {
    const fit = fitSetsEM(dcos, k, { ...options, rng });
    bics.push({ k, bic: fit.bic });
    if (!best || fit.bic < best.bic) { best = fit; bestK = k; }
  }
  return { best, bestK, bics };
}
