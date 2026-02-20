import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { computeContours } from '../src/contouring.js';
import { planeToDcos, lineToDcos } from '../src/core/conversions.js';
import { Stereonet } from '../src/stereonet.js';

// Tight cluster around nadir (high plunge → nearly straight down)
const cluster = [];
for (let t = 0; t < 360; t += 15) {
  cluster.push(lineToDcos(t, 80 + Math.random() * 8));
}

// Dispersed data
const dispersed = [];
for (let dd = 0; dd < 360; dd += 30) {
  dispersed.push(planeToDcos(dd, 45));
}

describe('computeContours', () => {
  it('returns one entry per level', () => {
    const result = computeContours(cluster, { levels: [2, 4, 6] });
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result[0].level, 2);
    assert.strictEqual(result[1].level, 4);
    assert.strictEqual(result[2].level, 6);
  });

  it('returns empty paths for empty input', () => {
    const result = computeContours([], { levels: [2, 4] });
    assert.strictEqual(result.length, 2);
    assert.strictEqual(result[0].paths.length, 0);
  });

  it('tight cluster produces contours at low levels', () => {
    const result = computeContours(cluster, { levels: [2], gridSize: 30 });
    assert.ok(result[0].paths.length > 0,
      'Tight cluster should have contours at MUD=2');
  });

  it('contour paths have at least 2 points each', () => {
    const result = computeContours(cluster, { levels: [2], gridSize: 30 });
    for (const path of result[0].paths) {
      assert.ok(path.length >= 2, `Path should have ≥2 points, got ${path.length}`);
    }
  });

  it('contour points are within projected radius', () => {
    const projR = Math.SQRT2; // equal-area
    const result = computeContours(cluster, {
      levels: [2],
      gridSize: 30,
      projection: 'equal-area',
    });
    for (const path of result[0].paths) {
      for (const [px, py] of path) {
        const r2 = px * px + py * py;
        assert.ok(r2 < projR * projR * 1.1,
          `Point (${px}, ${py}) outside circle: r²=${r2}`);
      }
    }
  });

  it('higher levels have fewer or equal contour paths', () => {
    const result = computeContours(cluster, {
      levels: [1, 3, 6, 10],
      gridSize: 30,
    });
    // Total path length should generally decrease at higher levels
    const lengths = result.map(r =>
      r.paths.reduce((sum, p) => sum + p.length, 0)
    );
    // At minimum, the highest level shouldn't have MORE contour points
    // than the lowest level (monotonic for a unimodal cluster)
    assert.ok(lengths[0] >= lengths[lengths.length - 1],
      `Level 1 paths(${lengths[0]}) ≥ level 10 paths(${lengths[lengths.length - 1]})`);
  });

  it('works with equal-angle projection', () => {
    const result = computeContours(cluster, {
      levels: [2],
      gridSize: 25,
      projection: 'equal-angle',
    });
    assert.ok(result[0].paths.length > 0);
    const projR = 1; // equal-angle
    for (const path of result[0].paths) {
      for (const [px, py] of path) {
        assert.ok(px * px + py * py < projR * projR * 1.1);
      }
    }
  });

  it('respects custom sigma', () => {
    const narrow = computeContours(cluster, {
      levels: [2], gridSize: 25, sigma: 5,
    });
    const wide = computeContours(cluster, {
      levels: [2], gridSize: 25, sigma: 30,
    });
    // Both should produce contours but with different shapes
    assert.ok(narrow[0].paths.length > 0);
    assert.ok(wide[0].paths.length > 0);
  });

  it('works with rotation', () => {
    const R = Stereonet.rotationFromCenter(45, 30);
    const result = computeContours(cluster, {
      levels: [2],
      gridSize: 25,
      rotation: R,
    });
    assert.ok(result[0].paths.length > 0);
  });
});

describe('Stereonet contour integration', () => {
  it('contour() returns this for chaining', () => {
    const sn = new Stereonet();
    const result = sn.contour(cluster);
    assert.strictEqual(result, sn);
  });

  it('svg() includes contour polylines', () => {
    const sn = new Stereonet({ size: 200 });
    sn.contour(cluster, { levels: [2], gridSize: 20 });
    const svg = sn.svg();
    // Contour lines should add extra polylines beyond the grid
    const gridOnlySvg = new Stereonet({ size: 200 }).svg();
    const countPolylines = s => (s.match(/<polyline/g) || []).length;
    assert.ok(countPolylines(svg) > countPolylines(gridOnlySvg),
      'SVG with contours should have more polylines than grid alone');
  });

  it('clearContours() removes contour data', () => {
    const sn = new Stereonet({ size: 200 });
    sn.contour(cluster, { levels: [2], gridSize: 20 });
    sn.clearContours();
    const svg = sn.svg();
    const gridOnlySvg = new Stereonet({ size: 200 }).svg();
    const countPolylines = s => (s.match(/<polyline/g) || []).length;
    const strip = s => s.replace(/bearing-clip-\d+/g, 'clip');
    assert.strictEqual(countPolylines(strip(svg)), countPolylines(strip(gridOnlySvg)));
  });

  it('updateContours() recomputes', () => {
    const sn = new Stereonet({ size: 200 });
    sn.contour(cluster, { levels: [2], gridSize: 20 });
    const before = sn.svg();
    sn.setCenter(45, 30);
    sn.updateContours();
    const after = sn.svg();
    assert.notStrictEqual(before, after);
  });

  it('contour with colors option', () => {
    const sn = new Stereonet({ size: 200 });
    sn.contour(cluster, {
      levels: [2, 4],
      gridSize: 20,
      colors: ['#f00', '#00f'],
    });
    const svg = sn.svg();
    assert.ok(svg.includes('#f00') || svg.includes('#00f'),
      'SVG should include custom colors');
  });
});
