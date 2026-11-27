# bearing.js

[![GCU: WA](https://img.shields.io/badge/GCU-WA-brightgreen.svg)](#gcu-classification)
[![DOI](https://zenodo.org/badge/DOI/10.5281/zenodo.XXXXXXX.svg)](https://doi.org/10.5281/zenodo.XXXXXXX)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Structural geology stereonet library in pure JavaScript. No dependencies.

**[Live demo](https://endarthur.github.io/bearing.js)**

## Features

- Equal-area (Schmidt) and equal-angle (Wulff) projections
- Planes, poles, lines, great circles, small circles
- Kernel-density contouring — Fisher kernel (multiples-of-uniform-density) or Kamb (1959) counting (σ)
- Eigenvalue decomposition, Woodcock and Vollmer fabric parameters, Bingham statistics
- Confidence regions: Fisher cone of confidence + eigenvector confidence ellipses
- Hypothesis tests: spherical uniformity (Bingham), two-sample common mean (Watson–Williams), Rayleigh
- Bootstrap confidence regions (non-parametric cone for the mean, ellipse for eigenvectors)
- Structural analysis: π/fold-axis (best-fit great circle), best-fit plane, unfolding/tilt test
- Mobile compass math: device orientation → dip-direction/dip and trend/plunge
- Fault-slip & paleostress: kinematic P/T axes, right-dihedra field, Michael (1984) stress inversion
- Set identification: axial k-means + soft Watson-mixture EM (BIC chooses the number of sets)
- Fabric diagrams: Woodcock K–C, Vollmer P–G–R ternary
- Synthetic sampling: Fisher draws, smoothed bootstrap, uniform + concentrated rotation sampling
- Rotation analysis (SO(3)): quaternions, foliation∧lineation frames, misorientation, mean rotation
- Rotation-notation conversions: 24 Euler conventions with per-axis sign flags; dip/dipdir/rake (Leapfrog, Isatis), Bunge, GSLIB presets
- Attitude I/O: dip-direction/dip, strike/dip, quadrant notation
- Rose diagrams (axial/directional binning, petal geometry, SVG output)
- Arcball drag-rotation primitive (frame-consistent, no gimbal flip)
- SVG rendering with no DOM dependencies; PNG export via canvas (`toPNG`)
- Ships TypeScript declarations (`bearing.d.ts`) — no build step, source stays plain JS
- ~34 KB minified, ~11 KB gzipped

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
| `statistics` | Eigenvalues, Fisher, Woodcock, Vollmer, Bingham, confidence cone/ellipse, uniformity & common-mean tests |
| `circular` | Circular (azimuthal) statistics: mean, R, von Mises κ, Rayleigh test |
| `rose` | Rose-diagram binning (`roseBins`), petal geometry (`rosePetals`), SVG (`roseSVG`) |
| `analysis` | Fold axis / best-fit great circle, best-fit plane, dataset rotation & unfolding |
| `fault` | Fault-slip kinematics: P/T axes, Angelier dihedra, Michael (1984) paleostress inversion |
| `cluster` | Orientation-set identification: k-means + Watson-mixture EM with BIC model selection |
| `fabricplot` | Fabric diagnostic diagrams: Woodcock K–C plot, Vollmer P–G–R ternary |
| `simulate` | Fisher sampling + Fisher-kernel smoothed bootstrap (synthetic fabrics) |
| `compass` | Device-orientation → attitude (`planeFromDeviceOrientation`, `lineFromDeviceOrientation`) |
| `color` | Named colour scales + value→colour mapping (`colorScale`, `sampleScale`, `mapValue`) |
| `io` | Parse attitude strings and text blocks |
| `equalArea` / `equalAngle` | Projection functions |
| `vec3` / `mat3` / `quat` | 3D vector, matrix, and quaternion operations |
| `rotation` | SO(3): frames, misorientation, mean + bootstrap confidence, apply/compose, log/exp (rotation vector) |
| `euler` | Rotation-notation conversions: 24 Euler conventions (± per-axis signs) ↔ matrix/quaternion; dip/dipdir/rake, Bunge, GSLIB presets |
| `curves` | Small circles, great circles as point sequences |
| `computeContours` | Kernel-density contour lines |
| `densityGrid` | Fisher-kernel density raster (MUD), reusable for heatmaps |
| `densityField` | the density once on the sphere, read in any view (`cachedDensityField`, `densityFieldCache`) |
| `SvgBuilder` | Low-level SVG path/element builder |

## Interactivity & overlays

Building an interactive viewer (cursor read-outs, click-to-pick, labels, heatmaps)
on top of the engine? These methods cover the pixel ↔ attitude plumbing so you don't
have to reach into internals.

```js
const sn = new Stereonet({ size: 560 });
const el = sn.element();              // live DOM <svg>, updated in place by render()

// Pixel → attitude: cursor read-out / click-to-pick (null outside the net)
el.addEventListener('pointermove', e => {
  const pt = /* map clientX/Y to the SVG viewBox */;
  const dcos = sn.unproject(pt.x, pt.y);
  if (dcos) console.log(conversions.dcosToLine(dcos)); // [trend, plunge]
});

// Attitude → pixel: place a leader/label that tracks rotation
const { x, y, upper } = sn.projectLine(120, 35);  // upper === on the hidden hemisphere

// Anchored text label (hidden automatically when it rotates to the upper hemisphere)
sn.text(120, 35, 'B₁', { dx: 8, dy: -6, fill: '#b06f06' });

// Net geometry for your own overlays — no private fields needed
const { center, radius, scale, projR } = sn.layout;
// a projected point [px, py] is at SVG [center + px*scale, center - py*scale]
```

### Density heatmap

`heatmap()` paints a filled Fisher-kernel raster beneath the grid; it mirrors
`contour()` (call `updateHeatmap()` after changing rotation, `clearHeatmap()` to remove):

```js
sn.heatmap(dcos, { gridSize: 48, color: t => `rgba(176,111,6,${t})` });
sn.contour(dcos, { levels: [2, 4, 6, 8] });   // line contours over the fill
```

For full control, compute the raster once with `densityGrid()` and feed it to both your
own renderer and `computeContours()` (via `options.grid`) to avoid recomputing it:

```js
import { densityGrid, computeContours } from './src/index.js';

const grid = densityGrid(dcos, { projection: 'equal-area', gridSize: 48 });
// grid → { grid: Float64Array, gridSize, step, projR, projection }; cells outside the net are NaN
const contours = computeContours(dcos, { levels: [2, 4, 6], grid });
```

**Rotating a contoured net.** The raster lives in projected space, so a rotated view (or the other
projection, or another grid size) used to mean counting every measurement against every cell again.
`densityField()` computes the density once on the sphere (rings of nodes about 1.2° apart over the lower
hemisphere; axial) and a view reads it by interpolation. `densityGrid` does this by itself when the direct
count would be heavy (`field: 'auto'`, the default: n × gridSize² > 4·10⁶) and remembers the last eight
fields by content, so a net dragged round reads the same field each frame; small datasets keep the exact
per-cell count. At 50 000 measurements: Kamb 249 ms per 40² view directly → the field built once in 58 ms,
then 3–4 ms a view; Fisher 952 ms → 38 ms once, 2–5 ms a view. The field equals the direct count at its
nodes and stays within a few per cent of the peak between them (`test/densityfield.test.js`).

```js
import { densityField } from './src/index.js';
const f = densityField(dcos, { method: 'kamb', kambSigma: 3 });
f.at([0, 0, -1]);                                    // σ at the nadir
densityGrid(dcos, { field: f, rotation: R });       // any view, from the one field
```

## Conventions

- Direction cosines: x = East, y = North, z = Up; lower hemisphere is z ≤ 0.
- **Axial data.** Poles and lines without a sense are axes: a vector and its antipode are the same
  measurement. Density (Fisher kernel and Kamb), the orientation tensor and eigen analysis treat them
  so. Fisher statistics (`fisherStats`, `meanVector`, `confidenceCone`) sum vectors, so pass
  `{ axial: true }` for poles and lines (each is first turned into the hemisphere of V1 —
  `alignToAxis`); the default stays vector, for paleomagnetic directions and slip vectors.
- **Faults** are (pole, slip) pairs where slip is the motion of the **hanging wall**, the block the
  upward normal points into. Either pole may be passed. Sense codes (OpenStereo's set):
  normal `N 2 −`, reverse `I R 1 +`, dextral `D 3`, sinistral `S L 4`, unknown `U F 0 5 ?` (and
  anything unrecognised → `defined: false`); words too (`normal`, `reverse`, `thrust`,
  `right-lateral`, `left-lateral`…). Dextral/sinistral are resolved against the right-hand-rule strike.

## Tests

```bash
npm test
```

509 tests using Node.js built-in test runner. `test/geology.test.js` checks results against known
structural geology (a normal fault's P is steep, a dextral E–W fault's P is NW–SE, Michael's σ1 is
vertical for normal faults, density is unchanged when a pole flips to its antipode…), not only
mathematical identities.

## License

[MIT](LICENSE)

## GCU Classification

**WA** — Works in an Airplane. Fully offline, single HTML file, zero network calls. Deployable on air-gapped mine site laptops, field camp tablets, or opened from a USB stick.
