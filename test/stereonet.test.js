import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Stereonet } from '../src/stereonet.js';
import * as mat3 from '../src/core/mat3.js';

describe('Stereonet', () => {
  it('default options', () => {
    const sn = new Stereonet();
    assert.strictEqual(sn.size, 500);
    assert.strictEqual(sn.projection, 'equal-area');
    assert.strictEqual(sn.net, 'equatorial');
    assert.strictEqual(sn.rotation, null);
  });

  it('custom options', () => {
    const sn = new Stereonet({ size: 300, projection: 'equal-angle', net: 'polar' });
    assert.strictEqual(sn.size, 300);
    assert.strictEqual(sn.projection, 'equal-angle');
    assert.strictEqual(sn.net, 'polar');
  });

  it('center option creates rotation', () => {
    const sn = new Stereonet({ center: [45, 30] });
    assert.ok(sn.rotation);
    assert.strictEqual(sn.rotation.length, 9);
  });

  it('rotation option is used directly', () => {
    const R = mat3.identity();
    const sn = new Stereonet({ rotation: R });
    assert.strictEqual(sn.rotation, R);
  });

  it('method chaining', () => {
    const sn = new Stereonet();
    const result = sn.pole(90, 45).line(180, 30).plane(45, 60).cone(0, 0, 30);
    assert.strictEqual(result, sn);
  });

  it('svg() returns valid SVG string', () => {
    const sn = new Stereonet({ size: 200 });
    const svg = sn.svg();
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('width="200"'));
    assert.ok(svg.endsWith('</svg>'));
  });

  it('svg() includes grid lines', () => {
    const svg = new Stereonet().svg();
    const polylineCount = (svg.match(/<polyline/g) || []).length;
    assert.ok(polylineCount > 10, `Expected many polylines, got ${polylineCount}`);
  });

  it('svg() includes cardinal labels', () => {
    const svg = new Stereonet().svg();
    assert.ok(svg.includes('>N<'));
    assert.ok(svg.includes('>E<'));
    assert.ok(svg.includes('>S<'));
    assert.ok(svg.includes('>W<'));
  });

  it('pole() adds a circle to SVG', () => {
    const svg = new Stereonet().pole(90, 45, { fill: 'red' }).svg();
    assert.ok(svg.includes('fill="red"'));
  });

  it('line() adds a circle to SVG', () => {
    const svg = new Stereonet().line(180, 30, { fill: 'green' }).svg();
    assert.ok(svg.includes('fill="green"'));
  });

  it('plane() adds a polyline to SVG', () => {
    const svgEmpty = new Stereonet().svg();
    const svgPlane = new Stereonet().plane(45, 60, { stroke: 'blue' }).svg();
    assert.ok(svgPlane.includes('stroke="blue"'));
    const emptyCount = (svgEmpty.match(/<polyline/g) || []).length;
    const planeCount = (svgPlane.match(/<polyline/g) || []).length;
    assert.ok(planeCount > emptyCount);
  });

  it('cone() adds a dashed polyline to SVG', () => {
    const svg = new Stereonet().cone(0, 45, 20).svg();
    assert.ok(svg.includes('stroke-dasharray'));
  });

  it('equal-angle projection works', () => {
    const svg = new Stereonet({ projection: 'equal-angle' })
      .pole(90, 45)
      .plane(45, 60)
      .svg();
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('<circle'));
    assert.ok(svg.includes('<polyline'));
  });

  it('polar net renders', () => {
    const svg = new Stereonet({ net: 'polar' }).pole(90, 45).svg();
    assert.ok(svg.startsWith('<svg'));
    const polylineCount = (svg.match(/<polyline/g) || []).length;
    assert.ok(polylineCount > 10);
  });

  it('equatorial and polar nets produce different grids', () => {
    const eq = new Stereonet({ net: 'equatorial' }).svg();
    const pol = new Stereonet({ net: 'polar' }).svg();
    assert.notStrictEqual(eq, pol);
  });

  it('multiple items render without error', () => {
    const sn = new Stereonet();
    for (let dd = 0; dd < 360; dd += 30) {
      sn.pole(dd, 45);
      sn.plane(dd, 60);
    }
    sn.line(90, 30).cone(0, 90, 20);
    const svg = sn.svg();
    assert.ok(svg.length > 1000);
  });

  it('unique clip IDs across instances', () => {
    const a = new Stereonet();
    const b = new Stereonet();
    const svgA = a.svg();
    const svgB = b.svg();
    // Each should have a different clip path ID
    const idA = svgA.match(/clipPath id="([^"]+)"/)[1];
    const idB = svgB.match(/clipPath id="([^"]+)"/)[1];
    assert.notStrictEqual(idA, idB);
  });

  describe('rotation', () => {
    it('rotationFromCenter straight down is identity', () => {
      const R = Stereonet.rotationFromCenter(0, 90);
      for (let i = 0; i < 9; i++) {
        assert.ok(Math.abs(R[i] - mat3.identity()[i]) < 1e-10);
      }
    });

    it('rotationFromCenter maps direction to center', () => {
      const R = Stereonet.rotationFromCenter(90, 45);
      const DEG = Math.PI / 180;
      const d = [Math.cos(45 * DEG) * Math.sin(90 * DEG),
                 Math.cos(45 * DEG) * Math.cos(90 * DEG),
                 -Math.sin(45 * DEG)];
      const rotated = mat3.transformVec3(R, d);
      assert.ok(Math.abs(rotated[0]) < 1e-10, `x should be ~0: ${rotated[0]}`);
      assert.ok(Math.abs(rotated[1]) < 1e-10, `y should be ~0: ${rotated[1]}`);
      assert.ok(Math.abs(rotated[2] + 1) < 1e-10, `z should be ~-1: ${rotated[2]}`);
    });

    it('oblique stereonet renders without error', () => {
      const svg = new Stereonet({ center: [90, 30] })
        .pole(120, 45)
        .line(30, 15)
        .plane(45, 60)
        .cone(0, 45, 20)
        .svg();
      assert.ok(svg.startsWith('<svg'));
      assert.ok(svg.includes('<polyline'));
      assert.ok(svg.includes('<circle'));
    });

    it('oblique stereonet with identity rotation matches unrotated', () => {
      const standard = new Stereonet({ size: 200 }).pole(90, 45).svg();
      const identity = new Stereonet({ size: 200, rotation: mat3.identity() })
        .pole(90, 45).svg();
      // Strip clip IDs (unique per instance) before comparing geometry
      const strip = s => s.replace(/bearing-clip-\d+/g, 'clip');
      assert.strictEqual(strip(standard), strip(identity));
    });

    it('cardinal labels move with rotation', () => {
      const standard = new Stereonet({ size: 200 }).svg();
      const oblique = new Stereonet({ size: 200, center: [45, 30] }).svg();
      assert.ok(standard.includes('>N<'));
      assert.ok(oblique.includes('>N<'));
      assert.notStrictEqual(standard, oblique);
    });

    it('rotation option takes precedence over center', () => {
      const R = mat3.rotationFromAxisAngle([1, 0, 0], Math.PI / 4);
      const sn = new Stereonet({ rotation: R, center: [45, 30] });
      assert.strictEqual(sn.rotation, R);
    });

    it('rotationFromNorthPole(0, 0, 0) is identity', () => {
      const R = Stereonet.rotationFromNorthPole(0, 0, 0);
      const I = mat3.identity();
      for (let i = 0; i < 9; i++) {
        assert.ok(Math.abs(R[i] - I[i]) < 1e-10, `R[${i}]=${R[i]} vs I[${i}]=${I[i]}`);
      }
    });

    it('rotationFromNorthPole maps North to target direction', () => {
      const R = Stereonet.rotationFromNorthPole(90, 45, 0);
      const DEG = Math.PI / 180;
      const north = [0, 1, 0];
      const target = [Math.cos(45 * DEG) * Math.sin(90 * DEG),
                      Math.cos(45 * DEG) * Math.cos(90 * DEG),
                      -Math.sin(45 * DEG)];
      const rotated = mat3.transformVec3(R, north);
      assert.ok(Math.abs(rotated[0] - target[0]) < 1e-10, `x: ${rotated[0]} vs ${target[0]}`);
      assert.ok(Math.abs(rotated[1] - target[1]) < 1e-10, `y: ${rotated[1]} vs ${target[1]}`);
      assert.ok(Math.abs(rotated[2] - target[2]) < 1e-10, `z: ${rotated[2]} vs ${target[2]}`);
    });

    it('rotationFromNorthPole spin only rotates around North', () => {
      const R = Stereonet.rotationFromNorthPole(0, 0, 90);
      // North should stay at North
      const north = mat3.transformVec3(R, [0, 1, 0]);
      assert.ok(Math.abs(north[0]) < 1e-10);
      assert.ok(Math.abs(north[1] - 1) < 1e-10);
      assert.ok(Math.abs(north[2]) < 1e-10);
      // East [1,0,0] should rotate to somewhere else
      const east = mat3.transformVec3(R, [1, 0, 0]);
      assert.ok(Math.abs(east[0]) > 0.5 || Math.abs(east[2]) > 0.5,
        'East should move when spinning');
    });

    it('rotationFromNorthPole with spin changes output vs without', () => {
      const R0 = Stereonet.rotationFromNorthPole(90, 45, 0);
      const R30 = Stereonet.rotationFromNorthPole(90, 45, 30);
      // Both should map North to the same place
      const n0 = mat3.transformVec3(R0, [0, 1, 0]);
      const n30 = mat3.transformVec3(R30, [0, 1, 0]);
      for (let i = 0; i < 3; i++) {
        assert.ok(Math.abs(n0[i] - n30[i]) < 1e-10, `North[${i}] should match`);
      }
      // But East should go to different places
      const e0 = mat3.transformVec3(R0, [1, 0, 0]);
      const e30 = mat3.transformVec3(R30, [1, 0, 0]);
      const diff = Math.abs(e0[0] - e30[0]) + Math.abs(e0[1] - e30[1]) + Math.abs(e0[2] - e30[2]);
      assert.ok(diff > 0.1, `East should differ with spin: diff=${diff}`);
    });

    it('northPole option creates rotation', () => {
      const sn = new Stereonet({ northPole: [90, 45] });
      assert.ok(sn.rotation);
      assert.strictEqual(sn.rotation.length, 9);
    });

    it('northPole option with spin creates rotation', () => {
      const sn = new Stereonet({ northPole: [90, 45, 30] });
      assert.ok(sn.rotation);
      assert.strictEqual(sn.rotation.length, 9);
    });

    it('northPole stereonet renders without error', () => {
      const svg = new Stereonet({ northPole: [90, 45, 20] })
        .pole(120, 45)
        .plane(45, 60)
        .svg();
      assert.ok(svg.startsWith('<svg'));
      assert.ok(svg.includes('<polyline'));
      assert.ok(svg.includes('<circle'));
    });

    it('rotation option takes precedence over northPole', () => {
      const R = mat3.rotationFromAxisAngle([1, 0, 0], Math.PI / 4);
      const sn = new Stereonet({ rotation: R, northPole: [45, 30] });
      assert.strictEqual(sn.rotation, R);
    });

    it('center option takes precedence over northPole', () => {
      const sn1 = new Stereonet({ center: [45, 30] });
      const sn2 = new Stereonet({ center: [45, 30], northPole: [90, 60, 10] });
      const strip = s => s.replace(/bearing-clip-\d+/g, 'clip');
      assert.strictEqual(
        strip(sn1.pole(90, 45).svg()),
        strip(sn2.pole(90, 45).svg()),
      );
    });
  });

  describe('interactive API', () => {
    it('items array tracks added data', () => {
      const sn = new Stereonet();
      sn.pole(90, 45);
      sn.line(30, 15);
      assert.strictEqual(sn.items.length, 2);
      assert.strictEqual(sn.items[0].type, 'pole');
      assert.strictEqual(sn.items[1].type, 'line');
    });

    it('clear() removes all items', () => {
      const sn = new Stereonet();
      sn.pole(90, 45).line(30, 15).plane(120, 60);
      assert.strictEqual(sn.items.length, 3);
      sn.clear();
      assert.strictEqual(sn.items.length, 0);
    });

    it('remove() removes a specific item', () => {
      const sn = new Stereonet();
      sn.pole(90, 45);
      sn.line(30, 15);
      sn.pole(120, 60);
      const target = sn.items[1]; // the line
      sn.remove(target);
      assert.strictEqual(sn.items.length, 2);
      assert.strictEqual(sn.items[0].type, 'pole');
      assert.strictEqual(sn.items[1].type, 'pole');
    });

    it('clear() then re-add still works in svg()', () => {
      const sn = new Stereonet();
      sn.pole(90, 45, { fill: 'red' });
      sn.clear();
      sn.pole(0, 30, { fill: 'blue' });
      const svg = sn.svg();
      assert.ok(!svg.includes('fill="red"'));
      assert.ok(svg.includes('fill="blue"'));
    });

    it('setRotation() changes rotation', () => {
      const sn = new Stereonet();
      assert.strictEqual(sn.rotation, null);
      const R = mat3.rotationFromAxisAngle([1, 0, 0], Math.PI / 6);
      sn.setRotation(R);
      assert.strictEqual(sn.rotation, R);
    });

    it('setCenter() creates rotation', () => {
      const sn = new Stereonet();
      sn.setCenter(90, 45);
      assert.ok(sn.rotation);
      assert.strictEqual(sn.rotation.length, 9);
    });

    it('setNorthPole() creates rotation', () => {
      const sn = new Stereonet();
      sn.setNorthPole(90, 45, 10);
      assert.ok(sn.rotation);
      assert.strictEqual(sn.rotation.length, 9);
    });

    it('setRotation() changes svg output', () => {
      const sn = new Stereonet({ size: 200 }).pole(90, 45);
      const before = sn.svg();
      sn.setCenter(45, 30);
      const after = sn.svg();
      assert.notStrictEqual(before, after);
    });

    it('render() is no-op without element()', () => {
      const sn = new Stereonet();
      sn.pole(90, 45);
      // Should not throw
      const result = sn.render();
      assert.strictEqual(result, sn);
    });
  });

  describe('SVG export', () => {
    it('svgDataURL() returns a data URI', () => {
      const sn = new Stereonet({ size: 200 }).pole(90, 45);
      const url = sn.svgDataURL();
      assert.ok(url.startsWith('data:image/svg+xml;charset=utf-8,'));
      // Decoding should give valid SVG
      const decoded = decodeURIComponent(url.split(',')[1]);
      assert.ok(decoded.startsWith('<svg'));
      assert.ok(decoded.endsWith('</svg>'));
    });

    it('svgDataURL() includes data items', () => {
      const sn = new Stereonet({ size: 200 }).pole(90, 45, { fill: 'red' });
      const url = sn.svgDataURL();
      const decoded = decodeURIComponent(url.split(',')[1]);
      assert.ok(decoded.includes('fill="red"'));
    });
  });
});
