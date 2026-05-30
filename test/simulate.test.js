import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sampleFisher, smoothedBootstrap, defaultKappa, randomRotation, sampleRotation } from '../src/simulate.js';
import { lineToDcos } from '../src/core/conversions.js';
import { meanVector, principalAxes } from '../src/statistics.js';
import { meanRotation, misorientation } from '../src/rotation.js';
import * as mat3 from '../src/core/mat3.js';
import * as vec3 from '../src/core/vec3.js';

function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const unit = (v) => Math.abs(vec3.length(v) - 1) < 1e-9;
const adot = (a, b) => Math.abs(vec3.dot(a, b));

describe('sampleFisher', () => {
  const mu = vec3.normalize(lineToDcos(120, 40));

  it('returns n unit vectors', () => {
    const s = sampleFisher(mu, 50, 100, seeded(1));
    assert.strictEqual(s.length, 100);
    assert.ok(s.every(unit));
  });

  it('high concentration clusters tightly about the mean', () => {
    const s = sampleFisher(mu, 200, 500, seeded(2));
    const m = meanVector(s);
    assert.ok(adot(m, mu) > 0.99, `mean alignment ${adot(m, mu)}`);
    // mean resultant length should be high
    const R = vec3.length(s.reduce((acc, d) => [acc[0] + d[0], acc[1] + d[1], acc[2] + d[2]], [0, 0, 0])) / s.length;
    assert.ok(R > 0.95, `Rbar ${R}`);
  });

  it('kappa → 0 is approximately uniform (low resultant)', () => {
    const s = sampleFisher(mu, 0, 1000, seeded(3));
    const R = vec3.length(s.reduce((acc, d) => [acc[0] + d[0], acc[1] + d[1], acc[2] + d[2]], [0, 0, 0])) / s.length;
    assert.ok(R < 0.15, `near-uniform Rbar ${R}`);
  });

  it('is deterministic with a seeded rng', () => {
    assert.deepStrictEqual(sampleFisher(mu, 30, 10, seeded(7)), sampleFisher(mu, 30, 10, seeded(7)));
  });

  it('defaultKappa decreases with sample size', () => {
    assert.ok(defaultKappa(100) > defaultKappa(10));
  });
});

describe('smoothedBootstrap', () => {
  // Bimodal fabric: two clusters.
  const A = vec3.normalize(lineToDcos(20, 70));
  const B = vec3.normalize(lineToDcos(200, 15));
  const data = [];
  for (let i = 0; i < 25; i++) data.push(lineToDcos(20 + (i % 5 - 2), 70 + (i % 3 - 1)));
  for (let i = 0; i < 25; i++) data.push(lineToDcos(200 + (i % 5 - 2), 15 + (i % 3 - 1)));

  it('produces m unit vectors in the lower hemisphere by default', () => {
    const s = smoothedBootstrap(data, 200, { rng: seeded(1) });
    assert.strictEqual(s.length, 200);
    assert.ok(s.every(unit));
    assert.ok(s.every(d => d[2] <= 1e-9), 'folded to lower hemisphere');
  });

  it('defaults m to the input size', () => {
    assert.strictEqual(smoothedBootstrap(data, undefined, { rng: seeded(2) }).length, data.length);
  });

  it('preserves a bimodal fabric (samples near both modes)', () => {
    const s = smoothedBootstrap(data, 400, { rng: seeded(3) });
    const nearA = s.filter(d => adot(d, A) > 0.95).length;
    const nearB = s.filter(d => adot(d, B) > 0.95).length;
    assert.ok(nearA > 30 && nearB > 30, `near A ${nearA}, near B ${nearB}`);
  });

  it('roughly preserves the principal fabric of a single cluster', () => {
    const cluster = [];
    for (let i = 0; i < 40; i++) cluster.push(lineToDcos(120 + (i % 7 - 3), 40 + (i % 5 - 2)));
    const ref = principalAxes(cluster).eigenvectors[0];
    const boot = principalAxes(smoothedBootstrap(cluster, 600, { rng: seeded(5) })).eigenvectors[0];
    assert.ok(adot(ref, boot) > 0.98, `principal axis preserved ${adot(ref, boot)}`);
  });

  it('is deterministic with a seeded rng; empty input → empty', () => {
    assert.deepStrictEqual(
      smoothedBootstrap(data, 50, { rng: seeded(9) }),
      smoothedBootstrap(data, 50, { rng: seeded(9) }),
    );
    assert.deepStrictEqual(smoothedBootstrap([], 10), []);
  });
});

const det3 = (m) =>
  m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
const isRotation = (R) => {
  for (let i = 0; i < 9; i++) if (Math.abs(mat3.multiply(mat3.transpose(R), R)[i] - mat3.identity()[i]) > 1e-9) return false;
  return Math.abs(det3(R) - 1) < 1e-9;
};

describe('randomRotation', () => {
  it('returns proper rotations', () => {
    const rng = seeded(1);
    for (let i = 0; i < 20; i++) assert.ok(isRotation(randomRotation(rng)));
  });

  it('is deterministic with a seeded rng', () => {
    assert.deepStrictEqual(randomRotation(seeded(7)), randomRotation(seeded(7)));
  });

  it('is approximately uniform (low mean concentration over many)', () => {
    const rng = seeded(3);
    const rots = Array.from({ length: 500 }, () => randomRotation(rng));
    assert.ok(meanRotation(rots).concentration < 0.5, `concentration ${meanRotation(rots).concentration}`);
  });
});

describe('sampleRotation', () => {
  const meanR = mat3.rotationFromAxisAngle(vec3.normalize([1, 2, 1]), 0.8);

  it('returns proper rotations concentrated about the mean', () => {
    const rng = seeded(4);
    const rots = sampleRotation(meanR, 5, 300, rng);
    assert.ok(rots.every(isRotation));
    const meanAngle = rots.reduce((s, R) => s + misorientation(meanR, R).angle, 0) / rots.length;
    assert.ok(meanAngle < 12, `mean misorientation ${meanAngle}° should be small for σ=5°`);
  });

  it('larger sigma gives a larger spread', () => {
    const ang = (sig) => {
      const rng = seeded(11);
      const rots = sampleRotation(meanR, sig, 300, rng);
      return rots.reduce((s, R) => s + misorientation(meanR, R).angle, 0) / rots.length;
    };
    assert.ok(ang(20) > ang(5));
  });

  it('is deterministic with a seeded rng', () => {
    assert.deepStrictEqual(sampleRotation(meanR, 10, 5, seeded(2)), sampleRotation(meanR, 10, 5, seeded(2)));
  });
});
