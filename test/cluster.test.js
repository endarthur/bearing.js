import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { fitSets } from '../src/cluster.js';
import { lineToDcos } from '../src/core/conversions.js';
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

const adot = (a, b) => Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]);

// Two well-separated sets.
const A = [0, 80], B = [90, 10];
const data = [];
for (let i = 0; i < 20; i++) data.push(lineToDcos(A[0] + (i % 5 - 2), A[1] + (i % 3 - 1)));
for (let i = 0; i < 20; i++) data.push(lineToDcos(B[0] + (i % 5 - 2), B[1] + (i % 3 - 1)));

describe('fitSets', () => {
  it('recovers two well-separated sets', () => {
    const { clusters } = fitSets(data, 2, { rng: seeded(1) });
    assert.strictEqual(clusters.length, 2);
    const dirA = lineToDcos(A[0], A[1]);
    const dirB = lineToDcos(B[0], B[1]);
    // each planted direction matches one cluster axis
    const matches = (dir) => clusters.some(c => adot(c.axisDir, dir) > 0.99);
    assert.ok(matches(dirA), 'set A recovered');
    assert.ok(matches(dirB), 'set B recovered');
  });

  it('splits the sample roughly in half', () => {
    const { clusters } = fitSets(data, 2, { rng: seeded(2) });
    for (const c of clusters) assert.ok(c.size >= 15 && c.size <= 25, `size ${c.size}`);
    const total = clusters.reduce((s, c) => s + c.size, 0);
    assert.strictEqual(total, data.length);
  });

  it('assignments index the returned clusters and cover all points', () => {
    const { clusters, assignments } = fitSets(data, 2, { rng: seeded(3) });
    assert.strictEqual(assignments.length, data.length);
    for (const a of assignments) assert.ok(a >= 0 && a < clusters.length);
    // a point near set A should be assigned to the cluster whose axis matches A
    const idxA = clusters.findIndex(c => adot(c.axisDir, lineToDcos(A[0], A[1])) > 0.99);
    assert.strictEqual(assignments[0], idxA);
  });

  it('k=1 returns the overall principal axis', () => {
    const { clusters } = fitSets(data, 1, { rng: seeded(4) });
    assert.strictEqual(clusters.length, 1);
    assert.strictEqual(clusters[0].size, data.length);
    assert.ok(clusters[0].concentration > 1 / 3);
  });

  it('clusters are sorted by size (desc) and report fractions', () => {
    const skewed = data.concat(Array.from({ length: 30 }, (_, i) => lineToDcos(B[0] + (i % 4 - 2), B[1] + (i % 3 - 1))));
    const { clusters } = fitSets(skewed, 2, { rng: seeded(5) });
    assert.ok(clusters[0].size >= clusters[1].size);
    const fSum = clusters.reduce((s, c) => s + c.fraction, 0);
    assert.ok(Math.abs(fSum - 1) < 1e-9);
  });

  it('tight cluster has high concentration', () => {
    const tight = Array.from({ length: 30 }, () => lineToDcos(45, 30));
    const { clusters } = fitSets(tight, 1, { rng: seeded(6) });
    assert.ok(clusters[0].concentration > 0.99, `τ1 = ${clusters[0].concentration}`);
  });

  it('is deterministic with a seeded rng', () => {
    const a = fitSets(data, 2, { rng: seeded(99) });
    const b = fitSets(data, 2, { rng: seeded(99) });
    assert.deepStrictEqual(a.assignments, b.assignments);
  });

  it('handles empty input', () => {
    const { clusters, assignments } = fitSets([], 2);
    assert.deepStrictEqual(clusters, []);
    assert.deepStrictEqual(assignments, []);
  });
});
