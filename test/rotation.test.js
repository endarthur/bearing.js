import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  frameFromPlaneLine, misorientation, compose, slerp, eulerPole, meanRotation,
  apply, applyToPlane, applyToLine, inverse, relative, fromPoleAngle,
  rotationVector, fromRotationVector, bootstrapMeanRotation,
} from '../src/rotation.js';
import * as mat3 from '../src/core/mat3.js';
import * as vec3 from '../src/core/vec3.js';
import { planeToDcos, lineToDcos } from '../src/core/conversions.js';

const col = (m, j) => [m[j], m[3 + j], m[6 + j]];
const approxArr = (a, b, tol = 1e-9) => { for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i] - b[i]) < tol, `${a[i]}≈${b[i]}`); };
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

describe('frameFromPlaneLine', () => {
  it('is an orthonormal right-handed rotation', () => {
    const R = frameFromPlaneLine(90, 60, 90, 60); // lineation down-dip
    approxArr(mat3.multiply(mat3.transpose(R), R), mat3.identity(), 1e-9);
  });

  it('Z column is the plane pole; X lies in the plane', () => {
    const R = frameFromPlaneLine(120, 45, 120, 45);
    approxArr(col(R, 2), vec3.normalize(planeToDcos(120, 45)), 1e-9);
    // X ⟂ pole
    assert.ok(Math.abs(vec3.dot(col(R, 0), col(R, 2))) < 1e-9);
  });
});

describe('misorientation', () => {
  it('is zero for identical rotations', () => {
    const R = mat3.rotationFromAxisAngle([0, 1, 0], 0.5);
    assert.ok(misorientation(R, R).angle < 1e-9);
  });

  it('equals the relative rotation angle', () => {
    const R1 = mat3.rotationFromAxisAngle([0, 0, 1], 0.3);
    const delta = mat3.rotationFromAxisAngle([0, 0, 1], 30 * Math.PI / 180);
    const R2 = mat3.multiply(delta, R1);
    const m = misorientation(R1, R2);
    assert.ok(Math.abs(m.angle - 30) < 1e-6, `angle ${m.angle}`);
    assert.ok(Math.abs(Math.abs(vec3.dot(m.axis, [0, 0, 1])) - 1) < 1e-6, 'axis is z');
  });
});

describe('compose / slerp / eulerPole', () => {
  it('compose applies the first rotation first', () => {
    const A = mat3.rotationFromAxisAngle([0, 0, 1], Math.PI / 2);
    const B = mat3.rotationFromAxisAngle([1, 0, 0], Math.PI / 2);
    approxArr(compose(A, B), mat3.multiply(B, A), 1e-9);
  });

  it('slerp endpoints return the inputs', () => {
    const R0 = mat3.rotationFromAxisAngle([0, 1, 0], 0.2);
    const R1 = mat3.rotationFromAxisAngle([0, 1, 0], 1.2);
    approxArr(slerp(R0, R1, 0), R0, 1e-9);
    approxArr(slerp(R0, R1, 1), R1, 1e-9);
  });

  it('eulerPole recovers axis and angle', () => {
    const R = mat3.rotationFromAxisAngle(vec3.normalize([1, 1, 0]), 40 * Math.PI / 180);
    const { axis, angle } = eulerPole(R);
    assert.ok(Math.abs(angle - 40) < 1e-6, `angle ${angle}`);
    assert.strictEqual(axis.length, 2); // [trend, plunge]
  });
});

describe('meanRotation', () => {
  it('returns the rotation exactly for identical inputs', () => {
    const R = mat3.rotationFromAxisAngle(vec3.normalize([1, 2, 1]), 0.9);
    const { mean, spread } = meanRotation([R, R, R]);
    approxArr(mean, R, 1e-9);
    assert.ok(spread < 1e-9);
  });

  it('recovers the centre of a tight cluster of rotations', () => {
    const R0 = mat3.rotationFromAxisAngle(vec3.normalize([0, 1, 1]), 0.6);
    const rots = [];
    for (let i = 0; i < 12; i++) {
      const wobble = mat3.rotationFromAxisAngle(vec3.normalize([1, i % 3 - 1, (i % 5 - 2) * 0.5 + 0.01]), (i % 7 - 3) * 0.02);
      rots.push(mat3.multiply(wobble, R0));
    }
    const { mean, concentration, spread } = meanRotation(rots);
    assert.ok(misorientation(mean, R0).angle < 5, `mean within 5° of centre`);
    assert.ok(concentration > 0.9 && concentration <= 1.0000001, `concentration ${concentration}`);
    assert.ok(spread < 10, `spread ${spread}`);
  });

  it('handles empty input', () => {
    const { mean } = meanRotation([]);
    approxArr(mat3.identity(), mat3.identity(), 1e-12);
    approxArr(mean, mat3.identity(), 1e-12);
  });
});

describe('apply & combine', () => {
  const R = mat3.rotationFromAxisAngle(vec3.normalize([0, 0, 1]), 0.7);

  it('apply rotates a single vector and an array', () => {
    const d = vec3.normalize([1, 2, 3]);
    approxArr(apply(R, d), mat3.transformVec3(R, d), 1e-12);
    const arr = apply(R, [d, [1, 0, 0]]);
    assert.strictEqual(arr.length, 2);
    approxArr(arr[1], mat3.transformVec3(R, [1, 0, 0]), 1e-12);
  });

  it('inverse undoes a rotation', () => {
    const d = vec3.normalize([1, -2, 0.5]);
    approxArr(apply(inverse(R), apply(R, d)), d, 1e-9);
  });

  it('relative(R1,R2)·R1 = R2', () => {
    const R1 = mat3.rotationFromAxisAngle([1, 0, 0], 0.4);
    const R2 = mat3.rotationFromAxisAngle([0, 1, 0], 1.1);
    approxArr(mat3.multiply(relative(R1, R2), R1), R2, 1e-9);
  });

  it('applyToLine: vertical-axis rotation shifts trend by the angle, keeps plunge', () => {
    const Rv = fromPoleAngle(0, 90, 30); // about straight-down by 30°
    const [trend, plunge] = applyToLine(Rv, 50, 20);
    assert.ok(Math.abs(plunge - 20) < 1e-6, `plunge ${plunge}`);
    assert.ok(Math.abs(trend - 80) < 1e-6 || Math.abs(trend - 20) < 1e-6, `trend ${trend} (expect 50±30)`);
  });

  it('applyToPlane by identity is a no-op', () => {
    approxArr(applyToPlane(mat3.identity(), 120, 45), [120, 45], 1e-9);
  });

  it('fromPoleAngle and eulerPole round-trip', () => {
    const { axis, angle } = eulerPole(fromPoleAngle(120, 30, 40));
    assert.ok(Math.abs(angle - 40) < 1e-6, `angle ${angle}`);
    assert.ok(Math.abs(axis[0] - 120) < 1e-6 && Math.abs(axis[1] - 30) < 1e-6, `axis ${axis}`);
  });
});

describe('rotation vector (so(3) log/exp)', () => {
  it('round-trips matrix ↔ rotation vector', () => {
    for (const [ax, an] of [[[0, 0, 1], 0.5], [vec3.normalize([1, 2, 1]), 2.0], [[1, 0, 0], Math.PI - 0.1]]) {
      const R = mat3.rotationFromAxisAngle(ax, an);
      approxArr(fromRotationVector(rotationVector(R)), R, 1e-9);
    }
  });

  it('magnitude equals the rotation angle', () => {
    const v = rotationVector(mat3.rotationFromAxisAngle(vec3.normalize([1, 1, 0]), 1.234));
    assert.ok(Math.abs(Math.hypot(v[0], v[1], v[2]) - 1.234) < 1e-9);
  });

  it('identity maps to the zero vector', () => {
    approxArr(rotationVector(mat3.identity()), [0, 0, 0], 1e-12);
  });
});

describe('bootstrapMeanRotation', () => {
  const R0 = mat3.rotationFromAxisAngle(vec3.normalize([0, 1, 1]), 0.6);
  const cluster = (n) => {
    const out = [];
    for (let i = 0; i < n; i++) {
      const wob = mat3.rotationFromAxisAngle(vec3.normalize([1, i % 3 - 1, (i % 5 - 2) * 0.4 + 0.01]), (i % 7 - 3) * 0.03);
      out.push(mat3.multiply(wob, R0));
    }
    return out;
  };

  it('is deterministic with a seeded rng', () => {
    const data = cluster(30);
    assert.strictEqual(
      bootstrapMeanRotation(data, { rng: seeded(5), iterations: 200 }).halfAngle,
      bootstrapMeanRotation(data, { rng: seeded(5), iterations: 200 }).halfAngle,
    );
  });

  it('cone shrinks with more data and widens with confidence', () => {
    const small = bootstrapMeanRotation(cluster(12), { rng: seeded(1), iterations: 300 });
    const big = bootstrapMeanRotation(cluster(120), { rng: seeded(1), iterations: 300 });
    assert.ok(big.halfAngle < small.halfAngle, `big ${big.halfAngle} < small ${small.halfAngle}`);
    const c95 = bootstrapMeanRotation(cluster(40), { rng: seeded(2), confidence: 0.95, iterations: 300 });
    const c99 = bootstrapMeanRotation(cluster(40), { rng: seeded(2), confidence: 0.99, iterations: 300 });
    assert.ok(c99.halfAngle >= c95.halfAngle);
  });
});
