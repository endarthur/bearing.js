import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  resultant, meanVector, fisherStats,
  orientationTensor, principalAxes,
  confidenceCone, confidenceEllipse,
  uniformityTest, commonMeanTest,
  bootstrapMeanConfidence, bootstrapEigenvectorConfidence,
} from '../src/statistics.js';

// Deterministic RNG (mulberry32) for bootstrap tests.
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
import { planeToDcos, lineToDcos } from '../src/core/conversions.js';
import * as vec3 from '../src/core/vec3.js';

const DEG = Math.PI / 180;
const EPSILON = 1e-8;

function assertClose(a, b, msg, tol = EPSILON) {
  assert.ok(Math.abs(a - b) < tol, `${msg}: ${a} ≈ ${b} (diff ${Math.abs(a - b)})`);
}

// ---------------------------------------------------------------------------
//  Test data
// ---------------------------------------------------------------------------

// Tight cluster around nadir [0, 0, -1]  (high plunge ≈ straight down)
const cluster = [
  lineToDcos(0, 85),
  lineToDcos(90, 87),
  lineToDcos(180, 86),
  lineToDcos(270, 88),
  lineToDcos(45, 89),
  lineToDcos(135, 86),
  lineToDcos(225, 87),
  lineToDcos(315, 88),
];

// Girdle along the N–S vertical plane (dd = 90 or 270, varying dip)
const girdle = [];
for (let dip = 10; dip <= 80; dip += 10) {
  girdle.push(planeToDcos(90, dip));
  girdle.push(planeToDcos(270, dip));
}

// Single vector
const single = [planeToDcos(120, 45)];

// ---------------------------------------------------------------------------
//  resultant / meanVector
// ---------------------------------------------------------------------------

describe('resultant', () => {
  it('single vector returns itself', () => {
    const r = resultant(single);
    for (let i = 0; i < 3; i++) assertClose(r[i], single[0][i], `component ${i}`);
  });

  it('opposite vectors cancel', () => {
    const d = planeToDcos(0, 45);
    const neg = vec3.negate(d);
    const r = resultant([d, neg]);
    for (let i = 0; i < 3; i++) assertClose(r[i], 0, `component ${i}`);
  });
});

describe('meanVector', () => {
  it('single vector → same direction', () => {
    const m = meanVector(single);
    const len = vec3.length(m);
    assertClose(len, 1, 'unit length');
    for (let i = 0; i < 3; i++) {
      assertClose(m[i], single[0][i], `component ${i}`, 1e-6);
    }
  });

  it('symmetric cluster around nadir → near nadir', () => {
    const m = meanVector(cluster);
    assert.ok(m[2] < -0.95, `z should be near -1: ${m[2]}`);
  });
});

// ---------------------------------------------------------------------------
//  Fisher statistics
// ---------------------------------------------------------------------------

describe('fisherStats', () => {
  it('n equals sample size', () => {
    const f = fisherStats(cluster);
    assert.strictEqual(f.n, cluster.length);
  });

  it('R ≤ n', () => {
    const f = fisherStats(cluster);
    assert.ok(f.R <= f.n + EPSILON);
  });

  it('tight cluster has high kappa', () => {
    const f = fisherStats(cluster);
    assert.ok(f.kappa > 50, `kappa should be large: ${f.kappa}`);
  });

  it('tight cluster has small alpha95', () => {
    const f = fisherStats(cluster);
    assert.ok(f.alpha95 < 10, `alpha95 should be small: ${f.alpha95}`);
  });

  it('dispersed data has lower kappa than tight cluster', () => {
    const dispersed = [];
    for (let dd = 0; dd < 360; dd += 30) {
      dispersed.push(planeToDcos(dd, 45));
    }
    const fTight = fisherStats(cluster);
    const fDisp = fisherStats(dispersed);
    assert.ok(fDisp.kappa < fTight.kappa,
      `dispersed κ=${fDisp.kappa} < tight κ=${fTight.kappa}`);
  });

  it('mean direction is a unit vector', () => {
    const f = fisherStats(cluster);
    assertClose(vec3.length(f.mean), 1, 'unit mean');
  });

  it('single observation has infinite kappa', () => {
    const f = fisherStats(single);
    assert.strictEqual(f.kappa, Infinity);
  });

  it('Rbar in [0, 1]', () => {
    const f = fisherStats(cluster);
    assert.ok(f.Rbar >= -EPSILON && f.Rbar <= 1 + EPSILON);
  });
});

// ---------------------------------------------------------------------------
//  Orientation tensor
// ---------------------------------------------------------------------------

describe('orientationTensor', () => {
  it('is symmetric', () => {
    const T = orientationTensor(cluster);
    assertClose(T[1], T[3], 'T01 = T10');
    assertClose(T[2], T[6], 'T02 = T20');
    assertClose(T[5], T[7], 'T12 = T21');
  });

  it('trace = 1 (normalised)', () => {
    const T = orientationTensor(cluster);
    assertClose(T[0] + T[4] + T[8], 1, 'trace');
  });

  it('single downward vector → T[2][2] = 1', () => {
    const T = orientationTensor([[0, 0, -1]]);
    assertClose(T[8], 1, 'T22');
    assertClose(T[0], 0, 'T00');
    assertClose(T[4], 0, 'T11');
  });
});

// ---------------------------------------------------------------------------
//  Principal axes
// ---------------------------------------------------------------------------

describe('principalAxes', () => {
  it('eigenvalues sum to 1', () => {
    const { eigenvalues } = principalAxes(cluster);
    assertClose(eigenvalues[0] + eigenvalues[1] + eigenvalues[2], 1, 'sum');
  });

  it('eigenvalues are in descending order', () => {
    const { eigenvalues } = principalAxes(cluster);
    assert.ok(eigenvalues[0] >= eigenvalues[1] - EPSILON);
    assert.ok(eigenvalues[1] >= eigenvalues[2] - EPSILON);
  });

  it('eigenvectors are unit length', () => {
    const { eigenvectors } = principalAxes(cluster);
    for (const v of eigenvectors) {
      assertClose(vec3.length(v), 1, 'unit eigenvector');
    }
  });

  it('eigenvectors are in lower hemisphere (z ≤ 0)', () => {
    const { eigenvectors } = principalAxes(cluster);
    for (const v of eigenvectors) {
      assert.ok(v[2] <= EPSILON, `z should be ≤ 0: ${v[2]}`);
    }
  });

  it('eigenvectors are mutually orthogonal', () => {
    const { eigenvectors: [v1, v2, v3] } = principalAxes(cluster);
    assertClose(vec3.dot(v1, v2), 0, 'v1·v2', 1e-6);
    assertClose(vec3.dot(v1, v3), 0, 'v1·v3', 1e-6);
    assertClose(vec3.dot(v2, v3), 0, 'v2·v3', 1e-6);
  });

  it('tight cluster: S1 dominates', () => {
    const { eigenvalues } = principalAxes(cluster);
    assert.ok(eigenvalues[0] > 0.9, `S1 should dominate: ${eigenvalues[0]}`);
  });

  it('tight cluster: V1 near mean direction', () => {
    const { eigenvectors } = principalAxes(cluster);
    const mean = meanVector(cluster);
    const dot = Math.abs(vec3.dot(eigenvectors[0], mean));
    assert.ok(dot > 0.99, `V1 should be near mean: |dot| = ${dot}`);
  });

  it('girdle: S1 ≈ S2 >> S3', () => {
    const { eigenvalues } = principalAxes(girdle);
    const ratio12 = eigenvalues[0] / eigenvalues[1];
    assert.ok(ratio12 < 2, `S1/S2 should be modest: ${ratio12}`);
    assert.ok(eigenvalues[1] > 3 * eigenvalues[2],
      `S2 should be >> S3: ${eigenvalues[1]} vs ${eigenvalues[2]}`);
  });

  it('girdle: V3 is pole to the girdle plane', () => {
    // Girdle is in the E–W vertical plane → pole should be N or S ([0, ±1, 0])
    const { eigenvectors } = principalAxes(girdle);
    const v3 = eigenvectors[2];
    const yComponent = Math.abs(v3[1]);
    assert.ok(yComponent > 0.9,
      `V3 should be near ±[0,1,0]: y=${v3[1]}, full=${v3}`);
  });

  it('Woodcock K > 1 for cluster', () => {
    const { K } = principalAxes(cluster);
    assert.ok(K > 1, `K should be > 1 for cluster: ${K}`);
  });

  it('Woodcock K < 1 for girdle', () => {
    const { K } = principalAxes(girdle);
    assert.ok(K < 1, `K should be < 1 for girdle: ${K}`);
  });

  it('Woodcock C > 0', () => {
    const { C } = principalAxes(cluster);
    assert.ok(C > 0, `C should be positive: ${C}`);
  });

  it('Vollmer P + G + R ≈ 1', () => {
    const { P, G, R } = principalAxes(cluster);
    assertClose(P + G + R, 1, 'P+G+R');
  });

  it('Vollmer P dominates for cluster', () => {
    const { P, G, R } = principalAxes(cluster);
    assert.ok(P > G && P > R, `P should dominate for cluster: P=${P}, G=${G}, R=${R}`);
  });

  it('Vollmer G dominates for girdle', () => {
    const { P, G, R } = principalAxes(girdle);
    assert.ok(G > P && G > R, `G should dominate for girdle: P=${P}, G=${G}, R=${R}`);
  });

  it('Vollmer parameters are non-negative', () => {
    const { P, G, R } = principalAxes(cluster);
    assert.ok(P >= -EPSILON, `P >= 0: ${P}`);
    assert.ok(G >= -EPSILON, `G >= 0: ${G}`);
    assert.ok(R >= -EPSILON, `R >= 0: ${R}`);
  });

  it('Bingham kappa1 and kappa2 are non-positive', () => {
    const { kappa1, kappa2 } = principalAxes(cluster);
    assert.ok(kappa1 <= EPSILON, `kappa1 <= 0: ${kappa1}`);
    assert.ok(kappa2 <= EPSILON, `kappa2 <= 0: ${kappa2}`);
  });

  it('Bingham kappa2 <= kappa1 (more negative = more concentrated)', () => {
    const { kappa1, kappa2 } = principalAxes(cluster);
    assert.ok(kappa2 <= kappa1 + EPSILON, `kappa2=${kappa2} <= kappa1=${kappa1}`);
  });

  it('Bingham kappas near zero for uniform data', () => {
    // Roughly uniform: 3 orthogonal directions
    const uniform = [
      lineToDcos(0, 0), lineToDcos(90, 0), lineToDcos(0, 90),
    ];
    const { kappa1, kappa2 } = principalAxes(uniform);
    // With only 3 orthogonal vectors, eigenvalues are ~1/3 each, so kappas ≈ 0
    assertClose(kappa1, 0, 'kappa1 near 0 for uniform', 0.5);
    assertClose(kappa2, 0, 'kappa2 near 0 for uniform', 0.5);
  });
});

const adot = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);

describe('confidenceCone', () => {
  const cluster = [];
  for (let t = 0; t < 360; t += 30) cluster.push(lineToDcos(t, 75));

  it('halfAngle equals alpha95 at confidence 0.95', () => {
    const { alpha95 } = fisherStats(cluster);
    assertClose(confidenceCone(cluster, 0.95).halfAngle, alpha95, 'cone == alpha95', 1e-9);
  });

  it('higher confidence gives a wider cone', () => {
    assert.ok(confidenceCone(cluster, 0.99).halfAngle > confidenceCone(cluster, 0.95).halfAngle);
  });

  it('returns the mean as [trend, plunge]', () => {
    const { mean } = confidenceCone(cluster);
    assert.strictEqual(mean.length, 2);
  });
});

describe('confidenceEllipse', () => {
  // A cluster spread unevenly about ~120/40 so the ellipse is non-circular.
  const cluster = [];
  for (let i = 0; i < 49; i++) {
    cluster.push(lineToDcos(120 + ((i % 7) - 3) * 4, 40 + (Math.floor(i / 7) - 3) * 2));
  }

  it('a >= b and both are positive', () => {
    const e = confidenceEllipse(cluster);
    assert.ok(e.a >= e.b, `a(${e.a}) >= b(${e.b})`);
    assert.ok(e.b > 0);
  });

  it('centres on V1 for about:max (cluster mean)', () => {
    const { eigenvectors } = principalAxes(cluster);
    const e = confidenceEllipse(cluster, { about: 'max' });
    assertClose(adot(e.centerDir, eigenvectors[0]), 1, 'centre == V1', 1e-9);
  });

  it('centres on V3 for about:min (girdle pole)', () => {
    const { eigenvectors } = principalAxes(cluster);
    const e = confidenceEllipse(cluster, { about: 'min' });
    assertClose(adot(e.centerDir, eigenvectors[2]), 1, 'centre == V3', 1e-9);
  });

  it('shrinks as sample size grows (∝ 1/√N)', () => {
    const small = confidenceEllipse(cluster);
    const big = confidenceEllipse(cluster.concat(cluster, cluster, cluster)); // 4× data, same tensor
    assert.ok(big.a < small.a, `big a(${big.a}) < small a(${small.a})`);
    assertClose(big.a, small.a / 2, '4× sample halves the semi-axis', small.a * 0.05);
  });

  it('higher confidence widens the ellipse', () => {
    assert.ok(
      confidenceEllipse(cluster, { confidence: 0.99 }).a >
      confidenceEllipse(cluster, { confidence: 0.95 }).a,
    );
  });
});

describe('uniformityTest', () => {
  // Approximately uniform axial sample via a Fibonacci sphere (folded to lower hemisphere).
  const fibonacci = (N) => {
    const ga = Math.PI * (3 - Math.sqrt(5));
    const out = [];
    for (let i = 0; i < N; i++) {
      const z = 1 - 2 * (i + 0.5) / N;
      const r = Math.sqrt(Math.max(0, 1 - z * z));
      const phi = i * ga;
      let v = [r * Math.cos(phi), r * Math.sin(phi), z];
      if (v[2] > 0) v = [-v[0], -v[1], -v[2]]; // fold to lower hemisphere (axial)
      out.push(v);
    }
    return out;
  };

  it('a tight cluster rejects uniformity (tiny p)', () => {
    const cluster = [];
    for (let i = 0; i < 30; i++) cluster.push(lineToDcos(120 + (i % 5 - 2), 40 + (i % 3 - 1)));
    assert.ok(uniformityTest(cluster).p < 0.001, `p = ${uniformityTest(cluster).p}`);
  });

  it('a girdle also rejects uniformity', () => {
    const girdle = [];
    for (let dd = 0; dd < 360; dd += 10) girdle.push(planeToDcos(dd, 90)); // poles on a great circle
    assert.ok(uniformityTest(girdle).p < 0.01, `p = ${uniformityTest(girdle).p}`);
  });

  it('a near-uniform sample does not reject (large p)', () => {
    assert.ok(uniformityTest(fibonacci(400)).p > 0.05, `p = ${uniformityTest(fibonacci(400)).p}`);
  });

  it('reports eigenvalues and 5 degrees of freedom', () => {
    const t = uniformityTest(fibonacci(50));
    assert.strictEqual(t.df, 5);
    assert.strictEqual(t.eigenvalues.length, 3);
  });
});

describe('commonMeanTest', () => {
  const clusterAround = (trend, plunge, n) => {
    const out = [];
    for (let i = 0; i < n; i++) out.push(lineToDcos(trend + (i % 5 - 2) * 2, plunge + (Math.floor(i / 5) % 5 - 2) * 2));
    return out;
  };

  it('two samples from the same mean are not distinguished (large p)', () => {
    const a = clusterAround(120, 40, 25);
    const b = clusterAround(121, 41, 25);
    assert.ok(commonMeanTest(a, b).p > 0.05, `p = ${commonMeanTest(a, b).p}`);
  });

  it('two samples from clearly different means are distinguished (tiny p)', () => {
    const a = clusterAround(120, 40, 25);
    const b = clusterAround(200, 50, 25);
    assert.ok(commonMeanTest(a, b).p < 0.01, `p = ${commonMeanTest(a, b).p}`);
  });

  it('reports F and degrees of freedom (2, 2(N-2))', () => {
    const a = clusterAround(120, 40, 10);
    const b = clusterAround(121, 41, 10);
    const r = commonMeanTest(a, b);
    assert.strictEqual(r.df1, 2);
    assert.strictEqual(r.df2, 2 * (20 - 2));
  });
});

describe('bootstrap confidence regions', () => {
  const cluster = (trend, plunge, n, spread = 6) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      out.push(lineToDcos(trend + ((i % 7) - 3) * spread / 3, plunge + (Math.floor(i / 7) % 7 - 3) * spread / 3));
    }
    return out;
  };

  it('bootstrap mean cone is deterministic with a seeded rng', () => {
    const data = cluster(120, 40, 30);
    const r1 = bootstrapMeanConfidence(data, { rng: seeded(42), iterations: 300 });
    const r2 = bootstrapMeanConfidence(data, { rng: seeded(42), iterations: 300 });
    assert.strictEqual(r1.halfAngle, r2.halfAngle);
  });

  it('mean cone shrinks with more data', () => {
    const small = bootstrapMeanConfidence(cluster(120, 40, 12), { rng: seeded(1), iterations: 400 });
    const big = bootstrapMeanConfidence(cluster(120, 40, 120), { rng: seeded(1), iterations: 400 });
    assert.ok(big.halfAngle < small.halfAngle, `big ${big.halfAngle} < small ${small.halfAngle}`);
  });

  it('mean cone widens with higher confidence', () => {
    const data = cluster(120, 40, 40);
    const c95 = bootstrapMeanConfidence(data, { rng: seeded(7), confidence: 0.95, iterations: 500 });
    const c99 = bootstrapMeanConfidence(data, { rng: seeded(7), confidence: 0.99, iterations: 500 });
    assert.ok(c99.halfAngle >= c95.halfAngle);
  });

  it('bootstrap ellipse: a ≥ b > 0, centred on the eigenvector, feeds Stereonet.ellipse', () => {
    const data = cluster(120, 40, 50);
    const e = bootstrapEigenvectorConfidence(data, { rng: seeded(3), iterations: 400 });
    assert.ok(e.a >= e.b && e.b > 0);
    const { eigenvectors } = principalAxes(data);
    const adot = Math.abs(e.centerDir[0] * eigenvectors[0][0] + e.centerDir[1] * eigenvectors[0][1] + e.centerDir[2] * eigenvectors[0][2]);
    assertClose(adot, 1, 'centre == V1', 1e-9);
    assert.ok(Array.isArray(e.majorDir) && e.majorDir.length === 3);
  });
});
