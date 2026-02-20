import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as vec3 from '../../src/core/vec3.js';

const EPSILON = 1e-10;

function approx(a, b, msg) {
  assert.ok(Math.abs(a - b) < EPSILON, msg || `${a} ≈ ${b}`);
}

function approxVec(a, b, msg) {
  for (let i = 0; i < 3; i++) {
    approx(a[i], b[i], msg || `component ${i}: ${a[i]} ≈ ${b[i]}`);
  }
}

describe('vec3', () => {
  it('create', () => {
    assert.deepStrictEqual(vec3.create(), [0, 0, 0]);
    assert.deepStrictEqual(vec3.create(1, 2, 3), [1, 2, 3]);
  });

  it('dot', () => {
    assert.strictEqual(vec3.dot([1, 0, 0], [0, 1, 0]), 0);
    assert.strictEqual(vec3.dot([1, 2, 3], [4, 5, 6]), 32);
  });

  it('cross', () => {
    approxVec(vec3.cross([1, 0, 0], [0, 1, 0]), [0, 0, 1]);
    approxVec(vec3.cross([0, 1, 0], [1, 0, 0]), [0, 0, -1]);
  });

  it('length', () => {
    approx(vec3.length([3, 4, 0]), 5);
    approx(vec3.length([1, 0, 0]), 1);
  });

  it('normalize', () => {
    approxVec(vec3.normalize([3, 0, 0]), [1, 0, 0]);
    approx(vec3.length(vec3.normalize([1, 2, 3])), 1);
    approxVec(vec3.normalize([0, 0, 0]), [0, 0, 0]);
  });

  it('scale', () => {
    assert.deepStrictEqual(vec3.scale([1, 2, 3], 2), [2, 4, 6]);
  });

  it('add / sub', () => {
    assert.deepStrictEqual(vec3.add([1, 2, 3], [4, 5, 6]), [5, 7, 9]);
    assert.deepStrictEqual(vec3.sub([4, 5, 6], [1, 2, 3]), [3, 3, 3]);
  });

  it('negate', () => {
    assert.deepStrictEqual(vec3.negate([1, -2, 3]), [-1, 2, -3]);
  });

  it('angle', () => {
    approx(vec3.angle([1, 0, 0], [0, 1, 0]), Math.PI / 2);
    approx(vec3.angle([1, 0, 0], [1, 0, 0]), 0);
    approx(vec3.angle([1, 0, 0], [-1, 0, 0]), Math.PI);
  });

  it('rotate — 90° around z-axis', () => {
    const result = vec3.rotate([1, 0, 0], [0, 0, 1], Math.PI / 2);
    approxVec(result, [0, 1, 0]);
  });

  it('rotate — 180° around y-axis', () => {
    const result = vec3.rotate([1, 0, 0], [0, 1, 0], Math.PI);
    approxVec(result, [-1, 0, 0]);
  });

  it('rotate preserves length', () => {
    const v = [1, 2, 3];
    const result = vec3.rotate(v, [1, 1, 0], 1.23);
    approx(vec3.length(result), vec3.length(v));
  });
});
