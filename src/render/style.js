/** @module style — Default style constants for stereonet rendering. */

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
