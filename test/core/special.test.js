import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  gammaln, regularizedGammaP, chiSquareCDF, chiSquareSF,
  regularizedBetaI, fCDF, fSF,
} from '../../src/core/special.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) < tol, msg || `${a} ≈ ${b} (±${tol})`);

describe('gammaln', () => {
  it('matches known values', () => {
    close(gammaln(1), 0, 1e-9);                 // Γ(1)=1
    close(gammaln(2), 0, 1e-9);                 // Γ(2)=1
    close(gammaln(0.5), Math.log(Math.sqrt(Math.PI)), 1e-9); // Γ(½)=√π
    close(gammaln(5), Math.log(24), 1e-9);      // Γ(5)=4!=24
    close(gammaln(10), Math.log(362880), 1e-7); // Γ(10)=9!
  });
});

describe('chi-square distribution', () => {
  it('survival function matches standard critical values (p=0.05)', () => {
    close(chiSquareSF(3.8415, 1), 0.05, 1e-3);
    close(chiSquareSF(5.9915, 2), 0.05, 1e-3);
    close(chiSquareSF(7.8147, 3), 0.05, 1e-3);
    close(chiSquareSF(9.4877, 4), 0.05, 1e-3);
  });

  it('CDF + SF sum to 1 and CDF is monotonic', () => {
    for (const k of [1, 2, 5]) {
      close(chiSquareCDF(4, k) + chiSquareSF(4, k), 1, 1e-12);
      assert.ok(chiSquareCDF(2, k) <= chiSquareCDF(6, k));
    }
    assert.strictEqual(chiSquareCDF(0, 3), 0);
  });

  it('regularizedGammaP is in [0,1] and increasing in x', () => {
    assert.ok(regularizedGammaP(2, 1) < regularizedGammaP(2, 5));
    assert.ok(regularizedGammaP(3, 10) > 0 && regularizedGammaP(3, 10) < 1);
  });
});

describe('incomplete beta / F distribution', () => {
  it('regularizedBetaI endpoints and symmetry', () => {
    assert.strictEqual(regularizedBetaI(0, 2, 3), 0);
    assert.strictEqual(regularizedBetaI(1, 2, 3), 1);
    close(regularizedBetaI(0.5, 4, 4), 0.5, 1e-9);   // symmetric a=b
  });

  it('F survival matches standard 5% critical values', () => {
    close(fSF(4.103, 2, 10), 0.05, 2e-3);   // F_{0.05}(2,10) ≈ 4.103
    close(fSF(3.708, 3, 10), 0.05, 2e-3);   // F_{0.05}(3,10) ≈ 3.708
    close(fSF(2.901, 5, 15), 0.05, 2e-3);   // F_{0.05}(5,15) ≈ 2.901
  });

  it('F CDF at the median-ish point and monotonicity', () => {
    assert.ok(fCDF(1, 10, 10) > 0.4 && fCDF(1, 10, 10) < 0.6); // ~0.5 for d1=d2
    assert.ok(fCDF(2, 4, 20) < fCDF(5, 4, 20));
    close(fCDF(3, 3, 12) + fSF(3, 3, 12), 1, 1e-12);
  });
});
