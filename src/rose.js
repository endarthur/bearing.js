/**
 * @module rose — Rose diagram binning and petal geometry.
 *
 * A rose diagram bins azimuthal directions into equal-width angular sectors and
 * draws a petal per sector with length proportional to the count (or its square
 * root, so petal *area* tracks count). Azimuth is measured in degrees clockwise
 * from North (0 = N, 90 = E), matching the rest of the library.
 *
 * The binning and geometry here are DOM-free and reusable; roseSVG() is a thin
 * convenience that assembles a complete diagram via SvgBuilder.
 */

import { SvgBuilder } from './render/svg.js';

const DEG = Math.PI / 180;

/** Point on a circle at azimuth `azDeg` (0 = N/up, clockwise), in screen coords (y down). */
function petalPoint(cx, cy, r, azDeg) {
  const a = azDeg * DEG;
  return [cx + r * Math.sin(a), cy - r * Math.cos(a)];
}

/**
 * Bin azimuthal directions into equal-width sectors.
 *
 * Sectors are centred on 0, binWidth, 2·binWidth, … so the first sector
 * straddles North — the usual rose convention.
 *
 * @param {number[]} azimuths - directions in degrees (any range; wrapped to [0,360))
 * @param {Object} [options]
 * @param {number} [options.binWidth=10] - sector width in degrees; 360 must be divisible by it
 * @param {boolean} [options.axial=false] - axial data (strikes/lineations): each datum also counts at +180°
 * @returns {{ bins: Array<{startDeg:number,endDeg:number,midDeg:number,count:number,frequency:number}>,
 *             binWidth:number, n:number, maxCount:number, maxFrequency:number, axial:boolean }}
 */
export function roseBins(azimuths, options = {}) {
  const binWidth = options.binWidth || 10;
  const axial = !!options.axial;
  const nBins = Math.round(360 / binWidth);
  const counts = new Array(nBins).fill(0);

  const add = (az) => {
    const a = ((az % 360) + 360) % 360;
    // Shift by half a bin so sectors are centred on multiples of binWidth.
    const idx = Math.floor((a + binWidth / 2) / binWidth) % nBins;
    counts[idx]++;
  };
  for (const az of azimuths) {
    if (!Number.isFinite(az)) continue;
    add(az);
    if (axial) add(az + 180);
  }

  let n = 0, maxCount = 0;
  for (const c of counts) { n += c; if (c > maxCount) maxCount = c; }

  const bins = counts.map((count, i) => {
    const midDeg = i * binWidth;
    return {
      startDeg: midDeg - binWidth / 2,
      endDeg: midDeg + binWidth / 2,
      midDeg,
      count,
      frequency: n > 0 ? count / n : 0,
    };
  });

  return {
    bins,
    binWidth,
    n,
    maxCount,
    maxFrequency: n > 0 ? maxCount / n : 0,
    axial,
  };
}

/**
 * Build petal polygons for a binned rose. Each petal is a closed point ring
 * (a wedge from the centre, or a donut segment when innerRadius > 0) with the
 * outer edge sampled along the arc.
 *
 * @param {ReturnType<typeof roseBins>} binned
 * @param {Object} [options]
 * @param {number} [options.cx=0] @param {number} [options.cy=0] - centre in output coords
 * @param {number} [options.radius=100] - radius of the largest (max-count) petal
 * @param {number} [options.innerRadius=0] - inner radius (donut roses)
 * @param {'linear'|'sqrt'} [options.scale='linear'] - petal-length scaling vs count
 * @returns {Array<{ bin:Object, points:number[][], radius:number }>} one entry per non-empty sector
 */
export function rosePetals(binned, options = {}) {
  const cx = options.cx ?? 0;
  const cy = options.cy ?? 0;
  const R = options.radius ?? 100;
  const r0 = options.innerRadius ?? 0;
  const scale = options.scale || 'linear';
  const max = binned.maxCount || 1;
  const samples = Math.max(1, Math.round(binned.binWidth / 5));

  const petals = [];
  for (const bin of binned.bins) {
    if (bin.count <= 0) continue;
    const frac = scale === 'sqrt' ? Math.sqrt(bin.count / max) : bin.count / max;
    const r1 = r0 + (R - r0) * frac;
    const points = [];

    if (r0 > 1e-9) points.push(petalPoint(cx, cy, r0, bin.startDeg));
    else points.push([cx, cy]);

    for (let s = 0; s <= samples; s++) {
      const az = bin.startDeg + (bin.endDeg - bin.startDeg) * (s / samples);
      points.push(petalPoint(cx, cy, r1, az));
    }

    if (r0 > 1e-9) {
      for (let s = samples; s >= 0; s--) {
        const az = bin.startDeg + (bin.endDeg - bin.startDeg) * (s / samples);
        points.push(petalPoint(cx, cy, r0, az));
      }
    }

    petals.push({ bin, points, radius: r1 });
  }
  return petals;
}

const r2 = (x) => Math.round(x * 100) / 100;

/**
 * Assemble a complete rose diagram as an SVG string.
 *
 * @param {number[]} azimuths - directions in degrees
 * @param {Object} [options] - roseBins options plus:
 * @param {number} [options.size=300] @param {number} [options.padding=20]
 * @param {number} [options.rings=0] - number of radial grid rings
 * @param {'linear'|'sqrt'} [options.scale='linear']
 * @param {number} [options.innerRadius=0]
 * @param {string} [options.fill='#e8920c'] @param {number} [options.fillOpacity=0.8]
 * @param {string} [options.petalStroke='#7a4a06'] @param {number} [options.petalStrokeWidth=0.5]
 * @param {string} [options.frameStroke='#999'] @param {string} [options.background='none']
 * @returns {string} SVG markup
 */
export function roseSVG(azimuths, options = {}) {
  const size = options.size || 300;
  const pad = options.padding ?? 20;
  const cx = size / 2, cy = size / 2;
  const radius = (size - 2 * pad) / 2;

  const binned = roseBins(azimuths, options);
  const svg = new SvgBuilder(size, size);

  svg.circle(cx, cy, radius, {
    fill: options.background || 'none',
    stroke: options.frameStroke || '#999',
    'stroke-width': 1,
  });

  const rings = options.rings ?? 0;
  for (let i = 1; i < rings; i++) {
    svg.circle(cx, cy, radius * i / rings, { fill: 'none', stroke: '#ddd', 'stroke-width': 0.5 });
  }

  const petals = rosePetals(binned, {
    cx, cy, radius,
    scale: options.scale,
    innerRadius: options.innerRadius,
  });
  for (const p of petals) {
    const d = 'M' + p.points.map(([x, y]) => `${r2(x)},${r2(y)}`).join('L') + 'Z';
    svg.path(d, {
      fill: options.fill || '#e8920c',
      'fill-opacity': options.fillOpacity ?? 0.8,
      stroke: options.petalStroke || '#7a4a06',
      'stroke-width': options.petalStrokeWidth ?? 0.5,
    });
  }

  return svg.toString();
}
