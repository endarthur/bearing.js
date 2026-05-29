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

  describe('ellipse', () => {
    const axis = vec3.normalize([0, 0, -1]);   // straight down
    const major = [1, 0, 0];                    // major axis toward +x

    it('all points lie on the unit sphere', () => {
      for (const p of curves.ellipse(axis, major, 0.5, 0.2, 60)) {
        approx(vec3.length(p), 1, `point ${p} not on unit sphere`);
      }
    });

    it('reduces to a small circle when semi-axes are equal', () => {
      const a = 0.3;
      for (const p of curves.ellipse(axis, major, a, a, 60)) {
        approx(vec3.angle(axis, p), a, 'all points at radius a');
      }
    });

    it('all points lie between the minor and major angular radii', () => {
      const A = 0.5, B = 0.2;
      for (const p of curves.ellipse(axis, major, A, B, 120)) {
        const ang = vec3.angle(axis, p);
        assert.ok(ang <= A + EPSILON && ang >= B - EPSILON, `ang ${ang} outside [${B}, ${A}]`);
      }
    });

    it('reaches semiMajor toward majorDir at phi=0', () => {
      const pts = curves.ellipse(axis, major, 0.5, 0.2, 120);
      approx(vec3.angle(axis, pts[0]), 0.5, 'phi=0 at semiMajor');
      assert.ok(pts[0][0] > 0, 'phi=0 point displaced toward +x');
    });

    it('is closed (last point equals first)', () => {
      const pts = curves.ellipse(axis, major, 0.4, 0.25, 40);
      const a = pts[0], b = pts[pts.length - 1];
      approx(a[0], b[0]); approx(a[1], b[1]); approx(a[2], b[2]);
    });
  });
});
