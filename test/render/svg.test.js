import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SvgBuilder } from '../../src/render/svg.js';

describe('SvgBuilder', () => {
  it('produces valid SVG wrapper', () => {
    const svg = new SvgBuilder(100, 200).toString();
    assert.ok(svg.startsWith('<svg'));
    assert.ok(svg.includes('width="100"'));
    assert.ok(svg.includes('height="200"'));
    assert.ok(svg.includes('xmlns="http://www.w3.org/2000/svg"'));
    assert.ok(svg.endsWith('</svg>'));
  });

  it('circle element', () => {
    const svg = new SvgBuilder(100, 100).circle(50, 50, 10, { fill: 'red' }).toString();
    assert.ok(svg.includes('<circle'));
    assert.ok(svg.includes('cx="50"'));
    assert.ok(svg.includes('r="10"'));
    assert.ok(svg.includes('fill="red"'));
  });

  it('polyline element', () => {
    const svg = new SvgBuilder(100, 100)
      .polyline([[0, 0], [10, 20], [30, 40]], { stroke: 'blue' })
      .toString();
    assert.ok(svg.includes('<polyline'));
    assert.ok(svg.includes('points="0,0 10,20 30,40"'));
    assert.ok(svg.includes('stroke="blue"'));
  });

  it('text escapes special characters', () => {
    const svg = new SvgBuilder(100, 100).text(10, 20, '<hello>&"world"').toString();
    assert.ok(svg.includes('&lt;hello&gt;&amp;&quot;world&quot;'));
  });

  it('clipCircle and clip group', () => {
    const svg = new SvgBuilder(100, 100)
      .clipCircle('clip1', 50, 50, 40)
      .openClipGroup('clip1')
      .circle(50, 50, 5)
      .closeGroup()
      .toString();
    assert.ok(svg.includes('<clipPath id="clip1"'));
    assert.ok(svg.includes('clip-path="url(#clip1)"'));
  });

  it('line element', () => {
    const svg = new SvgBuilder(100, 100).line(0, 0, 100, 100, { stroke: '#000' }).toString();
    assert.ok(svg.includes('<line'));
    assert.ok(svg.includes('x1="0"'));
    assert.ok(svg.includes('y2="100"'));
  });

  it('path element', () => {
    const svg = new SvgBuilder(100, 100).path('M 0 0 L 10 10', { fill: 'none' }).toString();
    assert.ok(svg.includes('<path'));
    assert.ok(svg.includes('d="M 0 0 L 10 10"'));
  });

  it('method chaining', () => {
    const builder = new SvgBuilder(100, 100);
    const result = builder.circle(0, 0, 5).line(0, 0, 1, 1).text(0, 0, 'hi');
    assert.strictEqual(result, builder);
  });
});
