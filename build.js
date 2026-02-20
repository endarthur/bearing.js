import { buildSync } from 'esbuild';
import { readFileSync, writeFileSync } from 'node:fs';

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
