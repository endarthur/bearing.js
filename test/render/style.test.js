import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deepMerge, resolveStyle, defaults } from '../../src/render/style.js';

describe('deepMerge', () => {
  it('merges flat objects', () => {
    const result = deepMerge({ a: 1, b: 2 }, { b: 3, c: 4 });
    assert.deepStrictEqual(result, { a: 1, b: 3, c: 4 });
  });

  it('does not mutate inputs', () => {
    const target = { a: 1 };
    const source = { b: 2 };
    const result = deepMerge(target, source);
    assert.deepStrictEqual(target, { a: 1 });
    assert.deepStrictEqual(source, { b: 2 });
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });

  it('merges nested objects recursively', () => {
    const result = deepMerge(
      { a: { x: 1, y: 2 }, b: 3 },
      { a: { y: 9, z: 10 } },
    );
    assert.deepStrictEqual(result, { a: { x: 1, y: 9, z: 10 }, b: 3 });
  });

  it('does not mutate nested objects', () => {
    const target = { a: { x: 1 } };
    deepMerge(target, { a: { y: 2 } });
    assert.deepStrictEqual(target, { a: { x: 1 } });
  });

  it('skips undefined values', () => {
    const result = deepMerge({ a: 1, b: 2 }, { a: undefined, b: 3 });
    assert.deepStrictEqual(result, { a: 1, b: 3 });
  });

  it('replaces arrays wholesale', () => {
    const result = deepMerge({ a: [1, 2, 3] }, { a: [4, 5] });
    assert.deepStrictEqual(result, { a: [4, 5] });
  });

  it('allows null to overwrite objects', () => {
    const result = deepMerge({ a: { x: 1 } }, { a: null });
    assert.deepStrictEqual(result, { a: null });
  });

  it('handles multiple sources', () => {
    const result = deepMerge({ a: 1 }, { b: 2 }, { c: 3 });
    assert.deepStrictEqual(result, { a: 1, b: 2, c: 3 });
  });

  it('later sources win', () => {
    const result = deepMerge({ a: 1 }, { a: 2 }, { a: 3 });
    assert.strictEqual(result.a, 3);
  });

  it('skips null/undefined sources', () => {
    const result = deepMerge({ a: 1 }, null, undefined, { b: 2 });
    assert.deepStrictEqual(result, { a: 1, b: 2 });
  });

  it('preserves 0, empty string, and false', () => {
    const result = deepMerge({ a: 1, b: 'hello', c: true }, { a: 0, b: '', c: false });
    assert.deepStrictEqual(result, { a: 0, b: '', c: false });
  });
});

describe('resolveStyle', () => {
  it('returns defaults when no overrides', () => {
    const result = resolveStyle('pole', null, {});
    assert.deepStrictEqual(result, defaults.pole);
  });

  it('instance style overrides defaults', () => {
    const result = resolveStyle('pole', { pole: { fill: 'red' } }, {});
    assert.strictEqual(result.fill, 'red');
    assert.strictEqual(result.r, defaults.pole.r);
    assert.strictEqual(result.stroke, defaults.pole.stroke);
  });

  it('item style overrides instance style', () => {
    const result = resolveStyle('pole', { pole: { fill: 'red' } }, { fill: 'blue' });
    assert.strictEqual(result.fill, 'blue');
  });

  it('item style overrides defaults', () => {
    const result = resolveStyle('pole', null, { fill: 'green', r: 5 });
    assert.strictEqual(result.fill, 'green');
    assert.strictEqual(result.r, 5);
    assert.strictEqual(result.stroke, defaults.pole.stroke);
  });

  it('three-level cascade: defaults < instance < item', () => {
    const result = resolveStyle(
      'pole',
      { pole: { fill: 'red', r: 10 } },
      { fill: 'blue' },
    );
    assert.strictEqual(result.fill, 'blue');   // item wins over instance
    assert.strictEqual(result.r, 10);           // instance wins over default
    assert.strictEqual(result.stroke, defaults.pole.stroke); // default
  });

  it('respects 0, null, empty string as valid overrides', () => {
    const result = resolveStyle('pole', null, { r: 0, fill: '', stroke: null });
    assert.strictEqual(result.r, 0);
    assert.strictEqual(result.fill, '');
    assert.strictEqual(result.stroke, null);
  });

  it('skips undefined overrides', () => {
    const result = resolveStyle('pole', null, { fill: undefined });
    assert.strictEqual(result.fill, defaults.pole.fill);
  });

  it('works for scalar categories (background)', () => {
    assert.strictEqual(resolveStyle('background', null), defaults.background);
    assert.strictEqual(resolveStyle('background', { background: '#111' }), '#111');
    assert.strictEqual(resolveStyle('background', { background: '#111' }, '#222'), '#222');
  });

  it('works for grid category', () => {
    const result = resolveStyle('grid', { grid: { stroke: '#444' } }, {});
    assert.strictEqual(result.stroke, '#444');
    assert.strictEqual(result.strokeWidth, defaults.grid.strokeWidth);
  });

  it('works for all object categories', () => {
    for (const cat of ['pole', 'line', 'plane', 'cone', 'grid', 'primitive', 'cardinals']) {
      const result = resolveStyle(cat, null, {});
      assert.deepStrictEqual(result, defaults[cat], `${cat} should return defaults`);
    }
  });
});
