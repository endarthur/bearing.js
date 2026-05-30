import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { woodcockPoint, woodcockSVG, vollmerPoint, vollmerSVG } from '../src/fabricplot.js';
import { lineToDcos, planeToDcos } from '../src/core/conversions.js';
import { greatCircle } from '../src/core/curves.js';

const cluster = [];
for (let i = 0; i < 30; i++) cluster.push(lineToDcos(120 + (i % 5 - 2), 70 + (i % 3 - 1)));
const girdle = greatCircle(lineToDcos(0, 0), 48); // poles on a great circle

describe('woodcockPoint', () => {
  it('a cluster has K > 1, a girdle has K < 1', () => {
    assert.ok(woodcockPoint(cluster).K > 1, `cluster K ${woodcockPoint(cluster).K}`);
    assert.ok(woodcockPoint(girdle).K < 1, `girdle K ${woodcockPoint(girdle).K}`);
  });

  it('strength C is positive and x,y are finite', () => {
    const p = woodcockPoint(cluster);
    assert.ok(p.C > 0 && Number.isFinite(p.x) && Number.isFinite(p.y));
  });
});

describe('vollmerPoint', () => {
  it('P+G+R = 1', () => {
    const { P, G, R } = vollmerPoint(cluster);
    assert.ok(Math.abs(P + G + R - 1) < 1e-9);
  });

  it('a cluster is point-dominated, a girdle is girdle-dominated', () => {
    assert.ok(vollmerPoint(cluster).P > vollmerPoint(cluster).G);
    assert.ok(vollmerPoint(girdle).G > vollmerPoint(girdle).P);
  });
});

describe('SVG output', () => {
  it('woodcockSVG renders a frame and one point per dataset', () => {
    const svg = woodcockSVG([{ dcos: cluster, label: 'A' }, { dcos: girdle, label: 'B' }]);
    assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'));
    assert.strictEqual((svg.match(/<circle/g) || []).length, 2);
    assert.ok(svg.includes('>A<') && svg.includes('>B<'));
  });

  it('vollmerSVG renders a triangle and points; accepts a bare dcos array', () => {
    const svg = vollmerSVG(cluster); // single dataset as a plain dcos array
    assert.ok(svg.includes('<path')); // triangle
    assert.strictEqual((svg.match(/<circle/g) || []).length, 1);
  });
});
