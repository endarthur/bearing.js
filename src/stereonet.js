/**
 * @module stereonet — Main public API for stereonet plotting.
 */

import { planeToDcos, lineToDcos } from './core/conversions.js';
import * as curves from './core/curves.js';
import * as vec3 from './core/vec3.js';
import * as mat3 from './core/mat3.js';
import { project as equalAreaProject } from './projections/equal-area.js';
import { project as equalAngleProject } from './projections/equal-angle.js';
import { generateNet } from './render/net.js';
import { SvgBuilder } from './render/svg.js';
import { defaults, resolveStyle } from './render/style.js';
import { computeContours } from './contouring.js';

const DEG = Math.PI / 180;
const SVG_NS = 'http://www.w3.org/2000/svg';

let nextClipId = 0;

/**
 * Linearly interpolate to find equator crossing between two 3D points.
 * Returns a point normalized to the unit sphere with z = 0.
 */
function equatorCrossing(a, b) {
  const t = a[2] / (a[2] - b[2]);
  const x = a[0] + t * (b[0] - a[0]);
  const y = a[1] + t * (b[1] - a[1]);
  const len = Math.sqrt(x * x + y * y);
  return len > 1e-10 ? [x / len, y / len, 0] : [x, y, 0];
}

/**
 * Clip a 3D polyline to the lower hemisphere (z <= 0).
 * Returns array of segments, each a contiguous run of lower-hemisphere points.
 * Interpolates exact equator crossings at segment boundaries.
 */
function clipToLowerHemisphere(points) {
  const segments = [];
  let current = [];

  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    if (p[2] <= 0) {
      if (current.length === 0 && i > 0 && points[i - 1][2] > 0) {
        current.push(equatorCrossing(points[i - 1], p));
      }
      current.push(p);
    } else {
      if (current.length > 0) {
        current.push(equatorCrossing(points[i - 1], p));
        segments.push(current);
        current = [];
      }
    }
  }

  if (current.length > 0) {
    segments.push(current);
  }

  return segments;
}

/**
 * Convert an array of SVG segment arrays to a path d attribute string.
 */
function segmentsToPathD(segments) {
  const parts = [];
  for (const seg of segments) {
    if (seg.length > 1) {
      parts.push('M' + seg.map(([x, y]) => `${x},${y}`).join('L'));
    }
  }
  return parts.join('');
}

export class Stereonet {
  constructor(options = {}) {
    this.size = options.size || defaults.size;
    this.padding = options.padding ?? defaults.padding;
    this.projection = options.projection || 'equal-area';
    this.net = options.net || 'equatorial';
    this.rotation = options.rotation ?? (options.center
      ? Stereonet.rotationFromCenter(options.center[0], options.center[1])
      : options.northPole
        ? Stereonet.rotationFromNorthPole(options.northPole[0], options.northPole[1], options.northPole[2] || 0)
        : null);
    this._instanceStyle = options.style || null;
    this._classPrefix = options.classPrefix !== undefined ? options.classPrefix : 'bearing';
    this._items = [];
    this._clipId = `bearing-clip-${nextClipId++}`;

    // Contour state
    this._contourDcos = null;
    this._contourOptions = null;
    this._contourPaths = null; // cached result of computeContours

    // DOM references (created by element(), updated by render())
    this._el = null;
    this._bgEl = null;
    this._gcPath = null;
    this._scPath = null;
    this._contourGroup = null;
    this._dataGroup = null;
    this._primEl = null;
    this._cardinalEls = null;
  }

  /**
   * Build a rotation matrix that maps direction (trend, plunge) to the
   * center of the stereonet [0, 0, -1].
   * @param {number} trend - trend in degrees
   * @param {number} plunge - plunge in degrees
   * @returns {Array<number>} 3x3 rotation matrix (flat row-major)
   */
  static rotationFromCenter(trend, plunge) {
    const d = lineToDcos(trend, plunge);
    const target = [0, 0, -1];
    const axis = vec3.cross(d, target);
    const len = vec3.length(axis);
    if (len < 1e-10) {
      return vec3.dot(d, target) > 0
        ? mat3.identity()
        : mat3.rotationFromAxisAngle([1, 0, 0], Math.PI);
    }
    const theta = vec3.angle(d, target);
    return mat3.rotationFromAxisAngle(vec3.normalize(axis), theta);
  }

  /**
   * Build a rotation matrix from north pole placement + spin.
   * (trend, plunge) specifies where geographic North [0,1,0] ends up;
   * spin is an additional rotation around the North axis before tilting.
   * @param {number} trend - trend of new North position in degrees
   * @param {number} plunge - plunge of new North position in degrees
   * @param {number} [spin=0] - rotation about the North axis in degrees
   * @returns {Array<number>} 3x3 rotation matrix (flat row-major)
   */
  static rotationFromNorthPole(trend, plunge, spin = 0) {
    const north = [0, 1, 0];
    const target = lineToDcos(trend, plunge);

    // Spin around the North axis
    const Rspin = mat3.rotationFromAxisAngle(north, spin * DEG);

    // Tilt: minimal rotation mapping North to the target direction
    const axis = vec3.cross(north, target);
    const len = vec3.length(axis);
    let Rtilt;
    if (len < 1e-10) {
      Rtilt = vec3.dot(north, target) > 0
        ? mat3.identity()
        : mat3.rotationFromAxisAngle([1, 0, 0], Math.PI);
    } else {
      const theta = vec3.angle(north, target);
      Rtilt = mat3.rotationFromAxisAngle(vec3.normalize(axis), theta);
    }

    return mat3.multiply(Rtilt, Rspin);
  }

  get _projectFn() {
    return this.projection === 'equal-angle' ? equalAngleProject : equalAreaProject;
  }

  /** Primitive circle radius in SVG coordinates. */
  get _radius() {
    return (this.size - 2 * this.padding) / 2;
  }

  get _center() {
    return this.size / 2;
  }

  /**
   * Scale factor: maps projection output (radius √2 for equal-area, 1 for equal-angle)
   * to SVG pixel coordinates.
   */
  get _scale() {
    const projRadius = this.projection === 'equal-angle' ? 1 : Math.SQRT2;
    return this._radius / projRadius;
  }

  /** Convert projected [px, py] to SVG [x, y]. */
  _toSvg(px, py) {
    const c = this._center;
    const s = this._scale;
    return [c + px * s, c - py * s];
  }

  /** Resolve style for a category using the three-level cascade. */
  _resolveCategory(category, itemStyle) {
    return resolveStyle(category, this._instanceStyle, itemStyle);
  }

  /** Build CSS class string for an SVG element. Returns undefined if classes disabled. */
  _classFor(suffix, extraClass) {
    if (this._classPrefix === null) return undefined;
    const base = `${this._classPrefix}-${suffix}`;
    return extraClass ? `${base} ${extraClass}` : base;
  }

  /**
   * Update the instance-level style at runtime. Call render() to apply.
   * @param {Object} style - instance style overrides
   * @returns {this}
   */
  setStyle(style) {
    this._instanceStyle = style;
    return this;
  }

  /** Rotate a 3D point by the stereonet's rotation matrix. */
  _rotate(p) {
    return this.rotation ? mat3.transformVec3(this.rotation, p) : p;
  }

  /**
   * Process a 3D curve: rotate, clip to lower hemisphere, project to SVG.
   * Returns array of SVG polyline coordinate arrays (one per visible segment).
   */
  _projectCurve(points3d) {
    const rotated = this.rotation
      ? points3d.map(p => mat3.transformVec3(this.rotation, p))
      : points3d;
    const segments = clipToLowerHemisphere(rotated);
    return segments.map(seg =>
      seg.map(p => {
        const [px, py] = this._projectFn(p);
        return this._toSvg(px, py);
      })
    );
  }

  // ---------------------------------------------------------------------------
  //  Data methods — push items, return `this` for chaining
  // ---------------------------------------------------------------------------

  /** Read-only access to the items array. */
  get items() {
    return this._items;
  }

  /**
   * Plot pole to a plane. dd = dip direction, dip = dip angle (degrees).
   */
  pole(dd, dip, style = {}) {
    this._items.push({ type: 'pole', dd, dip, style, _el: null });
    return this;
  }

  /**
   * Plot a line (trend/plunge). trend and plunge in degrees.
   */
  line(trend, plunge, style = {}) {
    this._items.push({ type: 'line', trend, plunge, style, _el: null });
    return this;
  }

  /**
   * Plot a great circle for a plane. dd = dip direction, dip = dip angle.
   */
  plane(dd, dip, style = {}) {
    this._items.push({ type: 'plane', dd, dip, style, _el: null });
    return this;
  }

  /**
   * Plot a small circle (cone). trend/plunge in degrees, halfAngle in degrees.
   */
  cone(trend, plunge, halfAngle, style = {}) {
    this._items.push({ type: 'cone', trend, plunge, halfAngle, style, _el: null });
    return this;
  }

  /**
   * Add density contour lines for a set of direction cosines.
   * @param {Array<number[]>} dcos - unit vectors (lower hemisphere)
   * @param {Object} [options]
   * @param {number[]} [options.levels=[2,4,6,8]] - MUD levels
   * @param {number}  [options.sigma] - kernel half-width degrees (auto if omitted)
   * @param {number}  [options.gridSize=40] - grid resolution
   * @param {string}  [options.stroke='#333'] - line colour
   * @param {number}  [options.strokeWidth=0.8]
   * @param {string[]} [options.colors] - per-level stroke colours (overrides stroke)
   * @returns {this}
   */
  contour(dcos, options = {}) {
    this._contourDcos = dcos;
    this._contourOptions = options;
    this._computeContours();
    return this;
  }

  /** Recompute contours (call after rotation changes if contours are active). */
  updateContours() {
    this._computeContours();
    return this;
  }

  /** Remove contour data. Returns `this`. */
  clearContours() {
    this._contourDcos = null;
    this._contourOptions = null;
    this._contourPaths = null;
    if (this._contourGroup) {
      while (this._contourGroup.firstChild) this._contourGroup.firstChild.remove();
    }
    return this;
  }

  _computeContours() {
    if (!this._contourDcos || this._contourDcos.length === 0) {
      this._contourPaths = null;
      return;
    }
    this._contourPaths = computeContours(this._contourDcos, {
      projection: this.projection,
      rotation: this.rotation,
      ...this._contourOptions,
    });
  }

  /** Remove all data items. Returns `this`. */
  clear() {
    for (const item of this._items) {
      if (item._el) item._el.remove();
    }
    this._items.length = 0;
    return this;
  }

  /** Remove a specific item (by reference from .items). Returns `this`. */
  remove(item) {
    const idx = this._items.indexOf(item);
    if (idx >= 0) {
      if (item._el) item._el.remove();
      this._items.splice(idx, 1);
    }
    return this;
  }

  // ---------------------------------------------------------------------------
  //  View control
  // ---------------------------------------------------------------------------

  /** Set rotation matrix. Call render() to apply. Returns `this`. */
  setRotation(rotation) {
    this.rotation = rotation;
    return this;
  }

  /** Set rotation by center direction. Call render() to apply. Returns `this`. */
  setCenter(trend, plunge) {
    this.rotation = Stereonet.rotationFromCenter(trend, plunge);
    return this;
  }

  /** Set rotation by north pole placement + spin. Call render() to apply. Returns `this`. */
  setNorthPole(trend, plunge, spin = 0) {
    this.rotation = Stereonet.rotationFromNorthPole(trend, plunge, spin);
    return this;
  }

  // ---------------------------------------------------------------------------
  //  Static SVG string output (works in Node, no DOM)
  // ---------------------------------------------------------------------------

  /**
   * Build and return the SVG as a string.
   */
  svg() {
    const svg = new SvgBuilder(this.size, this.size);
    const c = this._center;
    const r = this._radius;

    svg.circle(c, c, r, {
      fill: this._resolveCategory('background'),
      stroke: 'none',
      class: this._classFor('background'),
    });
    svg.clipCircle(this._clipId, c, c, r);
    svg.openClipGroup(this._clipId);

    // Grid
    const gridStyle = this._resolveCategory('grid');
    const { greatCircles, smallCircles } = generateNet(10, this.net);
    for (const gc of greatCircles) {
      for (const seg of this._projectCurve(gc)) {
        if (seg.length > 1) {
          svg.polyline(seg, {
            stroke: gridStyle.stroke,
            'stroke-width': gridStyle.strokeWidth,
            class: this._classFor('grid'),
          });
        }
      }
    }
    for (const sc of smallCircles) {
      for (const seg of this._projectCurve(sc)) {
        if (seg.length > 1) {
          svg.polyline(seg, {
            stroke: gridStyle.stroke,
            'stroke-width': gridStyle.strokeWidth,
            class: this._classFor('grid'),
          });
        }
      }
    }

    // Contours
    if (this._contourPaths) {
      this._renderContoursString(svg);
    }

    // Data
    for (const item of this._items) {
      this._renderItemString(svg, item);
    }

    svg.closeGroup();

    // Primitive circle
    const primStyle = this._resolveCategory('primitive');
    svg.circle(c, c, r, {
      fill: 'none',
      stroke: primStyle.stroke,
      'stroke-width': primStyle.strokeWidth,
      class: this._classFor('primitive'),
    });

    // Cardinals
    this._renderCardinalsString(svg, c, r);

    return svg.toString();
  }

  _renderCardinalsString(svg, cx, r) {
    const cardStyle = this._resolveCategory('cardinals');
    const offset = cardStyle.offset;
    const style = {
      'font-size': cardStyle.fontSize,
      'font-family': cardStyle.fontFamily,
      fill: cardStyle.fill,
      'text-anchor': 'middle',
      'dominant-baseline': 'central',
      class: this._classFor('cardinal'),
    };

    const directions = [
      { label: 'N', dcos: [0, 1, 0] },
      { label: 'E', dcos: [1, 0, 0] },
      { label: 'S', dcos: [0, -1, 0] },
      { label: 'W', dcos: [-1, 0, 0] },
    ];

    for (const { label, dcos } of directions) {
      const d = this._rotate(dcos);
      const hLen = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
      if (hLen < 0.05) continue;
      svg.text(
        cx + (r + offset) * d[0] / hLen,
        cx - (r + offset) * d[1] / hLen,
        label,
        style,
      );
    }
  }

  _renderContoursString(svg) {
    const opts = this._contourOptions || {};
    const defaultStroke = opts.stroke || '#333';
    const defaultWidth = opts.strokeWidth || 0.8;
    const colors = opts.colors;
    const cls = this._classFor('contour');

    for (let k = 0; k < this._contourPaths.length; k++) {
      const { paths } = this._contourPaths[k];
      const stroke = colors && colors[k] ? colors[k] : defaultStroke;
      for (const path of paths) {
        const svgPts = path.map(([px, py]) => this._toSvg(px, py));
        if (svgPts.length > 1) {
          svg.polyline(svgPts, {
            stroke,
            'stroke-width': defaultWidth,
            fill: 'none',
            class: cls,
          });
        }
      }
    }
  }

  _renderItemString(svg, item) {
    switch (item.type) {
      case 'pole': {
        const dcos = planeToDcos(item.dd, item.dip);
        const d = this._rotate(dcos);
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const s = this._resolveCategory('pole', item.style);
        svg.circle(sx, sy, s.r, {
          fill: s.fill,
          stroke: s.stroke,
          class: this._classFor('pole', item.style.class),
        });
        break;
      }
      case 'line': {
        const dcos = lineToDcos(item.trend, item.plunge);
        const d = this._rotate(dcos);
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const s = this._resolveCategory('line', item.style);
        svg.circle(sx, sy, s.r, {
          fill: s.fill,
          stroke: s.stroke,
          class: this._classFor('line', item.style.class),
        });
        break;
      }
      case 'plane': {
        const pole = planeToDcos(item.dd, item.dip);
        const pts3d = curves.greatCircle(pole, 180);
        const s = this._resolveCategory('plane', item.style);
        for (const seg of this._projectCurve(pts3d)) {
          if (seg.length > 1) {
            svg.polyline(seg, {
              stroke: s.stroke,
              'stroke-width': s.strokeWidth,
              fill: 'none',
              class: this._classFor('plane', item.style.class),
            });
          }
        }
        break;
      }
      case 'cone': {
        const axis = lineToDcos(item.trend, item.plunge);
        const halfAngle = item.halfAngle * DEG;
        const pts3d = curves.smallCircle(axis, halfAngle, 180);
        const s = this._resolveCategory('cone', item.style);
        for (const seg of this._projectCurve(pts3d)) {
          if (seg.length > 1) {
            svg.polyline(seg, {
              stroke: s.stroke,
              'stroke-width': s.strokeWidth,
              fill: 'none',
              'stroke-dasharray': s.strokeDasharray,
              class: this._classFor('cone', item.style.class),
            });
          }
        }
        break;
      }
    }
  }

  // ---------------------------------------------------------------------------
  //  DOM rendering — persistent SVG element, in-place attribute updates
  // ---------------------------------------------------------------------------

  /**
   * Return the persistent SVG DOM element (browser only).
   * Creates and renders on first call; subsequent calls return the same element.
   * Call render() after changing data or rotation to update.
   */
  element() {
    if (!this._el) {
      this._buildDOM();
      this.render();
    }
    return this._el;
  }

  /** Build the persistent SVG DOM structure. */
  _buildDOM() {
    const s = this.size;
    const c = this._center;
    const r = this._radius;

    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('xmlns', SVG_NS);
    svg.setAttribute('width', s);
    svg.setAttribute('height', s);
    svg.setAttribute('viewBox', `0 0 ${s} ${s}`);

    // Background
    this._bgEl = document.createElementNS(SVG_NS, 'circle');
    setAttrs(this._bgEl, {
      cx: c, cy: c, r,
      fill: this._resolveCategory('background'),
      stroke: 'none',
      class: this._classFor('background'),
    });
    svg.appendChild(this._bgEl);

    // Clip definition
    const defs = document.createElementNS(SVG_NS, 'defs');
    const clipPath = document.createElementNS(SVG_NS, 'clipPath');
    clipPath.setAttribute('id', this._clipId);
    const clipCircle = document.createElementNS(SVG_NS, 'circle');
    setAttrs(clipCircle, { cx: c, cy: c, r });
    clipPath.appendChild(clipCircle);
    defs.appendChild(clipPath);
    svg.appendChild(defs);

    // Clipped group: grid + data
    const clipGroup = document.createElementNS(SVG_NS, 'g');
    clipGroup.setAttribute('clip-path', `url(#${this._clipId})`);

    // Grid — two <path> elements (one setAttribute call each to update)
    const gridStyle = this._resolveCategory('grid');
    this._gcPath = document.createElementNS(SVG_NS, 'path');
    setAttrs(this._gcPath, {
      stroke: gridStyle.stroke,
      'stroke-width': gridStyle.strokeWidth,
      fill: 'none',
      class: this._classFor('grid'),
    });
    clipGroup.appendChild(this._gcPath);

    this._scPath = document.createElementNS(SVG_NS, 'path');
    setAttrs(this._scPath, {
      stroke: gridStyle.stroke,
      'stroke-width': gridStyle.strokeWidth,
      fill: 'none',
      class: this._classFor('grid'),
    });
    clipGroup.appendChild(this._scPath);

    // Contour group (between grid and data)
    this._contourGroup = document.createElementNS(SVG_NS, 'g');
    clipGroup.appendChild(this._contourGroup);

    // Data group
    this._dataGroup = document.createElementNS(SVG_NS, 'g');
    clipGroup.appendChild(this._dataGroup);

    svg.appendChild(clipGroup);

    // Primitive circle
    const primStyle = this._resolveCategory('primitive');
    this._primEl = document.createElementNS(SVG_NS, 'circle');
    setAttrs(this._primEl, {
      cx: c, cy: c, r,
      fill: 'none',
      stroke: primStyle.stroke,
      'stroke-width': primStyle.strokeWidth,
      class: this._classFor('primitive'),
    });
    svg.appendChild(this._primEl);

    // Cardinal labels — 4 pre-created <text> elements
    const cardStyle = this._resolveCategory('cardinals');
    this._cardinalEls = [];
    for (const label of ['N', 'E', 'S', 'W']) {
      const text = document.createElementNS(SVG_NS, 'text');
      setAttrs(text, {
        'font-size': cardStyle.fontSize,
        'font-family': cardStyle.fontFamily,
        fill: cardStyle.fill,
        'text-anchor': 'middle',
        'dominant-baseline': 'central',
        class: this._classFor('cardinal'),
      });
      text.textContent = label;
      svg.appendChild(text);
      this._cardinalEls.push(text);
    }

    this._el = svg;
  }

  /**
   * Update the persistent DOM element in place.
   * No-op if element() hasn't been called yet.
   * Returns `this`.
   */
  render() {
    if (!this._el) return this;

    // Update structural styles (supports setStyle() at runtime)
    const gridStyle = this._resolveCategory('grid');
    const primStyle = this._resolveCategory('primitive');
    this._bgEl.setAttribute('fill', this._resolveCategory('background'));
    setAttrs(this._gcPath, { stroke: gridStyle.stroke, 'stroke-width': gridStyle.strokeWidth });
    setAttrs(this._scPath, { stroke: gridStyle.stroke, 'stroke-width': gridStyle.strokeWidth });
    setAttrs(this._primEl, { stroke: primStyle.stroke, 'stroke-width': primStyle.strokeWidth });

    // Grid — one setAttribute('d', ...) per path
    const { greatCircles, smallCircles } = generateNet(10, this.net);
    this._gcPath.setAttribute('d', this._curvesToPathD(greatCircles));
    this._scPath.setAttribute('d', this._curvesToPathD(smallCircles));

    // Contours
    this._renderContoursDOM();

    // Data items — create/update DOM elements in place
    for (const item of this._items) {
      this._renderItemDOM(item);
    }

    // Cardinals — update positions
    this._renderCardinalsDOM();

    return this;
  }

  /** Convert an array of 3D curves to a combined SVG path d string. */
  _curvesToPathD(curves3d) {
    const parts = [];
    for (const curve of curves3d) {
      for (const seg of this._projectCurve(curve)) {
        if (seg.length > 1) {
          parts.push('M' + seg.map(([x, y]) => `${x},${y}`).join('L'));
        }
      }
    }
    return parts.join('');
  }

  /** Create or update the DOM element for a data item. */
  _renderItemDOM(item) {
    switch (item.type) {
      case 'pole': {
        const dcos = planeToDcos(item.dd, item.dip);
        const d = this._rotate(dcos);
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const s = this._resolveCategory('pole', item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, 'circle');
          setAttrs(item._el, { class: this._classFor('pole', item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          cx: sx, cy: sy,
          r: s.r,
          fill: s.fill,
          stroke: s.stroke,
        });
        break;
      }
      case 'line': {
        const dcos = lineToDcos(item.trend, item.plunge);
        const d = this._rotate(dcos);
        const [px, py] = this._projectFn(d);
        const [sx, sy] = this._toSvg(px, py);
        const s = this._resolveCategory('line', item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, 'circle');
          setAttrs(item._el, { class: this._classFor('line', item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          cx: sx, cy: sy,
          r: s.r,
          fill: s.fill,
          stroke: s.stroke,
        });
        break;
      }
      case 'plane': {
        const pole = planeToDcos(item.dd, item.dip);
        const pts3d = curves.greatCircle(pole, 180);
        const d = segmentsToPathD(this._projectCurve(pts3d));
        const s = this._resolveCategory('plane', item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, 'path');
          setAttrs(item._el, { class: this._classFor('plane', item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          d,
          stroke: s.stroke,
          'stroke-width': s.strokeWidth,
          fill: 'none',
        });
        break;
      }
      case 'cone': {
        const axis = lineToDcos(item.trend, item.plunge);
        const halfAngle = item.halfAngle * DEG;
        const pts3d = curves.smallCircle(axis, halfAngle, 180);
        const d = segmentsToPathD(this._projectCurve(pts3d));
        const s = this._resolveCategory('cone', item.style);
        if (!item._el) {
          item._el = document.createElementNS(SVG_NS, 'path');
          setAttrs(item._el, { class: this._classFor('cone', item.style.class) });
          this._dataGroup.appendChild(item._el);
        }
        setAttrs(item._el, {
          d,
          stroke: s.stroke,
          'stroke-width': s.strokeWidth,
          fill: 'none',
          'stroke-dasharray': s.strokeDasharray,
        });
        break;
      }
    }
  }

  /** Update contour paths in the DOM. */
  _renderContoursDOM() {
    if (!this._contourGroup) return;
    // Clear previous contour elements
    while (this._contourGroup.firstChild) this._contourGroup.firstChild.remove();

    if (!this._contourPaths) return;

    const opts = this._contourOptions || {};
    const defaultStroke = opts.stroke || '#333';
    const defaultWidth = opts.strokeWidth || 0.8;
    const colors = opts.colors;
    const cls = this._classFor('contour');

    for (let k = 0; k < this._contourPaths.length; k++) {
      const { paths } = this._contourPaths[k];
      const stroke = colors && colors[k] ? colors[k] : defaultStroke;
      for (const path of paths) {
        const svgPts = path.map(([px, py]) => this._toSvg(px, py));
        if (svgPts.length > 1) {
          const d = 'M' + svgPts.map(([x, y]) => `${x},${y}`).join('L');
          const el = document.createElementNS(SVG_NS, 'path');
          setAttrs(el, { d, stroke, 'stroke-width': defaultWidth, fill: 'none', class: cls });
          this._contourGroup.appendChild(el);
        }
      }
    }
  }

  /**
   * Return the SVG as a data: URI suitable for an <img> src or download.
   * @returns {string} data:image/svg+xml;... URI
   */
  svgDataURL() {
    const svgStr = this.svg();
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgStr);
  }

  /**
   * Trigger a browser download of the SVG (browser-only).
   * @param {string} [filename='stereonet.svg']
   */
  download(filename = 'stereonet.svg') {
    const url = this.svgDataURL();
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  /** Update cardinal label positions in the DOM. */
  _renderCardinalsDOM() {
    const cx = this._center;
    const r = this._radius;
    const cardStyle = this._resolveCategory('cardinals');
    const offset = cardStyle.offset;
    const directions = [[0, 1, 0], [1, 0, 0], [0, -1, 0], [-1, 0, 0]];

    for (let i = 0; i < 4; i++) {
      const d = this._rotate(directions[i]);
      const hLen = Math.sqrt(d[0] * d[0] + d[1] * d[1]);
      const el = this._cardinalEls[i];
      if (hLen < 0.05) {
        el.setAttribute('display', 'none');
      } else {
        el.removeAttribute('display');
        el.setAttribute('x', cx + (r + offset) * d[0] / hLen);
        el.setAttribute('y', cx - (r + offset) * d[1] / hLen);
        el.setAttribute('font-size', cardStyle.fontSize);
        el.setAttribute('font-family', cardStyle.fontFamily);
        el.setAttribute('fill', cardStyle.fill);
      }
    }
  }
}

/** Batch-set attributes on an SVG element. Skips undefined/null values. */
function setAttrs(el, attrs) {
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, v);
  }
}
