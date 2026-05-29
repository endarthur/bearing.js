/**
 * @module special — Special functions for statistical p-values.
 *
 * Log-gamma (Lanczos), regularised incomplete gamma (→ χ² CDF) and regularised
 * incomplete beta (→ F CDF), via the standard series / continued-fraction
 * methods (Numerical Recipes). Dependency-free.
 */

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
const TINY = 1e-300;

/** Natural log of the gamma function. */
export function gammaln(x) {
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - gammaln(1 - x);
  }
  x -= 1;
  let a = LANCZOS[0];
  const t = x + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

// Lower regularised incomplete gamma via series (good for x < a+1).
function gser(a, x) {
  let ap = a, del = 1 / a, sum = del;
  for (let n = 0; n < 300; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gammaln(a));
}

// Upper regularised incomplete gamma Q(a,x) via continued fraction (x ≥ a+1).
function gcf(a, x) {
  let b = x + 1 - a, c = 1 / TINY, d = 1 / b, h = d;
  for (let i = 1; i < 300; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < TINY) d = TINY;
    c = b + an / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return Math.exp(-x + a * Math.log(x) - gammaln(a)) * h;
}

/** Regularised lower incomplete gamma P(a, x) = γ(a,x)/Γ(a). */
export function regularizedGammaP(a, x) {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 0;
  return x < a + 1 ? gser(a, x) : 1 - gcf(a, x);
}

/** χ² cumulative distribution: P(X ≤ x) for k degrees of freedom. */
export function chiSquareCDF(x, k) {
  return x <= 0 ? 0 : regularizedGammaP(k / 2, x / 2);
}

/** χ² survival function (upper tail) = p-value for a χ² statistic. */
export function chiSquareSF(x, k) {
  return 1 - chiSquareCDF(x, k);
}

// Continued fraction for the incomplete beta function.
function betacf(a, b, x) {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < TINY) d = TINY;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < TINY) d = TINY;
    c = 1 + aa / c; if (Math.abs(c) < TINY) c = TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) break;
  }
  return h;
}

/** Regularised incomplete beta I_x(a, b). */
export function regularizedBetaI(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    gammaln(a + b) - gammaln(a) - gammaln(b) + a * Math.log(x) + b * Math.log(1 - x),
  );
  return x < (a + 1) / (a + b + 2)
    ? bt * betacf(a, b, x) / a
    : 1 - bt * betacf(b, a, 1 - x) / b;
}

/** F cumulative distribution: P(X ≤ F) with (d1, d2) degrees of freedom. */
export function fCDF(F, d1, d2) {
  if (F <= 0) return 0;
  return regularizedBetaI(d1 * F / (d1 * F + d2), d1 / 2, d2 / 2);
}

/** F survival function (upper tail) = p-value for an F statistic. */
export function fSF(F, d1, d2) {
  return 1 - fCDF(F, d1, d2);
}
