/**
 * @module eigen — Closed-form eigenvalue decomposition for 3×3 symmetric matrices.
 *
 * Uses the Cardano / trigonometric method: the characteristic polynomial of a
 * real symmetric 3×3 is a depressed cubic with three real roots, solvable via
 * acos(r)/3.  Eigenvectors from null-space cross products; the middle vector
 * is v1 × v3 so orthogonality is guaranteed by construction.
 */

const TWO_PI_OVER_3 = 2 * Math.PI / 3;

/**
 * Eigenvalue decomposition of a 3×3 symmetric matrix (closed-form, no iteration).
 *
 * @param {number[]} m - 3×3 symmetric matrix, flat row-major (9 elements)
 * @returns {{ values: number[], vectors: number[][] }}
 *   values:  [λ1, λ2, λ3] descending
 *   vectors: [[v1], [v2], [v3]] corresponding orthonormal eigenvectors
 */
export function symmetricEigen3(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a11 = m[4], a12 = m[5];
  const a22 = m[8];

  // --- Eigenvalues via Cardano's trigonometric method -----------------------

  // Off-diagonal energy — if zero the matrix is already diagonal
  const p1 = a01 * a01 + a02 * a02 + a12 * a12;

  if (p1 < 1e-30) {
    const vals = [a00, a11, a22];
    const vecs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    const idx = [0, 1, 2];
    idx.sort((i, j) => vals[j] - vals[i]);
    return {
      values:  [vals[idx[0]], vals[idx[1]], vals[idx[2]]],
      vectors: [vecs[idx[0]], vecs[idx[1]], vecs[idx[2]]],
    };
  }

  const q = (a00 + a11 + a22) / 3;            // mean eigenvalue
  const p2 = (a00 - q) * (a00 - q)
           + (a11 - q) * (a11 - q)
           + (a22 - q) * (a22 - q)
           + 2 * p1;
  const p = Math.sqrt(p2 / 6);

  // B = (A − qI) / p   (symmetric, so only store upper triangle)
  const b00 = (a00 - q) / p, b01 = a01 / p, b02 = a02 / p;
  const b11 = (a11 - q) / p, b12 = a12 / p;
  const b22 = (a22 - q) / p;

  // det(B) for a symmetric matrix
  const detB = b00 * (b11 * b22 - b12 * b12)
             - b01 * (b01 * b22 - b12 * b02)
             + b02 * (b01 * b12 - b11 * b02);

  // r = det(B)/2, clamped to [-1, 1] for numerical safety
  const r = Math.max(-1, Math.min(1, detB / 2));
  const phi = Math.acos(r) / 3;

  // Eigenvalues:  eig1 ≥ eig2 ≥ eig3  by the cosine ordering
  const eig1 = q + 2 * p * Math.cos(phi);
  const eig3 = q + 2 * p * Math.cos(phi + TWO_PI_OVER_3);
  const eig2 = 3 * q - eig1 - eig3;          // trace preservation

  // --- Eigenvectors via null-space cross products ---------------------------

  const v1 = nullVec(a00, a01, a02, a11, a12, a22, eig1);
  const v3 = nullVec(a00, a01, a02, a11, a12, a22, eig3);

  // v2 = v1 × v3  — orthogonal by construction
  let v2 = cross3(v1, v3);
  let len2 = Math.sqrt(v2[0] * v2[0] + v2[1] * v2[1] + v2[2] * v2[2]);

  if (len2 > 1e-10) {
    v2 = [v2[0] / len2, v2[1] / len2, v2[2] / len2];
  } else {
    // Triple (or near-triple) degeneracy — any orthonormal basis works
    v2 = perpendicular(v1);
    const v3new = cross3(v1, v2);
    v3[0] = v3new[0]; v3[1] = v3new[1]; v3[2] = v3new[2];
  }

  return {
    values:  [eig1, eig2, eig3],
    vectors: [v1, v2, v3],
  };
}

// ---------------------------------------------------------------------------
//  Helpers
// ---------------------------------------------------------------------------

/** Null-space vector of (A − λI) via cross products of rows. */
function nullVec(a00, a01, a02, a11, a12, a22, lam) {
  const r0 = [a00 - lam, a01,       a02      ];
  const r1 = [a01,       a11 - lam, a12      ];
  const r2 = [a02,       a12,       a22 - lam];

  // Try all three row-pair cross products; pick the longest
  const c01 = cross3(r0, r1);
  const c02 = cross3(r0, r2);
  const c12 = cross3(r1, r2);

  const l01 = c01[0] * c01[0] + c01[1] * c01[1] + c01[2] * c01[2];
  const l02 = c02[0] * c02[0] + c02[1] * c02[1] + c02[2] * c02[2];
  const l12 = c12[0] * c12[0] + c12[1] * c12[1] + c12[2] * c12[2];

  let v, len;
  if (l01 >= l02 && l01 >= l12) { v = c01; len = Math.sqrt(l01); }
  else if (l02 >= l12)          { v = c02; len = Math.sqrt(l02); }
  else                          { v = c12; len = Math.sqrt(l12); }

  if (len < 1e-14) return [1, 0, 0]; // completely degenerate
  return [v[0] / len, v[1] / len, v[2] / len];
}

/** Cross product of two 3-vectors. */
function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Return a unit vector perpendicular to v. */
function perpendicular(v) {
  const ax = Math.abs(v[0]), ay = Math.abs(v[1]), az = Math.abs(v[2]);
  let u;
  if (ax <= ay && ax <= az)      u = [0, -v[2], v[1]];
  else if (ay <= ax && ay <= az) u = [-v[2], 0, v[0]];
  else                           u = [-v[1], v[0], 0];
  const len = Math.sqrt(u[0] * u[0] + u[1] * u[1] + u[2] * u[2]);
  return [u[0] / len, u[1] / len, u[2] / len];
}
