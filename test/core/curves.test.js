import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as curves from '../../src/core/curves.js';
import * as vec3 from '../../src/core/vec3.js';

const EPSILON = 1e-6;

function approx(a, b, msg) {
  assert.ok(Math.abs(a - b) < EPSILON, msg || `${a} ≈ ${b}`);
}

describe('curves', () => {
  describe('greatCircle', () => {
    it('all points lie on unit sphere', () => {
      const points = curves.greatCircle([0, 0, 1], 36);
      for (const p of points) {
        approx(vec3.length(p), 1, `point ${p} not on unit sphere`);
      }
    });

    it('all points are perpendicular to pole', () => {
      const pole = [0, 0, 1];
      const points = curves.greatCircle(pole, 36);
      for (const p of points) {
        approx(vec3.dot(pole, p), 0, `dot with pole: ${vec3.dot(pole, p)}`);
      }
    });

    it('returns nPoints+1 points (closed)', () => {
      const points = curves.greatCircle([1, 0, 0], 20);
      assert.strictEqual(points.length, 21);
    });
  });

  describe('smallCircle', () => {
    it('all points at correct angular distance from axis', () => {
      const axis = [0, 0, 1];
      const halfAngle = Math.PI / 4;
      const points = curves.smallCircle(axis, halfAngle, 36);
      for (const p of points) {
        approx(vec3.length(p), 1, 'not on unit sphere');
        approx(vec3.angle(axis, p), halfAngle, 'wrong half-angle');
      }
    });
  });

  describe('arc', () => {
    it('endpoints match inputs', () => {
      const a = [1, 0, 0];
      const b = [0, 1, 0];
      const points = curves.arc(a, b, 10);
      for (let i = 0; i < 3; i++) {
        approx(points[0][i], a[i]);
        approx(points[points.length - 1][i], b[i]);
      }
    });

    it('degenerate arc (same point)', () => {
      const a = [1, 0, 0];
      const points = curves.arc(a, a);
      assert.strictEqual(points.length, 1);
    });
  });

  describe('planeIntersection', () => {
    it('orthogonal planes', () => {
      const result = curves.planeIntersection([1, 0, 0], [0, 1, 0]);
      assert.ok(result);
      approx(Math.abs(vec3.dot(result[0], [0, 0, 1])), 1);
    });

    it('parallel planes return null', () => {
      assert.strictEqual(curves.planeIntersection([1, 0, 0], [1, 0, 0]), null);
      assert.strictEqual(curves.planeIntersection([1, 0, 0], [-1, 0, 0]), null);
    });
  });
});
