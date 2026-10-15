import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  deviceOrientationMatrix,
  planeFromDeviceOrientation,
  lineFromDeviceOrientation,
} from '../src/compass.js';

const close = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) < tol, msg || `${a} ≈ ${b}`);

describe('deviceOrientationMatrix', () => {
  it('identity at (0,0,0)', () => {
    const R = deviceOrientationMatrix(0, 0, 0);
    const I = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    for (let i = 0; i < 9; i++) close(R[i], I[i]);
  });

  it('is orthonormal (RᵀR = I)', () => {
    const R = deviceOrientationMatrix(35, 50, -20);
    // columns dotted pairwise: diagonal 1, off-diagonal 0
    const col = j => [R[j], R[3 + j], R[6 + j]];
    const d = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    close(d(col(0), col(0)), 1); close(d(col(1), col(1)), 1); close(d(col(2), col(2)), 1);
    close(d(col(0), col(1)), 0); close(d(col(0), col(2)), 0); close(d(col(1), col(2)), 0);
  });
});

describe('planeFromDeviceOrientation', () => {
  it('flat, level phone reads dip 0', () => {
    const [, dip] = planeFromDeviceOrientation(0, 0, 0);
    close(dip, 0, 1e-9);
  });

  it('tilting by beta sets the dip angle', () => {
    const [dipDir, dip] = planeFromDeviceOrientation(0, 30, 0);
    close(dip, 30, 1e-6);
    close(dipDir, 180, 1e-6);         // facing North, top edge raised: the plane rises North, so dips South
  });

  // worked by hand: alpha turns the top edge counter-clockwise from North (alpha 100 → top toward 260),
  // beta raises the top edge, gamma lowers the right side
  it('hand-worked attitudes', () => {
    const r = ([a, b]) => [Math.round(((a % 360) + 360) % 360), Math.round(b)];
    assert.deepEqual(r(planeFromDeviceOrientation(100, 30, 0)), [80, 30], 'top edge toward 260 and raised: dips toward 080');
    assert.deepEqual(r(planeFromDeviceOrientation(0, 0, 30)), [90, 30], 'facing North, right side down: dips East');
    assert.deepEqual(r(planeFromDeviceOrientation(90, 0, 30)), [0, 30], 'top edge West, right side (North) down: dips North');
  });

  it('dip is invariant under heading (alpha)', () => {
    for (const a of [0, 45, 90, 200, 330]) {
      close(planeFromDeviceOrientation(a, 40, 0)[1], 40, 1e-6, `dip at alpha ${a}`);
    }
  });

  it('declination shifts the dip direction', () => {
    const base = planeFromDeviceOrientation(90, 30, 0)[0];
    const corr = planeFromDeviceOrientation(90, 30, 0, { declination: 10 })[0];
    close(corr, (base + 10) % 360, 1e-6);
  });

  it('returns dip direction in [0,360)', () => {
    const [dd] = planeFromDeviceOrientation(300, 25, 10, { declination: 90 });
    assert.ok(dd >= 0 && dd < 360);
  });
});

describe('lineFromDeviceOrientation', () => {
  it('flat phone, top toward North → horizontal line trending North', () => {
    const [trend, plunge] = lineFromDeviceOrientation(0, 0, 0);
    close(plunge, 0, 1e-9);
    close(trend, 0, 1e-9);
  });

  it('top edge lowered: the line plunges the way the top points', () => {
    const r = ([a, b]) => [Math.round(((a % 360) + 360) % 360), Math.round(b)];
    assert.deepEqual(r(lineFromDeviceOrientation(0, -30, 0)), [0, 30], 'top North and lowered: plunges North');
    assert.deepEqual(r(lineFromDeviceOrientation(270, -45, 0)), [90, 45], 'top East and lowered: plunges East');
    assert.deepEqual(r(lineFromDeviceOrientation(100, 30, 0)), [80, 30], 'top raised: read from the lower end');
  });

  it('returns [trend, plunge] with plunge in [0,90]', () => {
    const [trend, plunge] = lineFromDeviceOrientation(120, 35, 15);
    assert.ok(trend >= 0 && trend < 360);
    assert.ok(plunge >= 0 && plunge <= 90);
  });
});
