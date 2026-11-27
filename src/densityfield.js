/**
 * @module densityfield — density on the SPHERE, computed once, read in any view.
 *
 * `densityGrid` evaluates the density at the nodes of a grid laid over the projected net, so a rotated
 * net (a new view of the same data) means counting every measurement against every node again. A
 * density field is the same density evaluated once on a fixed set of nodes on the lower hemisphere —
 * rings of constant colatitude, about `step` degrees apart, each ring as many nodes as its circumference
 * holds — and READ in a view by interpolation: a view node's direction, turned back into the data's frame,
 * falls between two rings and two nodes on each. Rotating, switching projection, or drawing the lines at
 * one grid size and the filled bands at another all read the one field.
 *
 * Axial throughout, like the direct count: a measurement and its antipode are the same, and so are a node
 * and its antipode (only the lower hemisphere is stored; an upper-hemisphere direction is read at its
 * antipode). The value at each node is EXACTLY the direct one (the same formula); what interpolation
 * changes is only what lies between nodes.
 *
 * Building it is a local search, not every node against every measurement: the measurements (and their
 * antipodes) are bucketed in a 3D grid whose cells are as wide as the kernel's reach — the Kamb counting
 * cone, or the angle beyond which the Fisher kernel is below 1e-9 of its peak — so a node looks at the 27
 * cells around it. A wide kernel (small n) makes few cells and the search is the plain sum it replaces.
 */

const DEG = Math.PI / 180;
const TINY = 20.7;                                   // exp(-20.7) ≈ 1e-9: where the Fisher kernel is truncated

/** the kernel's parameters for n measurements — shared with densityGrid's direct count */
export function kernelOf(n, options = {}) {
  const method = options.method || 'fisher';
  if (method === 'kamb') {
    const k = options.kambSigma != null ? options.kambSigma : 3;
    const cosTheta = n / (n + k * k), A = 1 - cosTheta;
    return { method, cosCut: cosTheta, E: n * A, sd: Math.sqrt(n * A * (1 - A)) || 1 };
  }
  const sigma = (options.sigma != null ? options.sigma : 90 / Math.sqrt(n)) * DEG;
  const kappa = 1 / (1 - Math.cos(sigma));
  return { method, kappa, cosCut: Math.max(-1, 1 - TINY / kappa) };
}

/** weights scaled to sum to n (so E, σ and the MUD keep their meaning), or null */
export function scaledWeights(weights, n) {
  if (!weights || weights.length !== n) return null;
  let s = 0; for (const w of weights) s += (w > 0 && Number.isFinite(w)) ? w : 0;
  return s > 0 ? weights.map((w) => ((w > 0 && Number.isFinite(w)) ? w : 0) * n / s) : null;
}

// ── the nodes: rings over the lower hemisphere, colatitude t from the nadir (0) to the horizon (90°) ──
function ringsOf(stepDeg) {
  const R = Math.max(2, Math.round(90 / stepDeg)), dt = (Math.PI / 2) / R;
  const counts = new Int32Array(R + 1), offsets = new Int32Array(R + 2);
  for (let r = 0; r <= R; r++) {
    counts[r] = r === 0 ? 1 : Math.max(6, Math.round((2 * Math.PI * Math.sin(r * dt)) / dt));
    offsets[r + 1] = offsets[r] + counts[r];
  }
  return { R, dt, counts, offsets, total: offsets[R + 1] };
}
// a node's direction: azimuth φ clockwise from north (+y), colatitude t from the nadir (z = −1)
const nodeDir = (t, phi) => [Math.sin(t) * Math.sin(phi), Math.sin(t) * Math.cos(phi), -Math.cos(t)];

// ── the search: every measurement AND its antipode in 3D cells of side ≥ the kernel's chord ──
function bucketsOf(data, cosCut) {
  const chord = Math.sqrt(Math.max(0, 2 - 2 * cosCut));   // the straight-line reach of the kernel
  const nc = Math.max(1, Math.min(64, Math.floor(2 / Math.max(chord, 1e-6))));   // cells per axis over [-1, 1]
  const size = 2 / nc, cell = (v) => Math.min(nc - 1, Math.max(0, Math.floor((v + 1) / size)));
  const map = new Map();
  const put = (x, y, z, m) => { const k = (cell(x) * nc + cell(y)) * nc + cell(z); let b = map.get(k); if (!b) { b = []; map.set(k, b); } b.push(m); };
  for (let m = 0; m < data.length; m++) { const d = data[m]; put(d[0], d[1], d[2], m); put(-d[0], -d[1], -d[2], ~m); }   // ~m: the antipode
  return { nc, cell, map };
}

/**
 * The density of `dcos` on the sphere (the same values densityGrid computes, at fixed nodes).
 * @param {Array<number[]>} dcos  unit vectors, in the DATA's frame (no view rotation)
 * @param {{ method?: 'fisher'|'kamb', sigma?: number, kambSigma?: number, weights?: number[], step?: number }} [options]
 *   step: the node spacing in degrees (default 1.2)
 * @returns {{ method: string, n: number, step: number, values: Float64Array, at(d: number[]): number }}
 *   at(d): the density at any unit direction (interpolated; axial)
 */
export function densityField(dcos, options = {}) {
  const n = dcos.length, method = options.method || 'fisher', stepDeg = options.step || 1.2;
  const rings = ringsOf(stepDeg), values = new Float64Array(rings.total);
  if (n === 0) { values.fill(NaN); return makeField(method, n, stepDeg, rings, values); }
  const K = kernelOf(n, options), wt = scaledWeights(options.weights, n);
  const B = bucketsOf(dcos, K.cosCut);
  for (let r = 0; r <= rings.R; r++) {
    const t = r * rings.dt, c = rings.counts[r];
    for (let k = 0; k < c; k++) {
      const d = nodeDir(t, (2 * Math.PI * k) / c);
      const ci = B.cell(d[0]), cj = B.cell(d[1]), ck = B.cell(d[2]);
      let acc = 0;
      for (let a = ci - 1; a <= ci + 1; a++) {
        if (a < 0 || a >= B.nc) continue;
        for (let b = cj - 1; b <= cj + 1; b++) {
          if (b < 0 || b >= B.nc) continue;
          for (let e = ck - 1; e <= ck + 1; e++) {
            if (e < 0 || e >= B.nc) continue;
            const bucket = B.map.get((a * B.nc + b) * B.nc + e); if (!bucket) continue;
            for (const s of bucket) {
              const m = s < 0 ? ~s : s, q = dcos[m], sg = s < 0 ? -1 : 1;
              const dot = sg * (d[0] * q[0] + d[1] * q[1] + d[2] * q[2]);
              if (dot < K.cosCut) continue;            // outside the cone / below the kernel's reach
              // a measurement within reach of BOTH the node and its antipode can't happen for a cap under 90°;
              // a wider kernel (cosCut ≤ 0) would see both copies — the |dot| of the direct sum counts one
              if (K.cosCut <= 0 && dot < 0) continue;
              const w = wt ? wt[m] : 1;
              acc += method === 'kamb' ? w : w * Math.exp(K.kappa * (dot - 1));
            }
          }
        }
      }
      values[rings.offsets[r] + k] = method === 'kamb' ? (acc - K.E) / K.sd : (K.kappa * acc) / n;
    }
  }
  return makeField(method, n, stepDeg, rings, values);
}

function makeField(method, n, step, rings, values) {
  const { R, dt, counts, offsets } = rings;
  // along one ring: linear in azimuth, wrapping
  const onRing = (r, phi) => {
    const c = counts[r], o = offsets[r];
    if (c === 1) return values[o];
    let u = (phi / (2 * Math.PI)) * c; u -= Math.floor(u / c) * c;
    const k0 = Math.floor(u) % c, k1 = (k0 + 1) % c, f = u - Math.floor(u);
    return values[o + k0] * (1 - f) + values[o + k1] * f;
  };
  return {
    method, n, step, values,
    at(d) {
      let x = d[0], y = d[1], z = d[2];
      if (z > 0) { x = -x; y = -y; z = -z; }          // axial: the upper hemisphere reads its antipode
      const t = Math.acos(Math.max(-1, Math.min(1, -z))), phi = Math.atan2(x, y);
      const u = t / dt, r0 = Math.min(R, Math.floor(u)), f = u - r0;
      if (r0 >= R) return onRing(R, phi);
      return onRing(r0, phi) * (1 - f) + onRing(r0 + 1, phi) * f;
    },
  };
}

// ── the cache: callers build fresh arrays on every draw, so it is keyed by CONTENT ──
const CACHE = new Map(), CACHE_MAX = 8;
let hits = 0, misses = 0;
function keyOf(dcos, options) {
  // FNV-1a over the coordinates (to 1e-9) and the weights, plus the kernel settings
  let h = 0x811c9dc5;
  const mix = (v) => { const q = Math.round(v * 1e9) | 0; h ^= q; h = Math.imul(h, 0x01000193); h ^= q >>> 16; h = Math.imul(h, 0x01000193); };
  for (const d of dcos) { mix(d[0]); mix(d[1]); mix(d[2]); }
  if (options.weights) for (const w of options.weights) mix(+w || 0);
  return `${options.method || 'fisher'}|${options.sigma ?? ''}|${options.kambSigma ?? ''}|${options.step || 1.2}|${dcos.length}|${options.weights ? options.weights.length : 0}|${h >>> 0}`;
}
/** densityField, remembered: the same data and settings → the same field, without computing it again */
export function cachedDensityField(dcos, options = {}) {
  const key = keyOf(dcos, options);
  let f = CACHE.get(key);
  if (f) { hits++; CACHE.delete(key); CACHE.set(key, f); return f; }   // most recently used last
  misses++;
  f = densityField(dcos, options);
  CACHE.set(key, f);
  if (CACHE.size > CACHE_MAX) CACHE.delete(CACHE.keys().next().value);
  return f;
}
/** the cache's counters (for tests and a curious caller), and a way to empty it */
export const densityFieldCache = {
  get stats() { return { size: CACHE.size, hits, misses }; },
  clear() { CACHE.clear(); hits = 0; misses = 0; },
};
