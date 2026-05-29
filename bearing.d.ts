/**
 * Type declarations for @gcu/bearing.
 *
 * Hand-written to mirror src/index.js. The library itself is plain ESM
 * JavaScript; this file only describes its shapes for TypeScript/IDE consumers.
 */

export type Vec3 = number[];
/** Unit direction cosine [x, y, z]; lower hemisphere has z ≤ 0. */
export type Dcos = number[];
/** Flat row-major 3×3 matrix (9 elements). */
export type Mat3 = number[];
/** [trend, plunge] or [dipDirection, dip] in degrees. */
export type Attitude = [number, number];
export type Projection = 'equal-area' | 'equal-angle';

export interface StyleOptions { [key: string]: any; }

export interface StereonetOptions {
  size?: number;
  padding?: number;
  projection?: Projection;
  net?: 'equatorial' | 'polar';
  rotation?: Mat3 | null;
  center?: [number, number];
  northPole?: [number, number] | [number, number, number];
  style?: StyleOptions | null;
  classPrefix?: string | null;
}

export interface ProjectResult { x: number; y: number; upper: boolean; }
export interface Layout { center: number; radius: number; scale: number; projR: number; }

export interface ContourOptions {
  levels?: number[];
  sigma?: number;
  gridSize?: number;
  method?: 'fisher' | 'kamb';
  kambSigma?: number;
  stroke?: string;
  strokeWidth?: number;
  colors?: string[];
}

export interface HeatmapOptions {
  gridSize?: number;
  sigma?: number;
  method?: 'fisher' | 'kamb';
  kambSigma?: number;
  color?: (t: number) => string;
  max?: number;
  threshold?: number;
  opacity?: number;
}

export interface PngOptions {
  scale?: number;
  width?: number;
  background?: string;
}

export class Stereonet {
  constructor(options?: StereonetOptions);

  size: number;
  padding: number;
  projection: Projection;
  net: string;
  rotation: Mat3 | null;
  readonly items: any[];
  readonly layout: Layout;

  static rotationFromCenter(trend: number, plunge: number): Mat3;
  static rotationFromNorthPole(trend: number, plunge: number, spin?: number): Mat3;

  // Pixel ↔ attitude
  project(dcos: Dcos): ProjectResult;
  projectLine(trend: number, plunge: number): ProjectResult;
  unproject(sx: number, sy: number): Dcos | null;
  arcball(x0: number, y0: number, x1: number, y1: number): Mat3;

  // Data items (chainable)
  pole(dd: number, dip: number, style?: StyleOptions): this;
  line(trend: number, plunge: number, style?: StyleOptions): this;
  plane(dd: number, dip: number, style?: StyleOptions): this;
  cone(trend: number, plunge: number, halfAngle: number, style?: StyleOptions): this;
  text(trend: number, plunge: number, content: string, style?: StyleOptions): this;
  ellipse(centerDir: Dcos, majorDir: Dcos, semiMajorDeg: number, semiMinorDeg: number, style?: StyleOptions): this;
  confidenceEllipse(dcos: Dcos[], options?: ConfidenceEllipseOptions & { style?: StyleOptions }): this;

  // Contours & density
  contour(dcos: Dcos[], options?: ContourOptions): this;
  updateContours(): this;
  clearContours(): this;
  heatmap(dcos: Dcos[], options?: HeatmapOptions): this;
  updateHeatmap(): this;
  clearHeatmap(): this;

  // Item management
  clear(): this;
  remove(item: any): this;
  setStyle(style: StyleOptions): this;

  // View
  setRotation(rotation: Mat3 | null): this;
  setCenter(trend: number, plunge: number): this;
  setNorthPole(trend: number, plunge: number, spin?: number): this;

  // Output
  svg(): string;
  svgDataURL(): string;
  download(filename?: string): void;
  toPNG(options?: PngOptions): Promise<string>;
  downloadPNG(filename?: string, options?: PngOptions): Promise<void>;

  // DOM rendering (browser)
  element(): SVGElement;
  render(): this;
}

export namespace conversions {
  function planeToDcos(dd: number, dip: number): Dcos;
  function dcosToPlane(dcos: Dcos): Attitude;
  function lineToDcos(trend: number, plunge: number): Dcos;
  function dcosToLine(dcos: Dcos): Attitude;
  function strikeToDD(strike: number, dip: number): Attitude;
  function planesToDcos(planes: Attitude[]): Dcos[];
  function linesToDcos(lines: Attitude[]): Dcos[];
  function rakeToDcos(dd: number, dip: number, rake: number): Dcos;
  function rakeToLine(dd: number, dip: number, rake: number): Attitude;
  function lineOnPlane(dd: number, dip: number, trend: number, plunge: number): number;
  function planeIntersectionLine(dd1: number, dip1: number, dd2: number, dip2: number): Attitude | null;
  function rotateDcos(dcos: Dcos, axis: Dcos, angle: number): Dcos;
  function rotateDcosArray(dcosArray: Dcos[], axis: Dcos, angle: number): Dcos[];
}

export namespace vec3 {
  function create(x?: number, y?: number, z?: number): Vec3;
  function dot(a: Vec3, b: Vec3): number;
  function cross(a: Vec3, b: Vec3): Vec3;
  function length(v: Vec3): number;
  function normalize(v: Vec3): Vec3;
  function scale(v: Vec3, s: number): Vec3;
  function add(a: Vec3, b: Vec3): Vec3;
  function sub(a: Vec3, b: Vec3): Vec3;
  function negate(v: Vec3): Vec3;
  function angle(a: Vec3, b: Vec3): number;
  function rotate(v: Vec3, axis: Vec3, theta: number): Vec3;
}

export namespace mat3 {
  function identity(): Mat3;
  function multiply(a: Mat3, b: Mat3): Mat3;
  function transformVec3(m: Mat3, v: Vec3): Vec3;
  function rotationFromAxisAngle(axis: Vec3, theta: number): Mat3;
  function rotationBetween(a: Vec3, b: Vec3): Mat3;
  function transpose(m: Mat3): Mat3;
  function orthonormalize(m: Mat3): Mat3;
}

export namespace curves {
  function greatCircle(pole: Dcos, nPoints?: number): Dcos[];
  function smallCircle(axis: Dcos, halfAngle: number, nPoints?: number): Dcos[];
  function ellipse(axis: Dcos, majorDir: Dcos, semiMajor: number, semiMinor: number, nPoints?: number): Dcos[];
  function arc(a: Dcos, b: Dcos, nPoints?: number): Dcos[];
  function planeIntersection(pole1: Dcos, pole2: Dcos): [Dcos, Dcos] | null;
}

export namespace io {
  function parse(text: string): Attitude[];
  function parsePlanes(text: string, options?: { strike?: boolean }): Dcos[];
  function parseLines(text: string): Dcos[];
  function parseDirection(s: string): number;
  function parseDip(s: string): { dip: number; quadrant: string };
  function translateAttitude(dd: number, dip: number, quadrant?: string, strike?: boolean): Attitude;
}

export namespace equalArea {
  function project(dcos: Dcos): [number, number];
  function inverse(px: number, py: number): Dcos | null;
}
export namespace equalAngle {
  function project(dcos: Dcos): [number, number];
  function inverse(px: number, py: number): Dcos | null;
}

export interface FisherStats {
  n: number; R: number; Rbar: number; mean: Dcos; kappa: number; alpha95: number;
}
export interface PrincipalAxes {
  eigenvalues: number[]; eigenvectors: Dcos[];
  K: number; C: number; P: number; G: number; R: number; kappa1: number; kappa2: number;
}
export interface ConfidenceConeResult { mean: Attitude; halfAngle: number; confidence: number; }
export interface ConfidenceEllipseOptions { confidence?: number; about?: 'max' | 'min'; }
export interface ConfidenceEllipseResult {
  center: Attitude; azimuth: Attitude; a: number; b: number;
  centerDir: Dcos; majorDir: Dcos; minorDir: Dcos; confidence: number;
}

export interface UniformityTest { n: number; eigenvalues: number[]; statistic: number; df: number; p: number; }
export interface CommonMeanTest { F: number; df1: number; df2: number; p: number; Ra: number; Rb: number; R: number; }

export namespace statistics {
  function resultant(dcos: Dcos[]): Vec3;
  function meanVector(dcos: Dcos[]): Dcos;
  function fisherStats(dcos: Dcos[]): FisherStats;
  function confidenceCone(dcos: Dcos[], confidence?: number): ConfidenceConeResult;
  function orientationTensor(dcos: Dcos[]): Mat3;
  function principalAxes(dcos: Dcos[]): PrincipalAxes;
  function confidenceEllipse(dcos: Dcos[], options?: ConfidenceEllipseOptions): ConfidenceEllipseResult;
  function uniformityTest(dcos: Dcos[]): UniformityTest;
  function commonMeanTest(a: Dcos[], b: Dcos[]): CommonMeanTest;
  function bootstrapMeanConfidence(dcos: Dcos[], options?: {
    confidence?: number; iterations?: number; rng?: () => number;
  }): { mean: Attitude; meanDir: Dcos; halfAngle: number; confidence: number; iterations: number };
  function bootstrapEigenvectorConfidence(dcos: Dcos[], options?: {
    confidence?: number; about?: 'max' | 'min'; iterations?: number; rng?: () => number;
  }): ConfidenceEllipseResult & { iterations: number };
}

export interface CircularOptions { axial?: boolean; }
export namespace circular {
  function resultant(azimuths: number[], options?: CircularOptions): { n: number; R: number; Rbar: number; mean: number };
  function circularMean(azimuths: number[], options?: CircularOptions): number;
  function circularVariance(azimuths: number[], options?: CircularOptions): number;
  function circularStdDev(azimuths: number[], options?: CircularOptions): number;
  function vonMisesKappa(azimuths: number[], options?: CircularOptions): number;
  function rayleighTest(azimuths: number[], options?: CircularOptions): { n: number; Rbar: number; z: number; p: number };
}

export interface RoseBin {
  startDeg: number; endDeg: number; midDeg: number; count: number; frequency: number;
}
export interface RoseBins {
  bins: RoseBin[]; binWidth: number; n: number; maxCount: number; maxFrequency: number; axial: boolean;
}
export interface RoseOptions {
  binWidth?: number; axial?: boolean;
}
export namespace rose {
  function roseBins(azimuths: number[], options?: RoseOptions): RoseBins;
  function rosePetals(binned: RoseBins, options?: {
    cx?: number; cy?: number; radius?: number; innerRadius?: number; scale?: 'linear' | 'sqrt';
  }): Array<{ bin: RoseBin; points: number[][]; radius: number }>;
  function roseSVG(azimuths: number[], options?: RoseOptions & { [key: string]: any }): string;
}

export interface BestFitGreatCircle {
  pole: Dcos; axis: Attitude; plane: Attitude; eigenvalues: number[]; girdle: number;
}
export namespace analysis {
  function bestFitGreatCircle(dcos: Dcos[]): BestFitGreatCircle;
  function bestFitPlane(dcos: Dcos[]): { pole: Dcos; plane: Attitude; eigenvalues: number[]; girdle: number };
  function foldAxis(poles: Dcos[]): Attitude;
  function rotateData(dcos: Dcos[], axis: Dcos, angleDeg: number): Dcos[];
  function unfold(dcos: Dcos[], dipDir: number, dip: number): Dcos[];
}

export interface DeviceOrientationOptions { declination?: number; }
export namespace compass {
  function deviceOrientationMatrix(alpha: number, beta: number, gamma: number): Mat3;
  function planeFromDeviceOrientation(alpha: number, beta: number, gamma: number, options?: DeviceOrientationOptions): Attitude;
  function lineFromDeviceOrientation(alpha: number, beta: number, gamma: number, options?: DeviceOrientationOptions): Attitude;
}

export namespace color {
  const scales: { [name: string]: number[][] };
  function sampleScale(name: string, t: number): string;
  function colorScale(name: string, options?: { reverse?: boolean }): (t: number) => string;
  function mapValue(name: string, value: number, min: number, max: number, options?: { reverse?: boolean }): string;
}

export interface DensityGrid {
  grid: Float64Array; gridSize: number; step: number; projR: number; projection: string; method: string;
}
export function computeContours(dcos: Dcos[], options?: ContourOptions & { grid?: DensityGrid }): Array<{ level: number; paths: number[][][] }>;
export function densityGrid(dcos: Dcos[], options?: ContourOptions): DensityGrid;

export function symmetricEigen3(m: Mat3): { values: number[]; vectors: Vec3[] };

export class SvgBuilder {
  constructor(width: number, height: number);
  circle(cx: number, cy: number, r: number, style?: StyleOptions): this;
  line(x1: number, y1: number, x2: number, y2: number, style?: StyleOptions): this;
  polyline(points: number[][], style?: StyleOptions): this;
  path(d: string, style?: StyleOptions): this;
  rect(x: number, y: number, width: number, height: number, style?: StyleOptions): this;
  text(x: number, y: number, content: string, style?: StyleOptions): this;
  group(id: string, children: string): this;
  toString(): string;
  toElement(): SVGElement;
}

export function generateNet(spacing?: number, type?: string): { greatCircles: Dcos[][]; smallCircles: Dcos[][] };
export function cardinalPoints(radius: number, cx: number, cy: number, offset: number): Array<{ label: string; x: number; y: number }>;
export const styleDefaults: { [key: string]: any };
export function mergeStyles(target: object, ...sources: object[]): object;
