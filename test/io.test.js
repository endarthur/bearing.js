import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseDirection, parseDip, translateAttitude,
  parse, parsePlanes, parseLines,
} from '../src/io.js';
import { dcosToPlane, dcosToLine } from '../src/core/conversions.js';

const EPSILON = 1e-6;

function approx(a, b, msg) {
  assert.ok(Math.abs(a - b) < EPSILON, msg || `${a} ≈ ${b}`);
}

function approxAngle(a, b, msg) {
  // Handle wraparound (e.g. 359.99 ≈ 0)
  let diff = Math.abs(a - b);
  if (diff > 180) diff = 360 - diff;
  assert.ok(diff < 0.1, msg || `${a} ≈ ${b}`);
}

describe('io', () => {
  describe('parseDirection', () => {
    it('plain numbers', () => {
      approx(parseDirection('120'), 120);
      approx(parseDirection('0'), 0);
      approx(parseDirection('360'), 0);
      approx(parseDirection('45.5'), 45.5);
    });

    it('quadrant notation N*E', () => {
      approx(parseDirection('N45E'), 45);
      approx(parseDirection('N0E'), 0);
      approx(parseDirection('N90E'), 90);
    });

    it('quadrant notation S*W', () => {
      approx(parseDirection('S30W'), 210);
      approx(parseDirection('S0W'), 180);
      approx(parseDirection('S45W'), 225);
    });

    it('quadrant notation S*E', () => {
      approx(parseDirection('S30E'), 150);
      approx(parseDirection('S0E'), 180);
    });

    it('quadrant notation N*W', () => {
      approx(parseDirection('N30W'), 330);
      approx(parseDirection('N0W'), 0);
    });

    it('N with just angle (no E/W)', () => {
      approx(parseDirection('N45'), 45);
      approx(parseDirection('N0'), 0);
    });

    it('case insensitive', () => {
      approx(parseDirection('n45e'), 45);
      approx(parseDirection('s30w'), 210);
    });

    it('throws on invalid', () => {
      assert.throws(() => parseDirection('XYZ'));
      assert.throws(() => parseDirection(''));
    });
  });

  describe('parseDip', () => {
    it('plain numbers', () => {
      const r = parseDip('45');
      approx(r.dip, 45);
      assert.strictEqual(r.quadrant, '');
    });

    it('with quadrant', () => {
      const r = parseDip('45NE');
      approx(r.dip, 45);
      assert.strictEqual(r.quadrant, 'NE');
    });

    it('with single-char quadrant', () => {
      const r = parseDip('30W');
      approx(r.dip, 30);
      assert.strictEqual(r.quadrant, 'W');
    });

    it('throws on invalid', () => {
      assert.throws(() => parseDip('abc'));
    });
  });

  describe('translateAttitude', () => {
    it('dip-direction mode passes through', () => {
      const [dd, dip] = translateAttitude(90, 45, '');
      approx(dd, 90);
      approx(dip, 45);
    });

    it('strike mode with right-hand rule', () => {
      // strike=0 → dip direction=90
      const [dd, dip] = translateAttitude(0, 30, '', true);
      approx(dd, 90);
      approx(dip, 30);
    });

    it('strike mode: strike=270 → dd=0', () => {
      const [dd, dip] = translateAttitude(270, 45, '', true);
      approx(dd, 0);
      approx(dip, 45);
    });

    it('strike mode with quadrant NE', () => {
      // strike=0, quadrant=NE → dd should be 90 (not 270)
      const [dd, dip] = translateAttitude(0, 30, 'NE', true);
      // NE azimuth is 45, closer to 90 than to 270
      approx(dd, 90);
      approx(dip, 30);
    });

    it('strike mode with quadrant SW', () => {
      // strike=0, quadrant=SW → dd should be 270
      const [dd, dip] = translateAttitude(0, 30, 'SW', true);
      approx(dd, 270);
      approx(dip, 30);
    });

    it('strike=N45E with quadrant SE → dd=135', () => {
      // strike=45, quadrant=SE (az 135)
      // candidates: 135 and 315. 135 is closer to SE
      const [dd] = translateAttitude(45, 30, 'SE', true);
      approx(dd, 135);
    });

    it('strike=N45E with quadrant NW → dd=315', () => {
      const [dd] = translateAttitude(45, 30, 'NW', true);
      approx(dd, 315);
    });
  });

  describe('parse', () => {
    it('parses basic lines', () => {
      const result = parse('90 45\n180 30');
      assert.strictEqual(result.length, 2);
      assert.deepStrictEqual(result[0], [90, 45]);
      assert.deepStrictEqual(result[1], [180, 30]);
    });

    it('handles commas and slashes', () => {
      const result = parse('90,45\n180/30');
      assert.strictEqual(result.length, 2);
    });

    it('handles tabs', () => {
      const result = parse('90\t45');
      assert.strictEqual(result.length, 1);
    });

    it('skips comments and blanks', () => {
      const result = parse('# comment\n90 45\n\n180 30\n# another');
      assert.strictEqual(result.length, 2);
    });

    it('skips lines with too few fields', () => {
      const result = parse('90\n180 30');
      assert.strictEqual(result.length, 1);
    });

    it('skips non-numeric lines', () => {
      const result = parse('abc def\n90 45');
      assert.strictEqual(result.length, 1);
    });
  });

  describe('parsePlanes', () => {
    it('parses dip-direction format', () => {
      const dcos = parsePlanes('90 45\n180 30');
      assert.strictEqual(dcos.length, 2);
      // Verify round-trip
      const [dd, dip] = dcosToPlane(dcos[0]);
      approxAngle(dd, 90);
      approx(dip, 45);
    });

    it('parses strike format with right-hand rule', () => {
      const dcos = parsePlanes('0 30', { strike: true });
      assert.strictEqual(dcos.length, 1);
      const [dd, dip] = dcosToPlane(dcos[0]);
      approxAngle(dd, 90);
      approx(dip, 30);
    });

    it('parses quadrant notation', () => {
      const dcos = parsePlanes('N45E 30');
      assert.strictEqual(dcos.length, 1);
      const [dd, dip] = dcosToPlane(dcos[0]);
      approxAngle(dd, 45);
      approx(dip, 30);
    });

    it('parses strike with dip quadrant', () => {
      const dcos = parsePlanes('0 30NE', { strike: true });
      assert.strictEqual(dcos.length, 1);
      const [dd, dip] = dcosToPlane(dcos[0]);
      approxAngle(dd, 90); // strike=0, NE → dd=90
      approx(dip, 30);
    });

    it('skips invalid lines', () => {
      const dcos = parsePlanes('# header\nbad data\n90 45');
      assert.strictEqual(dcos.length, 1);
    });
  });

  describe('parseLines', () => {
    it('parses trend/plunge pairs', () => {
      const dcos = parseLines('90 30\n180 45');
      assert.strictEqual(dcos.length, 2);
      const [trend, plunge] = dcosToLine(dcos[0]);
      approxAngle(trend, 90);
      approx(plunge, 30);
    });

    it('skips comments and blanks', () => {
      const dcos = parseLines('# header\n\n90 30');
      assert.strictEqual(dcos.length, 1);
    });
  });
});
