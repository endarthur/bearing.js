import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  planeToDcos, dcosToPlane,
  lineToDcos, dcosToLine,
  strikeToDD,
  planesToDcos, linesToDcos,
  rakeToDcos, rakeToLine, lineOnPlane,
  planeIntersectionLine,
  rotateDcos, rotateDcosArray,
} from '../../src/core/conversions.js';

const EPSILON = 1e-6;

function approx(a, b, msg) {
  assert.ok(Math.abs(a - b) < EPSILON, msg || `${a} ≈ ${b}`);
}

function approxVec(a, b) {
  for (let i = 0; i < 3; i++) approx(a[i], b[i], `component ${i}: ${a[i]} ≈ ${b[i]}`);
}

describe('conversions', () => {
  describe('plane round-trip', () => {
    const cases = [
      [0, 0], [0, 45], [0, 90],
      [90, 30], [180, 60], [270, 45],
      [45, 45], [135, 80], [315, 10],
    ];
    for (const [dd, dip] of cases) {
      it(`dd=${dd} dip=${dip}`, () => {
        const dcos = planeToDcos(dd, dip);
        const [dd2, dip2] = dcosToPlane(dcos);
        approx(dip2, dip, `dip: ${dip2} ≈ ${dip}`);
        if (dip > 0.01) {
          // dd is undefined when dip=0
          const ddDiff = Math.abs(dd2 - dd);
          assert.ok(ddDiff < EPSILON || Math.abs(ddDiff - 360) < EPSILON, `dd: ${dd2} ≈ ${dd}`);
        }
      });
    }
  });

  describe('line round-trip', () => {
    const cases = [
      [0, 0], [0, 45], [0, 90],
      [90, 30], [180, 60], [270, 45],
      [45, 45], [135, 80], [315, 10],
    ];
    for (const [trend, plunge] of cases) {
      it(`trend=${trend} plunge=${plunge}`, () => {
        const dcos = lineToDcos(trend, plunge);
        const [t2, p2] = dcosToLine(dcos);
        approx(p2, plunge, `plunge: ${p2} ≈ ${plunge}`);
        if (plunge < 89.99) {
          const tDiff = Math.abs(t2 - trend);
          assert.ok(tDiff < EPSILON || Math.abs(tDiff - 360) < EPSILON, `trend: ${t2} ≈ ${trend}`);
        }
      });
    }
  });

  it('horizontal plane pole points straight down', () => {
    const dcos = planeToDcos(0, 0);
    approxVec(dcos, [0, 0, -1]);
  });

  it('vertical plane dipping east', () => {
    const dcos = planeToDcos(90, 90);
    approxVec(dcos, [-1, 0, 0]);
  });

  it('horizontal line pointing north', () => {
    const dcos = lineToDcos(0, 0);
    approxVec(dcos, [0, 1, 0]);
  });

  it('vertical line', () => {
    const dcos = lineToDcos(0, 90);
    approxVec(dcos, [0, 0, -1]);
  });

  it('strikeToDD', () => {
    assert.deepStrictEqual(strikeToDD(0, 30), [90, 30]);
    assert.deepStrictEqual(strikeToDD(270, 45), [0, 45]);
  });

  it('batch planesToDcos', () => {
    const result = planesToDcos([[0, 0], [90, 90]]);
    assert.strictEqual(result.length, 2);
    approxVec(result[0], [0, 0, -1]);
  });

  it('batch linesToDcos', () => {
    const result = linesToDcos([[0, 0], [0, 90]]);
    assert.strictEqual(result.length, 2);
    approxVec(result[0], [0, 1, 0]);
  });

  describe('rake', () => {
    it('rake 0 is along strike direction', () => {
      // Plane dipping east (dd=90, dip=45), rake=0 → line along strike (N or S)
      const [trend, plunge] = rakeToLine(90, 45, 0);
      approx(plunge, 0, `plunge should be 0 for rake=0: got ${plunge}`);
      // Strike of dd=90 is 0 (or 180)
      const tNorm = trend % 180;
      assert.ok(tNorm < 0.1 || Math.abs(tNorm - 180) < 0.1,
        `trend should be ~0 or ~180 for strike-parallel: got ${trend}`);
    });

    it('rake 90 is down-dip', () => {
      // Plane dipping east (dd=90, dip=45), rake=90 → line pointing east and down
      const [trend, plunge] = rakeToLine(90, 45, 90);
      approx(trend, 90, `trend should be 90: got ${trend}`);
      approx(plunge, 45, `plunge should equal dip for rake=90: got ${plunge}`);
    });

    it('round-trip: rakeToDcos → dcosToLine → lineOnPlane recovers rake', () => {
      const dd = 120, dip = 50, rake = 35;
      const [trend, plunge] = rakeToLine(dd, dip, rake);
      const recovered = lineOnPlane(dd, dip, trend, plunge);
      approx(recovered, rake, `rake round-trip: ${recovered} ≈ ${rake}`);
    });

    it('round-trip for negative rake (hemisphere equivalence)', () => {
      // Negative rake -30 and 150 describe the same undirected line on the plane.
      // dcosToLine forces lower hemisphere, so -30 becomes 180-30=150.
      const dd = 45, dip = 60, rake = -30;
      const [trend, plunge] = rakeToLine(dd, dip, rake);
      const recovered = lineOnPlane(dd, dip, trend, plunge);
      // Check that rakes are equivalent: same line means sum ≈ 180 or diff ≈ 0
      const diff = Math.abs(recovered - rake);
      const sum = Math.abs(recovered + rake);
      assert.ok(diff < 0.1 || Math.abs(diff - 180) < 0.1 || Math.abs(sum - 180) < 0.1,
        `rake equivalence: recovered=${recovered}, original=${rake}`);
    });

    it('rake 180 is opposite to strike (also horizontal)', () => {
      const [trend, plunge] = rakeToLine(90, 45, 180);
      approx(plunge, 0, `plunge should be ~0: got ${plunge}`);
    });
  });

  describe('planeIntersectionLine', () => {
    it('orthogonal vertical planes', () => {
      // Plane 1: dd=90, dip=90 (vertical, dipping E)
      // Plane 2: dd=0, dip=90 (vertical, dipping N)
      // Intersection should be vertical (plunge=90)
      const result = planeIntersectionLine(90, 90, 0, 90);
      assert.ok(result, 'should not be null');
      approx(result[1], 90, `plunge should be 90: got ${result[1]}`);
    });

    it('two planes with known intersection', () => {
      // Plane 1: dd=90, dip=45
      // Plane 2: dd=180, dip=45
      const result = planeIntersectionLine(90, 45, 180, 45);
      assert.ok(result);
      assert.ok(result[1] >= 0 && result[1] <= 90, `plunge in range: ${result[1]}`);
    });

    it('parallel planes return null', () => {
      const result = planeIntersectionLine(90, 45, 90, 45);
      assert.strictEqual(result, null);
    });

    it('opposite-dipping planes intersect along strike', () => {
      // dd=90 and dd=270 share strike N-S, so intersection is horizontal N-S line
      const result = planeIntersectionLine(90, 45, 270, 45);
      assert.ok(result, 'should not be null');
      approx(result[1], 0, `plunge should be ~0: got ${result[1]}`);
      // trend should be 0 or 180 (N or S)
      const t = result[0] % 180;
      assert.ok(t < 0.1 || Math.abs(t - 180) < 0.1, `trend should be N-S: got ${result[0]}`);
    });
  });

  describe('rotation', () => {
    it('90° around vertical axis maps East to North', () => {
      // East = [1, 0, 0], rotate 90° CCW around Z-up=[0,0,1]
      const east = lineToDcos(90, 0); // [1, 0, 0]
      const zUp = [0, 0, 1];
      const rotated = rotateDcos(east, zUp, 90);
      // CCW 90° around Z-up: East → North
      approxVec(rotated, [0, 1, 0]);
    });

    it('360° rotation is identity', () => {
      const v = lineToDcos(45, 30);
      const axis = [0, 0, -1];
      const rotated = rotateDcos(v, axis, 360);
      approxVec(rotated, v);
    });

    it('0° rotation is identity', () => {
      const v = [0.5, 0.5, -Math.SQRT1_2];
      const rotated = rotateDcos(v, [1, 0, 0], 0);
      approxVec(rotated, v);
    });

    it('batch rotateDcosArray', () => {
      const east = [1, 0, 0];
      const north = [0, 1, 0];
      const axis = [0, 0, 1]; // Z-up
      const result = rotateDcosArray([east, north], axis, 90);
      assert.strictEqual(result.length, 2);
      // CCW 90° around Z-up: East→North, North→West
      approxVec(result[0], [0, 1, 0]);
      approxVec(result[1], [-1, 0, 0]);
    });
  });
});
