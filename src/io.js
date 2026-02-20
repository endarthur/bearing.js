/** @module io — Attitude string parsing (ported from auttitude's io.py). */

import { planeToDcos, lineToDcos, strikeToDD } from './core/conversions.js';

/**
 * Parse a direction string into degrees (0-360 azimuth).
 *
 * Accepts:
 *   - Plain numbers: "120" → 120
 *   - Quadrant notation: "N45E" → 45, "S30W" → 210, "N0" → 0, "S30E" → 150
 *
 * @param {string} s - direction string
 * @returns {number} azimuth in degrees
 */
export function parseDirection(s) {
  s = s.trim().toUpperCase();

  // Plain number
  if (/^-?\d+(\.\d+)?$/.test(s)) return ((parseFloat(s) % 360) + 360) % 360;

  // Quadrant notation: starts with N or S, optional angle, optional E or W
  const m = s.match(/^([NS])(\d+(?:\.\d+)?)([EW])?$/);
  if (!m) throw new Error(`Cannot parse direction: "${s}"`);

  const from = m[1]; // N or S
  const angle = parseFloat(m[2]);
  const to = m[3] || ''; // E, W, or empty

  if (from === 'N') {
    if (to === 'E' || to === '') return angle;
    if (to === 'W') return (360 - angle) % 360;
  }
  if (from === 'S') {
    if (to === 'E') return 180 - angle;
    if (to === 'W') return 180 + angle;
    // S with no E/W — treat as due south + angle east
    return 180 - angle;
  }

  throw new Error(`Cannot parse direction: "${s}"`);
}

/**
 * Parse a dip string into { dip, quadrant }.
 *
 * Accepts:
 *   - Plain numbers: "45" → { dip: 45, quadrant: '' }
 *   - With quadrant: "45NE" → { dip: 45, quadrant: 'NE' }
 *
 * @param {string} s - dip string
 * @returns {{ dip: number, quadrant: string }}
 */
export function parseDip(s) {
  s = s.trim().toUpperCase();

  const m = s.match(/^(\d+(?:\.\d+)?)\s*([NESW]{0,2})$/);
  if (!m) throw new Error(`Cannot parse dip: "${s}"`);

  return { dip: parseFloat(m[1]), quadrant: m[2] || '' };
}

/**
 * Quadrant string to azimuth of the dip direction.
 * @param {string} q - one or two character cardinal string (e.g. 'NE', 'W', 'S')
 * @returns {number} azimuth in degrees
 */
function quadrantToAzimuth(q) {
  const map = {
    N: 0, NE: 45, E: 90, SE: 135,
    S: 180, SW: 225, W: 270, NW: 315,
  };
  if (!(q in map)) throw new Error(`Unknown dip quadrant: "${q}"`);
  return map[q];
}

/**
 * Translate a parsed direction + dip into [dipDirection, dip].
 *
 * Full port of auttitude's translate_attitude logic:
 *   - If strike=false (default): direction is dip-direction, quadrant is ignored.
 *   - If strike=true: direction is strike.
 *     - With no quadrant: use right-hand rule (dip direction = strike + 90).
 *     - With quadrant: pick the side of the strike that matches the quadrant.
 *
 * @param {number} direction - parsed azimuth (degrees)
 * @param {number} dip - dip angle (degrees)
 * @param {string} quadrant - dip quadrant ('' or cardinal like 'NE', 'W')
 * @param {boolean} [strike=false] - interpret direction as strike
 * @returns {number[]} [dipDirection, dip]
 */
export function translateAttitude(direction, dip, quadrant, strike = false) {
  if (!strike) {
    // Dip-direction mode: direction is already the dip direction
    return [((direction % 360) + 360) % 360, dip];
  }

  // Strike mode
  if (!quadrant) {
    // Right-hand rule: dip direction = strike + 90
    return [((direction + 90) % 360 + 360) % 360, dip];
  }

  // Strike + quadrant: determine which side of strike matches the quadrant
  const qAz = quadrantToAzimuth(quadrant);

  // Two candidate dip directions (strike + 90 and strike - 90)
  const dd1 = ((direction + 90) % 360 + 360) % 360;
  const dd2 = ((direction - 90) % 360 + 360) % 360;

  // Pick the candidate closest to the quadrant azimuth
  const diff1 = Math.abs(angleDiff(dd1, qAz));
  const diff2 = Math.abs(angleDiff(dd2, qAz));

  return [diff1 <= diff2 ? dd1 : dd2, dip];
}

/**
 * Signed angular difference (shortest path), result in [-180, 180].
 */
function angleDiff(a, b) {
  let d = ((b - a) % 360 + 360) % 360;
  if (d > 180) d -= 360;
  return d;
}

/**
 * Parse a multi-line text block into raw [direction, dip] number pairs.
 * Handles delimiters: / , space tab
 * Skips # comment lines and blank lines.
 *
 * @param {string} text
 * @returns {Array<[number, number]>}
 */
export function parse(text) {
  const results = [];
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/[\/,\s\t]+/).filter(Boolean);
    if (parts.length < 2) continue;

    const a = parseFloat(parts[0]);
    const b = parseFloat(parts[1]);
    if (isNaN(a) || isNaN(b)) continue;

    results.push([a, b]);
  }

  return results;
}

/**
 * Parse a text block as plane attitudes and return direction cosines.
 *
 * Each line can be:
 *   - Two numbers: direction and dip
 *   - Quadrant notation direction and dip with optional quadrant
 *
 * @param {string} text
 * @param {Object} [options]
 * @param {boolean} [options.strike=false] - treat first column as strike
 * @returns {Array<number[]>} array of dcos (pole to plane)
 */
export function parsePlanes(text, options = {}) {
  const strike = !!options.strike;
  const results = [];
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/[\/,\s\t]+/).filter(Boolean);
    if (parts.length < 2) continue;

    let direction, dipVal, quadrant;
    try {
      direction = parseDirection(parts[0]);
      const parsed = parseDip(parts[1]);
      dipVal = parsed.dip;
      quadrant = parsed.quadrant;
    } catch {
      continue; // skip unparseable lines
    }

    const [dd, dip] = translateAttitude(direction, dipVal, quadrant, strike);
    results.push(planeToDcos(dd, dip));
  }

  return results;
}

/**
 * Parse a text block as line attitudes and return direction cosines.
 *
 * Each line: trend plunge (plain numbers).
 *
 * @param {string} text
 * @returns {Array<number[]>} array of line dcos
 */
export function parseLines(text) {
  const results = [];
  const lines = text.split(/\r?\n/);

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const parts = line.split(/[\/,\s\t]+/).filter(Boolean);
    if (parts.length < 2) continue;

    const trend = parseFloat(parts[0]);
    const plunge = parseFloat(parts[1]);
    if (isNaN(trend) || isNaN(plunge)) continue;

    results.push(lineToDcos(trend, plunge));
  }

  return results;
}
