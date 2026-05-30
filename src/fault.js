/**
 * @module fault — Fault-slip kinematics and paleostress.
 *
 * Faults are given as (plane normal, slip vector) pairs of direction cosines.
 * Provides slip-sense resolution, kinematic P/T axes, the Angelier right-dihedra
 * field (for P-T dihedra plots), and the Michael (1984) linear paleostress
 * inversion. Inversion/dihedra ported from the author's `auttitude` library.
 *
 * Paleostress sign/ordering follows Michael (1984)/auttitude:
 * principalStresses returns axes ordered [σ1 (compressive), σ2, σ3 (tensile)].
 * Verify the sign convention against a known dataset before quantitative use.
 */

import * as vec3 from './core/vec3.js';
import { symmetricEigen3 } from './core/eigen.js';
import { inverse as equalAreaInverse } from './projections/equal-area.js';
import { inverse as equalAngleInverse } from './projections/equal-angle.js';

/**
 * Down-dip direction (dip vector) of a plane from its pole (downward normal).
 * @param {number[]} normal - plane pole [x,y,z]
 * @returns {number[]} unit down-dip vector
 */
export function dipVector(normal) {
  let n = vec3.normalize(normal);
  if (n[2] > 0) n = vec3.negate(n);              // lower-hemisphere pole
  const down = [0, 0, -1];
  // component of straight-down within the plane
  const proj = vec3.sub(down, vec3.scale(n, vec3.dot(down, n)));
  const len = vec3.length(proj);
  return len < 1e-10 ? [1, 0, 0] : vec3.scale(proj, 1 / len);
}

/**
 * Resolve a slickenline into an oriented slip vector from a sense indicator,
 * following OpenStereo's convention. Sense (first char, case-insensitive):
 *   u/f/?/0/5 → undefined (returns line as-is, defined=false)
 *   n/-/2 → normal (line as-is);  i/+/1 → inverse/reverse (−line)
 *   d/3 → dextral;  s/4 → sinistral (oriented via the dip vector)
 * @param {number[]} normal - fault-plane pole
 * @param {number[]} line - slickenline direction
 * @param {string|number} sense
 * @returns {{ slip: number[], defined: boolean }}
 */
export function resolveSense(normal, line, sense) {
  let n = vec3.normalize(normal);
  if (n[2] > 0) n = vec3.negate(n);
  const s = String(sense).toLowerCase()[0];
  if (s === 'u' || s === 'f' || s === '0' || s === '5' || s === '?') return { slip: line, defined: false };
  if (s === 'n' || s === '2' || s === '-') return { slip: line, defined: true };
  if (s === 'i' || s === '1' || s === '+') return { slip: vec3.negate(line), defined: true };

  const lineSense = vec3.dot(dipVector(n), line);
  if (s === 'd' || s === '3') return { slip: lineSense > 0 ? line : vec3.negate(line), defined: true };
  if (s === 's' || s === '4') return { slip: lineSense < 0 ? line : vec3.negate(line), defined: true };
  return { slip: line, defined: true };
}

/**
 * Kinematic P (shortening) and T (extension) axes for a single fault, at 45° to
 * the fault plane in the movement plane. With unit normal n and unit slip s
 * (hanging-wall movement), P = (n − s)/√2 and T = (n + s)/√2.
 * @param {number[]} normal @param {number[]} slip
 * @returns {{ p: number[], t: number[] }} unit vectors
 */
export function ptAxes(normal, slip) {
  const n = vec3.normalize(normal);
  const s = vec3.normalize(slip);
  return { p: vec3.normalize(vec3.sub(n, s)), t: vec3.normalize(vec3.add(n, s)) };
}

// Solve a square linear system M x = b by Gaussian elimination (partial pivot).
function solveLinear(M, b) {
  const n = b.length;
  const A = M.map((row, i) => row.concat(b[i]));
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > Math.abs(A[piv][col])) piv = r;
    [A[col], A[piv]] = [A[piv], A[col]];
    const d = A[col][col];
    if (Math.abs(d) < 1e-300) continue;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / d;
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, i) => row[n] / A[i][i]);
}

/**
 * Linear paleostress inversion (Michael 1984) from fault data.
 * @param {Array<number[]>} planes - fault-plane normals (direction cosines)
 * @param {Array<number[]>} slips - slip vectors, one per plane
 * @returns {{ stress: number[], residual: number }}
 *   stress = flat row-major 3×3 deviatoric stress tensor; residual = ‖A·x − b‖².
 */
export function michael(planes, slips) {
  // Accumulate normal equations AᵀA (5×5), Aᵀb (5), and bᵀb for the residual.
  const AtA = Array.from({ length: 5 }, () => new Array(5).fill(0));
  const Atb = new Array(5).fill(0);
  let btb = 0;

  for (let i = 0; i < planes.length; i++) {
    const [n1, n2, n3] = planes[i];
    const s = slips[i];
    const rows = [
      [n1 - n1 ** 3 + n1 * n3 ** 2, n2 - 2 * n2 * n1 ** 2, n3 - 2 * n3 * n1 ** 2, -n1 * n2 ** 2 + n1 * n3 ** 2, -2 * n1 * n2 * n3],
      [-n2 * n1 ** 2 + n2 * n3 ** 2, n1 - 2 * n1 * n2 ** 2, -2 * n1 * n2 * n3, n2 - n2 ** 3 + n2 * n3 ** 2, n3 - 2 * n3 * n2 ** 2],
      [-n3 * n1 ** 2 - n3 + n3 ** 3, -2 * n1 * n2 * n3, n1 - 2 * n1 * n3 ** 2, -(n2 ** 2) * n3 - n3 + n3 ** 3, n2 - 2 * n2 * n3 ** 2],
    ];
    for (let k = 0; k < 3; k++) {
      const row = rows[k], bk = s[k];
      btb += bk * bk;
      for (let a = 0; a < 5; a++) {
        Atb[a] += row[a] * bk;
        for (let c = 0; c < 5; c++) AtA[a][c] += row[a] * row[c];
      }
    }
  }

  const x = solveLinear(AtA, Atb);
  // residual ‖Ax − b‖² = bᵀb − xᵀ(Aᵀb)
  let residual = btb;
  for (let a = 0; a < 5; a++) residual -= x[a] * Atb[a];

  const [s11, s12, s13, s22, s23] = x.map(v => -v);
  const stress = [s11, s12, s13, s12, s22, s23, s13, s23, -(s11 + s22)];
  return { stress, residual: Math.max(0, residual) };
}

/**
 * Principal stresses from a 3×3 stress tensor.
 * @param {number[]} stress - flat row-major symmetric 3×3
 * @returns {{ axes: number[][], values: number[] }}
 *   ordered [σ1 (most compressive), σ2, σ3 (most tensile)] per the inversion's
 *   sign convention; axes are unit eigenvectors.
 */
export function principalStresses(stress) {
  const { values, vectors } = symmetricEigen3(stress); // descending
  return { axes: [vectors[2], vectors[1], vectors[0]], values: [values[2], values[1], values[0]] };
}

/**
 * Angelier right-dihedra field on a projected grid, for P-T dihedra plots. Each
 * cell is the mean of 2·(node·normal)·(node·slip) over the faults: positive in
 * the shortening (P) dihedron, negative in the extension (T) dihedron; the zero
 * contour separates them. The return shape matches densityGrid, so it can be
 * fed to computeContours({ grid }) or a heatmap.
 *
 * @param {Array<number[]>} planes - fault-plane normals
 * @param {Array<number[]>} slips - slip vectors
 * @param {Object} [options] @param {string} [options.projection='equal-area'] @param {number} [options.gridSize=40]
 * @returns {{ grid: Float64Array, gridSize: number, step: number, projR: number, projection: string }}
 */
export function dihedraGrid(planes, slips, options = {}) {
  const projection = options.projection || 'equal-area';
  const gridSize = options.gridSize || 40;
  const projR = projection === 'equal-angle' ? 1 : Math.SQRT2;
  const step = 2 * projR / (gridSize - 1);
  const grid = new Float64Array(gridSize * gridSize);
  const inverseFn = projection === 'equal-angle' ? equalAngleInverse : equalAreaInverse;
  const m = planes.length || 1;

  for (let j = 0; j < gridSize; j++) {
    const py = projR - j * step;
    for (let i = 0; i < gridSize; i++) {
      const px = -projR + i * step;
      if (px * px + py * py > projR * projR * 1.02) { grid[j * gridSize + i] = NaN; continue; }
      const d = inverseFn(px, py);
      if (!d) { grid[j * gridSize + i] = NaN; continue; }
      let sum = 0;
      for (let k = 0; k < planes.length; k++) {
        const n = planes[k], s = slips[k];
        sum += 2 * (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) * (d[0] * s[0] + d[1] * s[1] + d[2] * s[2]);
      }
      grid[j * gridSize + i] = sum / m;
    }
  }
  return { grid, gridSize, step, projR, projection };
}
