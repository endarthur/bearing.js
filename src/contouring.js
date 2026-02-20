/**
 * @module contouring — Density estimation and contour extraction on the sphere.
 *
 * Uses an exponential (Fisher) kernel for smooth density estimation on a
 * regular grid in projected space, then marching squares for contour lines.
 */

import * as mat3 from './core/mat3.js';
import { inverse as equalAreaInverse } from './projections/equal-area.js';
import { inverse as equalAngleInverse } from './projections/equal-angle.js';

const DEG = Math.PI / 180;

/**
 * Compute contour paths for a set of direction cosines.
 *
 * @param {Array<number[]>} dcos - unit vectors (lower hemisphere)
 * @param {Object} options
 * @param {string}  [options.projection='equal-area']
 * @param {number[]|null} [options.rotation=null] - 3×3 rotation matrix
 * @param {number}  [options.gridSize=40] - grid cells per side
 * @param {number[]} [options.levels=[2,4,6,8]] - density levels (MUD)
 * @param {number}  [options.sigma] - kernel half-width in degrees (auto if omitted)
 * @returns {Array<{ level: number, paths: number[][][] }>}
 *   paths in **projected** coordinates [px, py]
 */
export function computeContours(dcos, options = {}) {
  const {
    projection = 'equal-area',
    rotation = null,
    gridSize = 40,
    levels = [2, 4, 6, 8],
  } = options;

  const n = dcos.length;
  if (n === 0) return levels.map(level => ({ level, paths: [] }));

  // Kernel width: default ≈ 90/√n degrees
  const sigma = (options.sigma != null ? options.sigma : 90 / Math.sqrt(n)) * DEG;
  const cosSigma = Math.cos(sigma);
  const kappa = 1 / (1 - cosSigma);

  const inverseFn = projection === 'equal-angle' ? equalAngleInverse : equalAreaInverse;
  const projR = projection === 'equal-angle' ? 1 : Math.SQRT2;

  // Pre-rotate data into the view frame
  const data = rotation ? dcos.map(d => mat3.transformVec3(rotation, d)) : dcos;

  // --- density grid ----------------------------------------------------------
  const grid = new Float64Array(gridSize * gridSize);
  const step = 2 * projR / (gridSize - 1);

  for (let j = 0; j < gridSize; j++) {
    const py = projR - j * step;
    for (let i = 0; i < gridSize; i++) {
      const px = -projR + i * step;

      if (px * px + py * py > projR * projR * 1.02) {
        grid[j * gridSize + i] = NaN;
        continue;
      }

      const d = inverseFn(px, py);
      if (!d) { grid[j * gridSize + i] = NaN; continue; }

      let density = 0;
      for (let k = 0; k < n; k++) {
        const rd = data[k];
        const dot = d[0] * rd[0] + d[1] * rd[1] + d[2] * rd[2];
        density += Math.exp(kappa * (dot - 1));
      }

      // MUD normalisation:  MUD ≈ κ/n · Σ exp(κ(cosθ − 1))
      grid[j * gridSize + i] = kappa * density / n;
    }
  }

  // --- marching squares at each level ----------------------------------------
  return levels.map(level => ({
    level,
    paths: assembleSegments(
      marchingSquares(grid, gridSize, step, projR, level),
    ),
  }));
}

// =============================================================================
//  Marching squares
// =============================================================================

/**
 * Extract raw line segments for one contour level.
 * Returns array of [[x1,y1],[x2,y2]] in projected coordinates.
 */
function marchingSquares(grid, size, step, projR, level) {
  const segments = [];

  for (let j = 0; j < size - 1; j++) {
    for (let i = 0; i < size - 1; i++) {
      const vTL = grid[j * size + i];
      const vTR = grid[j * size + i + 1];
      const vBL = grid[(j + 1) * size + i];
      const vBR = grid[(j + 1) * size + i + 1];

      if (isNaN(vTL) || isNaN(vTR) || isNaN(vBL) || isNaN(vBR)) continue;

      const code =
        (vTL >= level ? 8 : 0) |
        (vTR >= level ? 4 : 0) |
        (vBR >= level ? 2 : 0) |
        (vBL >= level ? 1 : 0);

      if (code === 0 || code === 15) continue;

      // Corner positions in projected space
      const x0 = -projR + i * step;
      const x1 = x0 + step;
      const y0 = projR - j * step;        // top row
      const y1 = y0 - step;               // bottom row

      // Linear interpolation along an edge
      const lerp = (va, vb, pa, pb) => pa + (level - va) / (vb - va) * (pb - pa);

      const T = [lerp(vTL, vTR, x0, x1), y0];   // top edge
      const B = [lerp(vBL, vBR, x0, x1), y1];   // bottom edge
      const L = [x0, lerp(vTL, vBL, y0, y1)];   // left edge
      const R = [x1, lerp(vTR, vBR, y0, y1)];   // right edge

      switch (code) {
        case  1: case 14: segments.push([B, L]); break;
        case  2: case 13: segments.push([R, B]); break;
        case  3: case 12: segments.push([R, L]); break;
        case  4: case 11: segments.push([T, R]); break;
        case  6: case  9: segments.push([T, B]); break;
        case  7: case  8: segments.push([T, L]); break;
        case 5: { // saddle — disambiguate with center value
          const ctr = (vTL + vTR + vBL + vBR) / 4;
          if (ctr >= level) { segments.push([L, T]); segments.push([B, R]); }
          else              { segments.push([B, L]); segments.push([T, R]); }
          break;
        }
        case 10: { // saddle
          const ctr = (vTL + vTR + vBL + vBR) / 4;
          if (ctr >= level) { segments.push([T, R]); segments.push([L, B]); }
          else              { segments.push([T, L]); segments.push([R, B]); }
          break;
        }
      }
    }
  }

  return segments;
}

// =============================================================================
//  Segment assembly — chain raw segments into polylines
// =============================================================================

const SNAP = 1e-8;

function close(a, b) {
  return Math.abs(a[0] - b[0]) < SNAP && Math.abs(a[1] - b[1]) < SNAP;
}

/**
 * Chain raw [[p1,p2], ...] segments into connected polylines.
 */
function assembleSegments(segments) {
  if (segments.length === 0) return [];

  const used = new Uint8Array(segments.length);
  const paths = [];

  for (let s = 0; s < segments.length; s++) {
    if (used[s]) continue;
    used[s] = 1;

    const path = [segments[s][0], segments[s][1]];

    // Extend forward
    let changed = true;
    while (changed) {
      changed = false;
      const tail = path[path.length - 1];
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        if (close(tail, segments[i][0])) {
          path.push(segments[i][1]); used[i] = 1; changed = true; break;
        }
        if (close(tail, segments[i][1])) {
          path.push(segments[i][0]); used[i] = 1; changed = true; break;
        }
      }
    }

    // Extend backward
    changed = true;
    while (changed) {
      changed = false;
      const head = path[0];
      for (let i = 0; i < segments.length; i++) {
        if (used[i]) continue;
        if (close(head, segments[i][1])) {
          path.unshift(segments[i][0]); used[i] = 1; changed = true; break;
        }
        if (close(head, segments[i][0])) {
          path.unshift(segments[i][1]); used[i] = 1; changed = true; break;
        }
      }
    }

    paths.push(path);
  }

  return paths;
}
