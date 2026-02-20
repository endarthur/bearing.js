import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { symmetricEigen3 } from '../../src/core/eigen.js';

const EPSILON = 1e-10;

function assertClose(a, b, msg, tol = EPSILON) {
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} ≈ ${b}`);
}

describe('symmetricEigen3', () => {
  it('identity matrix → eigenvalues [1,1,1]', () => {
    const { values } = symmetricEigen3([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    for (const v of values) assertClose(v, 1, 'eigenvalue');
  });

  it('diagonal matrix → sorted eigenvalues', () => {
    const { values, vectors } = symmetricEigen3([3, 0, 0, 0, 1, 0, 0, 0, 2]);
    assertClose(values[0], 3, 'S1');
    assertClose(values[1], 2, 'S2');
    assertClose(values[2], 1, 'S3');
  });

  it('eigenvectors are unit length', () => {
    const { vectors } = symmetricEigen3([4, 1, 0, 1, 3, 0.5, 0, 0.5, 2]);
    for (const v of vectors) {
      const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
      assertClose(len, 1, 'unit eigenvector');
    }
  });

  it('eigenvectors are mutually orthogonal', () => {
    const { vectors } = symmetricEigen3([4, 1, 0.5, 1, 3, 0.5, 0.5, 0.5, 2]);
    const [v1, v2, v3] = vectors;
    const dot12 = v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2];
    const dot13 = v1[0] * v3[0] + v1[1] * v3[1] + v1[2] * v3[2];
    const dot23 = v2[0] * v3[0] + v2[1] * v3[1] + v2[2] * v3[2];
    assertClose(dot12, 0, 'v1·v2');
    assertClose(dot13, 0, 'v1·v3');
    assertClose(dot23, 0, 'v2·v3');
  });

  it('A * v = λ * v for each eigenpair', () => {
    const m = [5, 2, 1, 2, 3, 0.5, 1, 0.5, 1];
    const { values, vectors } = symmetricEigen3(m);

    for (let k = 0; k < 3; k++) {
      const v = vectors[k];
      const lam = values[k];
      // A * v
      const Av = [
        m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
        m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
        m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
      ];
      for (let i = 0; i < 3; i++) {
        assertClose(Av[i], lam * v[i], `Av[${i}] = λv[${i}] for k=${k}`);
      }
    }
  });

  it('trace preserved (sum of eigenvalues = trace)', () => {
    const m = [6, 1, 2, 1, 4, 0.5, 2, 0.5, 3];
    const { values } = symmetricEigen3(m);
    const trace = m[0] + m[4] + m[8];
    assertClose(values[0] + values[1] + values[2], trace, 'trace');
  });

  it('degenerate eigenvalues (two equal)', () => {
    // diag(3, 3, 1) — two equal eigenvalues
    const { values } = symmetricEigen3([3, 0, 0, 0, 3, 0, 0, 0, 1]);
    assertClose(values[0], 3, 'S1');
    assertClose(values[1], 3, 'S2');
    assertClose(values[2], 1, 'S3');
  });

  it('zero matrix', () => {
    const { values } = symmetricEigen3([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    for (const v of values) assertClose(v, 0, 'zero eigenvalue');
  });

  it('negative eigenvalues sorted correctly', () => {
    const { values } = symmetricEigen3([1, 0, 0, 0, -2, 0, 0, 0, -5]);
    assertClose(values[0], 1, 'S1');
    assertClose(values[1], -2, 'S2');
    assertClose(values[2], -5, 'S3');
  });
});
