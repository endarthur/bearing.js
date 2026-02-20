/** @module svg — SVG string builder for stereonet elements. */

function attr(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export class SvgBuilder {
  constructor(width, height) {
    this.width = width;
    this.height = height;
    this.elements = [];
  }

  circle(cx, cy, r, style = {}) {
    this.elements.push(`<circle ${attr({ cx, cy, r, ...style })}/>`);
    return this;
  }

  line(x1, y1, x2, y2, style = {}) {
    this.elements.push(`<line ${attr({ x1, y1, x2, y2, ...style })}/>`);
    return this;
  }

  polyline(points, style = {}) {
    const pts = points.map(([x, y]) => `${x},${y}`).join(' ');
    this.elements.push(`<polyline ${attr({ points: pts, fill: 'none', ...style })}/>`);
    return this;
  }

  path(d, style = {}) {
    this.elements.push(`<path ${attr({ d, ...style })}/>`);
    return this;
  }

  text(x, y, content, style = {}) {
    const { 'text-anchor': anchor, ...rest } = style;
    const anchorAttr = anchor ? ` text-anchor="${anchor}"` : '';
    this.elements.push(`<text ${attr({ x, y, ...rest })}${anchorAttr}>${esc(content)}</text>`);
    return this;
  }

  group(id, children) {
    const idAttr = id ? ` id="${id}"` : '';
    this.elements.push(`<g${idAttr}>${children}</g>`);
    return this;
  }

  /**
   * Add a clipping circle definition and return a group opener string.
   */
  clipCircle(id, cx, cy, r) {
    this.elements.push(
      `<defs><clipPath id="${id}"><circle cx="${cx}" cy="${cy}" r="${r}"/></clipPath></defs>`
    );
    return this;
  }

  openClipGroup(clipId) {
    this.elements.push(`<g clip-path="url(#${clipId})">`);
    return this;
  }

  closeGroup() {
    this.elements.push('</g>');
    return this;
  }

  toString() {
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${this.width}" height="${this.height}" viewBox="0 0 ${this.width} ${this.height}">`,
      ...this.elements,
      '</svg>',
    ].join('\n');
  }

  /**
   * Parse SVG string into a DOM element (browser only).
   */
  toElement() {
    const parser = new DOMParser();
    const doc = parser.parseFromString(this.toString(), 'image/svg+xml');
    return doc.documentElement;
  }
}
