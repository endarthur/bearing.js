/**
 * @module fault — Fault-slip kinematics and paleostress.
 *
 * Faults are given as (plane normal, slip vector) pairs of direction cosines.
 * Provides slip-sense resolution, kinematic P/T axes, the Angelier right-dihedra
 * field (for P-T dihedra plots), and the Michael (1984) linear paleostress
 * inversion. Inversion/dihedra ported from the author's `auttitude` library.
 *
 * THE CONVENTION (every function here): x = East, y = North, z = Up. A fault is
 * (pole, slip) where `slip` is the motion of the HANGING WALL — the block above
 * the plane, i.e. the block the UPWARD normal points into. The sign of the pole
 * you pass does not matter: each function turns it upward itself (`upwardNormal`).
 * A vertical plane has no block "above"; there the hanging wall is the block on
 * the side of the canonical upward normal (+x/+y side by `upwardNormal`'s
 * tie-break), and `resolveSense` resolves senses against the same normal, so the
 * pair it returns is consistent with ptAxes / michael / dihedraGrid.
 *
 * principalStresses returns axes ordered [σ1 (most compressive), σ2, σ3 (most
 * tensile)]. Checked against known geology in test/geology.test.js: normal
 * faults give P / σ1 steep and T / σ3 horizontal, thrusts the reverse, a dextral
 * E–W fault P NE–SW.
 */

import * as vec3 from './core/vec3.js';
import { symmetricEigen3 } from './core/eigen.js';
import { inverse as equalAreaInverse } from './projections/equal-area.js';
import { inverse as equalAngleInverse } from './projections/equal-angle.js';

const EPS = 1e-9;

/**
 * The plane's normal pointing UP, into the hanging wall. For a vertical plane
 * (no up) the tie-break is the +x side, then +y — so a plane's two poles always
 * give the same answer.
 * @param {number[]} normal - either pole of the plane
 * @returns {number[]} unit upward normal
 */
export function upwardNormal(normal) {
  const n = vec3.normalize(normal);
  if (n[2] > EPS) return n;
  if (n[2] < -EPS) return vec3.negate(n);
  if (n[0] > EPS || (Math.abs(n[0]) <= EPS && n[1] > 0)) return [n[0], n[1], 0];
  return [-n[0], -n[1], 0];
}

/**
 * Right-hand-rule strike direction of a plane (horizontal; the plane dips to its
 * right). For a vertical plane, the strike that has the upwardNormal side on its
 * right.
 * @param {number[]} normal - either pole of the plane
 * @returns {number[]} unit horizontal vector ([0,1,0] for a horizontal plane)
 */
export function strikeVector(normal) {
  const u = upwardNormal(normal);
  const h = Math.hypot(u[0], u[1]);
  return h < EPS ? [0, 1, 0] : [-u[1] / h, u[0] / h, 0];
}

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

// sense codes → kind. The single-character set is OpenStereo's (0.1 / 3.0); whole words first, so
// "right-lateral" is dextral and not R(everse).
const SENSE_WORDS = [
  [/^(normal)\b/, 'normal'], [/^(reverse|inverse|thrust)\b/, 'reverse'],
  [/^(dextral|right[- ]?lateral)\b/, 'dextral'], [/^(sinistral|left[- ]?lateral)\b/, 'sinistral'],
  [/^(unknown|undefined)\b/, null],
];
const SENSE_CHARS = {
  n: 'normal', 2: 'normal', '-': 'normal',
  i: 'reverse', r: 'reverse', 1: 'reverse', '+': 'reverse',
  d: 'dextral', 3: 'dextral',
  s: 'sinistral', l: 'sinistral', 4: 'sinistral',
};
function senseKind(sense) {
  const str = sense == null ? '' : String(sense).trim().toLowerCase();
  for (const [re, kind] of SENSE_WORDS) if (re.test(str)) return kind;
  return str.length === 1 ? (SENSE_CHARS[str] || null) : null;   // u f 0 5 ? '' and anything else → unknown
}

/**
 * Resolve a slickenline into the HANGING-WALL slip vector from a sense code.
 * Codes (case-insensitive; OpenStereo's set):
 *   normal    N 2 −  ("normal")                  hanging wall down
 *   reverse   I R 1 +  ("reverse", "inverse", "thrust")   hanging wall up
 *   dextral   D 3  ("dextral", "right-lateral")  hanging-wall slip · strike < 0
 *   sinistral S L 4  ("sinistral", "left-lateral") hanging-wall slip · strike > 0
 *   unknown   U F 0 5 ? '' — and any code not above → { slip: line, defined: false }
 * Strike is the right-hand-rule strike (`strikeVector`); dextral / sinistral are
 * resolved against it, not against the dip vector (which is ⟂ to the slip on a
 * strike-slip fault, so its sign would flip with a degree of plunge).
 * @param {number[]} normal - fault-plane pole (either sign)
 * @param {number[]} line - slickenline direction (either sign)
 * @param {string|number} sense
 * @returns {{ slip: number[], defined: boolean }}
 */
export function resolveSense(normal, line, sense) {
  const kind = senseKind(sense);
  if (!kind) return { slip: line, defined: false };
  const l = vec3.normalize(line);
  if (kind === 'normal') return { slip: l[2] <= 0 ? l : vec3.negate(l), defined: true };
  if (kind === 'reverse') return { slip: l[2] >= 0 ? l : vec3.negate(l), defined: true };
  const along = vec3.dot(strikeVector(normal), l);
  if (kind === 'dextral') return { slip: along < 0 ? l : vec3.negate(l), defined: true };   // a tie (no strike component) resolves opposite to sinistral
  return { slip: along >= 0 ? l : vec3.negate(l), defined: true };   // sinistral
}

/**
 * Kinematic P (shortening) and T (extension) axes for a single fault, at 45° to
 * the fault plane in the movement plane (Marrett & Allmendinger 1990). With n the
 * UPWARD unit normal (into the hanging wall) and s the unit hanging-wall slip,
 * P = (n − s)/√2 and T = (n + s)/√2. Either pole may be passed.
 * @param {number[]} normal @param {number[]} slip
 * @returns {{ p: number[], t: number[] }} unit vectors
 */
export function ptAxes(normal, slip) {
  const n = upwardNormal(normal);
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
 * @param {Array<number[]>} planes - fault-plane poles (either sign)
 * @param {Array<number[]>} slips - hanging-wall slip vectors, one per plane
 * @returns {{ stress: number[], residual: number }}
 *   stress = flat row-major 3×3 deviatoric stress tensor; residual = ‖A·x − b‖².
 */
export function michael(planes, slips) {
  // Accumulate normal equations AᵀA (5×5), Aᵀb (5), and bᵀb for the residual.
  const AtA = Array.from({ length: 5 }, () => new Array(5).fill(0));
  const Atb = new Array(5).fill(0);
  let btb = 0;

  for (let i = 0; i < planes.length; i++) {
    const [n1, n2, n3] = vec3.negate(upwardNormal(planes[i]));   // the downward pole, whichever was passed
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

// A grid node in the band just outside the primitive (the 1.02 allowance) is evaluated at its TRUE
// direction: both inverse formulas carry on past the rim into the upper hemisphere, and for axial data
// (Kamb and Fisher kernels, the dihedra field) that equals the value at the diametrically opposite point
// inside the net. So a contour reaching the circle continues from the opposite side, as Tocher (1979)
// required of contoured fabric diagrams, instead of stopping at the rim. (The net clips what lies past it.)
function rimInverse(inverseFn, px, py, projR) {
  const r2 = px * px + py * py, R2 = projR * projR;
  if (r2 <= R2) return inverseFn(px, py);
  if (projR > 1) {                                   // equal-area (R = √2): z = r²/2 − 1, valid to r² = 4
    if (r2 >= 4) return null;
    const s = Math.sqrt(1 - r2 / 4);
    return [px * s, py * s, r2 / 2 - 1];
  }
  const d = 1 + r2;                                  // equal-angle (R = 1): the stereographic inverse, any r
  return [2 * px / d, 2 * py / d, (r2 - 1) / d];
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
  const downPoles = planes.map((p) => vec3.negate(upwardNormal(p)));   // the field's sign is for downward poles

  for (let j = 0; j < gridSize; j++) {
    const py = projR - j * step;
    for (let i = 0; i < gridSize; i++) {
      const px = -projR + i * step;
      if (px * px + py * py > Math.max(projR * projR * 1.02, (projR + 1.5 * step) ** 2)) { grid[j * gridSize + i] = NaN; continue; }
      const d = rimInverse(inverseFn, px, py, projR);
      if (!d) { grid[j * gridSize + i] = NaN; continue; }
      let sum = 0;
      for (let k = 0; k < planes.length; k++) {
        const n = downPoles[k], s = slips[k];
        sum += 2 * (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) * (d[0] * s[0] + d[1] * s[1] + d[2] * s[2]);
      }
      grid[j * gridSize + i] = sum / m;
    }
  }
  return { grid, gridSize, step, projR, projection };
}
