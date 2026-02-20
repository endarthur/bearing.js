# bearing.js

[![GCU: WA](https://img.shields.io/badge/GCU-WA-brightgreen.svg)](#gcu-classification)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.XXXXXXX.svg)](https://doi.org/10.5281/zenodo.XXXXXXX)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Structural geology stereonet library in pure JavaScript. No dependencies.

**[Live demo](https://endarthur.github.io/bearing.js)**

## Features

- Equal-area (Schmidt) and equal-angle (Wulff) projections
- Planes, poles, lines, great circles, small circles
- Kernel-density contouring (Kamb method)
- Eigenvalue decomposition, Woodcock and Vollmer fabric parameters, Bingham statistics
- Attitude I/O: dip-direction/dip, strike/dip, quadrant notation
- SVG rendering with no DOM dependencies
- ~24 KB minified, ~8 KB gzipped

## Install

```bash
npm install
```

## Usage

As an ES module:

```js
import { Stereonet } from './src/index.js';

const sn = new Stereonet();
sn.plane(120, 45);
sn.pole(120, 45);

document.body.innerHTML = sn.svg();
```

As a bundled IIFE (browser global):

```bash
npm run build
```

```html
<script src="bearing.js"></script>
<script>
  const sn = new bearing.Stereonet();
  sn.plane(120, 45);
  document.body.innerHTML = sn.svg();
</script>
```

## API

| Module | Description |
|--------|-------------|
| `Stereonet` | Main class — add planes, poles, lines, contours, render to SVG |
| `conversions` | Attitude conversions (dip-direction, strike, direction cosines) |
| `statistics` | Eigenvalues, mean vector, Fisher, Woodcock, Vollmer, Bingham |
| `io` | Parse attitude strings and text blocks |
| `equalArea` / `equalAngle` | Projection functions |
| `vec3` / `mat3` | 3D vector and matrix operations |
| `curves` | Small circles, great circles as point sequences |
| `computeContours` | Kernel-density contouring |
| `SvgBuilder` | Low-level SVG path/element builder |

## Tests

```bash
npm test
```

222 tests using Node.js built-in test runner.

## License

[MIT](LICENSE)

## GCU Classification

**WA** — Works in an Airplane. Fully offline, single HTML file, zero network calls. Deployable on air-gapped mine site laptops, field camp tablets, or opened from a USB stick.
