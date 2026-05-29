/**
 * @module color — Named colour scales and value→colour mapping for data-driven
 * styling (heatmap fills, coloured points). Dependency-free, small control-point
 * ramps with linear RGB interpolation — visualisation quality, not colorimetric.
 */

/** Built-in ramps as evenly-spaced RGB control points (t = 0 → 1). */
export const scales = {
  viridis: [[68, 1, 84], [59, 82, 139], [33, 145, 140], [94, 201, 98], [253, 231, 37]],
  magma: [[0, 0, 4], [81, 18, 124], [183, 55, 121], [252, 137, 97], [252, 253, 191]],
  inferno: [[0, 0, 4], [87, 16, 110], [188, 55, 84], [249, 142, 9], [252, 255, 164]],
  plasma: [[13, 8, 135], [126, 3, 168], [204, 71, 120], [248, 149, 64], [240, 249, 33]],
  grayscale: [[0, 0, 0], [255, 255, 255]],
  // Matches the Stereonet default heatmap ramp (pale paper → maroon).
  thermal: [[255, 245, 200], [246, 177, 74], [224, 96, 62], [120, 20, 30]],
};

function interp(stops, t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  const seg = (stops.length - 1) * x;
  const i = Math.min(stops.length - 2, Math.floor(seg));
  const f = seg - i;
  const a = stops[i], b = stops[i + 1];
  return [
    Math.round(a[0] + f * (b[0] - a[0])),
    Math.round(a[1] + f * (b[1] - a[1])),
    Math.round(a[2] + f * (b[2] - a[2])),
  ];
}

/**
 * Sample a named scale at t∈[0,1] (clamped). Unknown names fall back to viridis.
 * @returns {string} CSS `rgb(r,g,b)`
 */
export function sampleScale(name, t) {
  const [r, g, b] = interp(scales[name] || scales.viridis, t);
  return `rgb(${r},${g},${b})`;
}

/**
 * Return an interpolator t∈[0,1] → CSS rgb() for a named scale.
 * @param {string} name
 * @param {Object} [options] @param {boolean} [options.reverse=false]
 * @returns {(t:number)=>string}
 */
export function colorScale(name, options = {}) {
  const stops = scales[name] || scales.viridis;
  const reverse = !!options.reverse;
  return (t) => {
    const [r, g, b] = interp(stops, reverse ? 1 - t : t);
    return `rgb(${r},${g},${b})`;
  };
}

/**
 * Map a value within [min,max] to a colour on a named scale.
 * @returns {string} CSS `rgb(r,g,b)`
 */
export function mapValue(name, value, min, max, options) {
  const t = max > min ? (value - min) / (max - min) : 0;
  return colorScale(name, options)(t);
}
