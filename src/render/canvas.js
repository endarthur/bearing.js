/** @module canvas — the same builder as SvgBuilder, drawing onto a Canvas 2D context instead.
 *
 * Any CanvasRenderingContext2D-shaped target works: a browser canvas, an OffscreenCanvas, a
 * recording context (e.g. @gcu/plot's `recordingContext`, whose draw list can be replayed or
 * printed), or a PDF page's 2D context. That is the GCU graphics contract — a graphic draws
 * into a 2D context — so a stereonet drawn here lands as vectors wherever that context goes.
 *
 * Styles are the SVG attribute names the renderers already use (fill, stroke, stroke-width,
 * opacity, fill-opacity, stroke-opacity, stroke-dasharray, font-size, font-family,
 * text-anchor, dominant-baseline); `class` and `shape-rendering` are ignored. `path(d)` takes
 * the M / L / H / V / Z subset the renderers emit, and refuses anything else.
 */

const num = (v, d = 0) => (v == null || v === '' ? d : +v);
const isNone = (v) => v == null || v === 'none' || v === 'transparent';

export class CanvasBuilder {
  constructor(ctx) {
    this.ctx = ctx;
    this._clips = new Map();
  }

  _paint(style, { fillDefault = 'black', closed = true } = {}) {
    const g = this.ctx, op = num(style.opacity, 1);
    const fill = style.fill !== undefined ? style.fill : (closed ? fillDefault : 'none');
    if (!isNone(fill)) {
      g.globalAlpha = op * num(style['fill-opacity'], 1);
      g.fillStyle = fill;
      g.fill();
    }
    if (!isNone(style.stroke)) {
      g.globalAlpha = op * num(style['stroke-opacity'], 1);
      g.strokeStyle = style.stroke;
      g.lineWidth = num(style['stroke-width'], 1);
      const dash = style['stroke-dasharray'];
      g.setLineDash(dash && dash !== 'none' ? String(dash).split(/[\s,]+/).map(Number).filter((n) => n >= 0) : []);
      g.stroke();
      g.setLineDash([]);
    }
    g.globalAlpha = 1;
  }

  circle(cx, cy, r, style = {}) {
    const g = this.ctx;
    g.beginPath(); g.arc(+cx, +cy, +r, 0, Math.PI * 2);
    this._paint(style);
    return this;
  }

  line(x1, y1, x2, y2, style = {}) {
    const g = this.ctx;
    g.beginPath(); g.moveTo(+x1, +y1); g.lineTo(+x2, +y2);
    this._paint({ ...style, fill: 'none' });
    return this;
  }

  polyline(points, style = {}) {
    if (!points.length) return this;
    const g = this.ctx;
    g.beginPath(); g.moveTo(+points[0][0], +points[0][1]);
    for (let i = 1; i < points.length; i++) g.lineTo(+points[i][0], +points[i][1]);
    this._paint({ fill: 'none', ...style });
    return this;
  }

  path(d, style = {}) {
    const g = this.ctx;
    g.beginPath();
    const tok = String(d).match(/[A-Za-z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) || [];
    let i = 0, cmd = '', x = 0, y = 0, x0 = 0, y0 = 0;
    const n = () => +tok[i++];
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      switch (cmd) {
        case 'M': x = n(); y = n(); x0 = x; y0 = y; g.moveTo(x, y); cmd = 'L'; break;
        case 'm': x += n(); y += n(); x0 = x; y0 = y; g.moveTo(x, y); cmd = 'l'; break;
        case 'L': x = n(); y = n(); g.lineTo(x, y); break;
        case 'l': x += n(); y += n(); g.lineTo(x, y); break;
        case 'H': x = n(); g.lineTo(x, y); break;
        case 'h': x += n(); g.lineTo(x, y); break;
        case 'V': y = n(); g.lineTo(x, y); break;
        case 'v': y += n(); g.lineTo(x, y); break;
        case 'Z': case 'z': g.closePath(); x = x0; y = y0; break;
        default: throw new Error(`CanvasBuilder.path: "${cmd}" is not supported (M L H V Z only)`);
      }
    }
    this._paint(style);
    return this;
  }

  rect(x, y, width, height, style = {}) {
    const g = this.ctx;
    g.beginPath(); g.rect(+x, +y, +width, +height);
    this._paint(style);
    return this;
  }

  text(x, y, content, style = {}) {
    const g = this.ctx, size = num(style['font-size'], 12);
    g.font = `${style['font-weight'] ? style['font-weight'] + ' ' : ''}${size}px ${style['font-family'] || 'sans-serif'}`;
    const a = style['text-anchor'];
    g.textAlign = a === 'middle' ? 'center' : a === 'end' ? 'right' : 'left';
    const b = style['dominant-baseline'];
    g.textBaseline = b === 'central' || b === 'middle' ? 'middle' : b === 'hanging' ? 'top' : 'alphabetic';
    g.globalAlpha = num(style.opacity, 1) * num(style['fill-opacity'], 1);
    g.fillStyle = isNone(style.fill) ? 'black' : style.fill;
    g.fillText(String(content), +x, +y);
    g.globalAlpha = 1;
    return this;
  }

  group() {
    throw new Error('CanvasBuilder.group: SVG-string children cannot be drawn on a canvas');
  }

  clipCircle(id, cx, cy, r) {
    this._clips.set(id, [+cx, +cy, +r]);
    return this;
  }

  openClipGroup(clipId) {
    const g = this.ctx, c = this._clips.get(clipId);
    g.save();
    if (c) { g.beginPath(); g.arc(c[0], c[1], c[2], 0, Math.PI * 2); g.clip(); }
    return this;
  }

  closeGroup() {
    this.ctx.restore();
    return this;
  }
}
