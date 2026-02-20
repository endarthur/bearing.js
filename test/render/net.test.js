import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { generateNet, cardinalPoints } from '../../src/render/net.js';

describe('net', () => {
  describe('polar', () => {
    it('produces great circles and small circles', () => {
      const { greatCircles, smallCircles } = generateNet(10, 'polar');
      // 180 / 10 = 18 great circles (straight lines through center)
      assert.strictEqual(greatCircles.length, 18);
      // (90 - 10) / 10 + 1 = 9 small circles (concentric rings, including equator)
      assert.strictEqual(smallCircles.length, 9);
    });
  });

  describe('equatorial', () => {
    it('produces great circles and small circles', () => {
      const { greatCircles, smallCircles } = generateNet(10, 'equatorial');
      // 180 / 10 = 18 great circles (N-S arcs, including equator at alpha=0)
      assert.strictEqual(greatCircles.length, 18);
      // (180 - 10) / 10 = 17 small circles (E-W cones at each angle)
      assert.strictEqual(smallCircles.length, 17);
    });
  });

  it('defaults to equatorial', () => {
    const eq = generateNet(30);
    const eqExplicit = generateNet(30, 'equatorial');
    assert.strictEqual(eq.greatCircles.length, eqExplicit.greatCircles.length);
    assert.strictEqual(eq.smallCircles.length, eqExplicit.smallCircles.length);
  });

  it('all points are 3D unit vectors (both types)', () => {
    for (const type of ['polar', 'equatorial']) {
      const { greatCircles, smallCircles } = generateNet(30, type);
      for (const gc of greatCircles) {
        for (const p of gc) {
          assert.strictEqual(p.length, 3);
          assert.ok(isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]));
          const len = Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2);
          assert.ok(Math.abs(len - 1) < 1e-10, `point not on unit sphere: |p| = ${len}`);
        }
      }
      for (const sc of smallCircles) {
        for (const p of sc) {
          assert.strictEqual(p.length, 3);
          assert.ok(isFinite(p[0]) && isFinite(p[1]) && isFinite(p[2]));
          const len = Math.sqrt(p[0] ** 2 + p[1] ** 2 + p[2] ** 2);
          assert.ok(Math.abs(len - 1) < 1e-10, `point not on unit sphere: |p| = ${len}`);
        }
      }
    }
  });

  it('cardinalPoints returns N/E/S/W', () => {
    const pts = cardinalPoints(100, 250, 250, 16);
    assert.strictEqual(pts.length, 4);
    assert.strictEqual(pts[0].label, 'N');
    assert.strictEqual(pts[1].label, 'E');
    assert.strictEqual(pts[2].label, 'S');
    assert.strictEqual(pts[3].label, 'W');
    // N is above center
    assert.ok(pts[0].y < 250);
    // E is right of center
    assert.ok(pts[1].x > 250);
  });
});
