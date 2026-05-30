/**
 * @module fabricplot — Diagnostic fabric plots (Woodcock, Vollmer ternary).
 *
 * Plots the orientation-tensor eigenvalue parameters that statistics already
 * computes, as standalone SVG diagrams (not stereonets). Each "dataset" is a set
 * of direction cosines; pass one set or several to overlay points.
 */

import { principalAxes } from './statistics.js';
import { SvgBuilder } from './render/svg.js';

// Accept a single dcos array or an array of { dcos, color?, label? }.
function asDatasets(input) {
  if (input.length && Array.isArray(input[0]) && typeof input[0][0] === 'number') {
    return [{ dcos: input }];
  }
  return input;
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Woodcock coordinates for a fabric: x = ln(S2/S3) (girdle axis),
 * y = ln(S1/S2) (cluster axis); K = y/x (shape), C = x+y = ln(S1/S3) (strength).
 * @param {Array<number[]>} dcos
 * @returns {{ x:number, y:number, K:number, C:number, eigenvalues:number[] }}
 */
export function woodcockPoint(dcos) {
  const { eigenvalues } = principalAxes(dcos);
  const [s1, s2, s3] = eigenvalues;
  const x = Math.log(s2 / s3);
  const y = Math.log(s1 / s2);
  return { x, y, K: x !== 0 ? y / x : Infinity, C: x + y, eigenvalues };
}

/**
 * Woodcock K–C plot as an SVG string. The diagonal is K=1 (cluster above,
 * girdle below); distance from the origin is fabric strength C.
 * @param {Array<number[]>|Array<{dcos:Array<number[]>,color?:string,label?:string}>} datasets
 * @param {Object} [options] @param {number} [options.size=320] @param {number} [options.max=7]
 * @returns {string} SVG
 */
export function woodcockSVG(datasets, options = {}) {
  const size = options.size || 320;
  const pad = options.padding ?? 44;
  const max = options.max || 7;
  const plot = size - 2 * pad;
  const sx = (v) => pad + (v / max) * plot;
  const sy = (v) => size - pad - (v / max) * plot;
  const svg = new SvgBuilder(size, size);

  svg.rect(pad, pad, plot, plot, { fill: options.background || 'none', stroke: '#999', 'stroke-width': 1 });
  svg.line(sx(0), sy(0), sx(max), sy(max), { stroke: '#bbb', 'stroke-width': 1, 'stroke-dasharray': '4,3' }); // K=1
  svg.text(sx(max) - 4, sy(max) + 12, 'K=1', { fill: '#888', 'font-size': 10, 'text-anchor': 'end' });
  svg.text(pad + plot / 2, size - 10, 'ln(S2/S3)  — girdle →', { fill: '#555', 'font-size': 11, 'text-anchor': 'middle' });
  svg.text(14, pad + plot / 2, 'ln(S1/S2)  — cluster →', { fill: '#555', 'font-size': 11, 'text-anchor': 'middle', transform: `rotate(-90 14 ${pad + plot / 2})` });

  for (const ds of asDatasets(datasets)) {
    const p = woodcockPoint(ds.dcos);
    svg.circle(sx(Math.min(max, p.x)), sy(Math.min(max, p.y)), 4, { fill: ds.color || '#e8920c', stroke: '#333', 'stroke-width': 0.7 });
    if (ds.label) svg.text(sx(Math.min(max, p.x)) + 7, sy(Math.min(max, p.y)) + 3, ds.label, { fill: '#333', 'font-size': 10 });
  }
  return svg.toString();
}

/**
 * Vollmer indices for a fabric: P = S1−S2 (point), G = 2(S2−S3) (girdle),
 * R = 3·S3 (random); P+G+R = 1.
 * @param {Array<number[]>} dcos
 * @returns {{ P:number, G:number, R:number }}
 */
export function vollmerPoint(dcos) {
  const [s1, s2, s3] = principalAxes(dcos).eigenvalues;
  return { P: s1 - s2, G: 2 * (s2 - s3), R: 3 * s3 };
}

/**
 * Vollmer P–G–R ternary diagram as an SVG string. Corners: P (top, point),
 * G (bottom-left, girdle), R (bottom-right, random).
 * @param {Array<number[]>|Array<{dcos,color?,label?}>} datasets
 * @param {Object} [options] @param {number} [options.size=320]
 * @returns {string} SVG
 */
export function vollmerSVG(datasets, options = {}) {
  const size = options.size || 320;
  const pad = options.padding ?? 36;
  const side = size - 2 * pad;
  const h = side * Math.sqrt(3) / 2;
  const yTop = pad + (side - h) / 2;
  const P = [size / 2, yTop];                    // top
  const G = [pad, yTop + h];                     // bottom-left
  const R = [size - pad, yTop + h];              // bottom-right
  const svg = new SvgBuilder(size, size);

  svg.path(`M${r2(P[0])},${r2(P[1])}L${r2(G[0])},${r2(G[1])}L${r2(R[0])},${r2(R[1])}Z`,
    { fill: options.background || 'none', stroke: '#999', 'stroke-width': 1 });
  svg.text(P[0], P[1] - 8, 'P', { fill: '#555', 'font-size': 12, 'text-anchor': 'middle' });
  svg.text(G[0] - 4, G[1] + 14, 'G', { fill: '#555', 'font-size': 12, 'text-anchor': 'middle' });
  svg.text(R[0] + 4, R[1] + 14, 'R', { fill: '#555', 'font-size': 12, 'text-anchor': 'middle' });

  for (const ds of asDatasets(datasets)) {
    const { P: p, G: g, R: r } = vollmerPoint(ds.dcos);
    const x = p * P[0] + g * G[0] + r * R[0];
    const y = p * P[1] + g * G[1] + r * R[1];
    svg.circle(x, y, 4, { fill: ds.color || '#1aa39a', stroke: '#333', 'stroke-width': 0.7 });
    if (ds.label) svg.text(x + 7, y + 3, ds.label, { fill: '#333', 'font-size': 10 });
  }
  return svg.toString();
}
