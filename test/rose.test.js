import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roseBins, rosePetals, roseSVG } from '../src/rose.js';

describe('roseBins', () => {
  it('produces 360/binWidth sectors', () => {
    assert.strictEqual(roseBins([], { binWidth: 10 }).bins.length, 36);
    assert.strictEqual(roseBins([], { binWidth: 30 }).bins.length, 12);
    assert.strictEqual(roseBins([], { binWidth: 20 }).bins.length, 18);
  });

  it('counts a datum into the sector centred on its azimuth', () => {
    const { bins } = roseBins([90], { binWidth: 10 });
    const east = bins.find(b => b.midDeg === 90);
    assert.strictEqual(east.count, 1);
    assert.strictEqual(bins.reduce((s, b) => s + b.count, 0), 1);
  });

  it('the North sector straddles 0 (catches 359 and 1)', () => {
    const { bins } = roseBins([359, 1, 0], { binWidth: 10 });
    const north = bins.find(b => b.midDeg === 0);
    assert.strictEqual(north.count, 3);
  });

  it('wraps azimuths outside [0,360)', () => {
    const { bins } = roseBins([450], { binWidth: 10 }); // 450 → 90
    assert.strictEqual(bins.find(b => b.midDeg === 90).count, 1);
  });

  it('axial mode mirrors each datum by 180°', () => {
    const { bins, n } = roseBins([90], { binWidth: 10, axial: true });
    assert.strictEqual(n, 2);
    assert.strictEqual(bins.find(b => b.midDeg === 90).count, 1);
    assert.strictEqual(bins.find(b => b.midDeg === 270).count, 1);
  });

  it('reports n, maxCount and frequency', () => {
    const { n, maxCount, maxFrequency, bins } = roseBins([3, 1, 358, 90], { binWidth: 10 });
    assert.strictEqual(n, 4);
    assert.strictEqual(maxCount, 3);            // three around N in the 0° sector
    assert.ok(Math.abs(maxFrequency - 0.75) < 1e-9);
    const total = bins.reduce((s, b) => s + b.frequency, 0);
    assert.ok(Math.abs(total - 1) < 1e-9);
  });

  it('ignores non-finite azimuths', () => {
    assert.strictEqual(roseBins([NaN, Infinity, 45], { binWidth: 10 }).n, 1);
  });
});

describe('rosePetals', () => {
  const binned = roseBins([0, 0, 0, 90, 180, 180], { binWidth: 30 });

  it('emits one petal per non-empty sector', () => {
    const petals = rosePetals(binned, { radius: 100 });
    const nonEmpty = binned.bins.filter(b => b.count > 0).length;
    assert.strictEqual(petals.length, nonEmpty);
  });

  it('largest-count petal reaches the full radius (linear)', () => {
    const petals = rosePetals(binned, { radius: 100, scale: 'linear' });
    const top = petals.reduce((m, p) => p.bin.count > m.bin.count ? p : m);
    assert.ok(Math.abs(top.radius - 100) < 1e-9);
  });

  it('sqrt scaling shortens petals relative to linear (except the max)', () => {
    const lin = rosePetals(binned, { radius: 100, scale: 'linear' });
    const sq = rosePetals(binned, { radius: 100, scale: 'sqrt' });
    // a count-1 petal: linear → 1/3 R, sqrt → sqrt(1/3) R ≈ 0.577 R (taller)
    const linOne = lin.find(p => p.bin.count === 1).radius;
    const sqOne = sq.find(p => p.bin.count === 1).radius;
    assert.ok(sqOne > linOne, `sqrt(${sqOne}) should exceed linear(${linOne}) for sub-max counts`);
  });

  it('wedge petals start at the centre; outer vertices sit at the petal radius', () => {
    const petals = rosePetals(binned, { cx: 150, cy: 150, radius: 100 });
    const p = petals[0];
    assert.deepStrictEqual(p.points[0], [150, 150]); // centre
    // every non-centre vertex is within the petal radius of the centre
    for (const [x, y] of p.points.slice(1)) {
      assert.ok(Math.hypot(x - 150, y - 150) <= p.radius + 1e-9);
    }
  });

  it('donut roses (innerRadius) do not pass through the centre', () => {
    const petals = rosePetals(binned, { cx: 150, cy: 150, radius: 100, innerRadius: 20 });
    for (const [x, y] of petals[0].points) {
      assert.ok(Math.hypot(x - 150, y - 150) >= 20 - 1e-9);
    }
  });
});

describe('roseSVG', () => {
  it('returns valid SVG sized to options', () => {
    const svg = roseSVG([0, 30, 60, 90], { size: 240, binWidth: 30 });
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('width="240"'));
    assert.ok(svg.endsWith('</svg>'));
  });

  it('draws a petal path per non-empty sector', () => {
    const svg = roseSVG([0, 0, 90, 180], { binWidth: 30 });
    const paths = (svg.match(/<path/g) || []).length;
    assert.strictEqual(paths, 3); // sectors at 0, 90, 180
  });

  it('renders radial rings when requested', () => {
    const plain = roseSVG([45], { rings: 0 });
    const ringed = roseSVG([45], { rings: 4 });
    const circles = s => (s.match(/<circle/g) || []).length;
    assert.ok(circles(ringed) > circles(plain));
  });

  it('empty data still renders the frame with no petals', () => {
    const svg = roseSVG([], { binWidth: 10 });
    assert.ok(svg.includes('<circle'));
    assert.strictEqual((svg.match(/<path/g) || []).length, 0);
  });
});
