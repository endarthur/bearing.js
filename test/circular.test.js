import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resultant, circularMean, circularVariance, circularStdDev,
  vonMisesKappa, rayleighTest,
} from '../src/circular.js';

const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) < tol, msg || `${a} ≈ ${b}`);

describe('circularMean / resultant', () => {
  it('averages across the 0/360 wrap', () => {
    close(circularMean([350, 10, 0]), 0, 1e-9);
    close(circularMean([10, 350]), 0, 1e-9);
  });

  it('mean of a tight cluster sits in the cluster', () => {
    const m = circularMean([88, 90, 92, 89, 91]);
    close(m, 90, 1e-6);
  });

  it('uniform data has Rbar ≈ 0', () => {
    const { Rbar } = resultant([0, 90, 180, 270]);
    close(Rbar, 0, 1e-9);
  });

  it('perfectly aligned data has Rbar = 1', () => {
    const { Rbar } = resultant([45, 45, 45]);
    close(Rbar, 1, 1e-9);
  });

  it('axial mode reinforces opposite directions', () => {
    // 10° and 190° are the same axis → strong axial resultant
    const { Rbar, mean } = resultant([10, 190], { axial: true });
    close(Rbar, 1, 1e-9);
    assert.ok(Math.abs(mean - 10) < 1e-6 || Math.abs(mean - 190) < 1e-6, `mean ${mean}`);
  });

  it('non-axial treatment of opposite directions cancels', () => {
    close(resultant([10, 190]).Rbar, 0, 1e-9);
  });
});

describe('dispersion measures', () => {
  it('variance is 1 − Rbar', () => {
    close(circularVariance([45, 45, 45]), 0, 1e-9);
    close(circularVariance([0, 90, 180, 270]), 1, 1e-9);
  });

  it('std dev grows with spread', () => {
    assert.ok(circularStdDev([88, 90, 92]) < circularStdDev([60, 90, 120]));
  });

  it('kappa is large for tight clusters and ~0 for uniform', () => {
    assert.ok(vonMisesKappa([89, 90, 91, 90]) > 20);
    close(vonMisesKappa([0, 90, 180, 270]), 0, 1e-6);
  });
});

describe('rayleighTest', () => {
  it('uniform data is not significant (large p)', () => {
    assert.ok(rayleighTest([0, 45, 90, 135, 180, 225, 270, 315]).p > 0.5);
  });

  it('a tight cluster is highly significant (tiny p)', () => {
    const { p } = rayleighTest([88, 90, 92, 89, 91, 90, 93, 87]);
    assert.ok(p < 0.001, `p = ${p}`);
  });

  it('p is clamped to [0,1]', () => {
    const { p } = rayleighTest([10, 12, 11]);
    assert.ok(p >= 0 && p <= 1);
  });
});
