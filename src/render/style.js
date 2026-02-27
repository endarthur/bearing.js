/** @module style — Default style constants and merge utilities for stereonet rendering. */

/**
 * Deep-merge objects without mutation. undefined values are skipped,
 * arrays are replaced wholesale, nested plain objects are merged recursively.
 * @param {Object} target
 * @param {...Object} sources
 * @returns {Object} new merged object
 */
export function deepMerge(target, ...sources) {
  const result = { ...target };
  for (const source of sources) {
    if (!source) continue;
    for (const key of Object.keys(source)) {
      if (source[key] === undefined) continue;
      if (
        source[key] !== null &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        result[key] !== null &&
        typeof result[key] === 'object' &&
        !Array.isArray(result[key])
      ) {
        result[key] = deepMerge(result[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
  }
  return result;
}

/**
 * Three-level style resolution for a category.
 * Merges: defaults[category] → instanceStyle[category] → itemStyle.
 * Uses `!== undefined` so that 0, null, '' are valid overrides.
 * @param {string} category - e.g. 'pole', 'grid', 'background'
 * @param {Object|null} instanceStyle - instance-level style object
 * @param {Object|string|number} [itemStyle] - per-item overrides
 * @returns {Object|string|number} resolved style
 */
export function resolveStyle(category, instanceStyle, itemStyle) {
  const base = defaults[category];
  if (typeof base === 'object' && base !== null) {
    // Object category (pole, line, plane, cone, grid, primitive, cardinals)
    const result = { ...base };
    const inst = instanceStyle?.[category];
    if (inst && typeof inst === 'object') {
      for (const [k, v] of Object.entries(inst)) {
        if (v !== undefined) result[k] = v;
      }
    }
    if (itemStyle && typeof itemStyle === 'object') {
      for (const [k, v] of Object.entries(itemStyle)) {
        if (v !== undefined) result[k] = v;
      }
    }
    return result;
  }
  // Scalar category (e.g. 'background')
  if (itemStyle !== undefined) return itemStyle;
  const inst = instanceStyle?.[category];
  if (inst !== undefined) return inst;
  return base;
}

export const defaults = {
  size: 500,
  padding: 30,
  background: '#ffffff',
  primitive: {
    stroke: '#000000',
    strokeWidth: 1.5,
    fill: 'none',
  },
  grid: {
    stroke: '#cccccc',
    strokeWidth: 0.5,
    majorStroke: '#999999',
    majorStrokeWidth: 0.75,
  },
  cardinals: {
    fontSize: 14,
    fontFamily: 'sans-serif',
    fill: '#000000',
    offset: 16,
  },
  pole: {
    r: 3,
    fill: '#000000',
    stroke: 'none',
  },
  line: {
    r: 4,
    fill: '#000000',
    stroke: 'none',
  },
  plane: {
    stroke: '#000000',
    strokeWidth: 1.2,
    fill: 'none',
  },
  cone: {
    stroke: '#000000',
    strokeWidth: 1,
    fill: 'none',
    strokeDasharray: '4,3',
  },
};
