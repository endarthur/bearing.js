import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

// Bundle the library into a single IIFE exposing `bearing` global
const { outputFiles } = buildSync({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'bearing',
  write: false,
});

const bundle = outputFiles[0].text;

// Build each template → standalone
const templates = [
  ['examples/standalone.template.html', 'examples/standalone.html'],
  ['examples/interactive.template.html', 'examples/interactive_standalone.html'],
  ['examples/analysis.template.html', 'examples/analysis_standalone.html'],
  ['examples/demo.template.html', 'index.html'],
];

for (const [src, dest] of templates) {
  const template = readFileSync(src, 'utf8');
  const html = template.replace('/* __BUNDLE__ */', bundle);
  writeFileSync(dest, html);
  console.log(`Built ${dest}`);
}

// --- npm dist bundles ---
mkdirSync('dist', { recursive: true });

// IIFE (for <script> tags, CDN)
buildSync({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'bearing',
  outfile: 'dist/bearing.js',
});
console.log('Built dist/bearing.js (IIFE)');

// IIFE minified
buildSync({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'iife',
  globalName: 'bearing',
  minify: true,
  outfile: 'dist/bearing.min.js',
});
console.log('Built dist/bearing.min.js (IIFE minified)');

// CJS (for require())
buildSync({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'cjs',
  outfile: 'dist/bearing.cjs',
});
console.log('Built dist/bearing.cjs (CommonJS)');

// ESM bundle (single file, for CDNs like esm.sh that prefer pre-bundled)
buildSync({
  entryPoints: ['src/index.js'],
  bundle: true,
  format: 'esm',
  outfile: 'dist/bearing.mjs',
});
console.log('Built dist/bearing.mjs (ESM bundle)');
