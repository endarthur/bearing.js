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
