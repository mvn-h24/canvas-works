export type Matrix = {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}; // [a c e; b d f; 0 0 1]
export const I: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function mul(m1: Matrix, m2: Matrix): Matrix {
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export const translate = (tx: number, ty: number): Matrix => ({
  a: 1,
  b: 0,
  c: 0,
  d: 1,
  e: tx,
  f: ty,
});
export const scale = (sx: number, sy: number): Matrix => ({
  a: sx,
  b: 0,
  c: 0,
  d: sy,
  e: 0,
  f: 0,
});
export const scaleAt = (
  sx: number,
  sy: number,
  px: number,
  py: number
): Matrix => mul(translate(px, py), mul(scale(sx, sy), translate(-px, -py)));

export function invert(m: Matrix): Matrix | null {
  const det = m.a * m.d - m.b * m.c;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null; // guard from singular
  const invDet = 1 / det;
  return {
    a: m.d * invDet,
    b: -m.b * invDet,
    c: -m.c * invDet,
    d: m.a * invDet,
    e: (m.c * m.f - m.d * m.e) * invDet,
    f: (m.b * m.e - m.a * m.f) * invDet,
  };
}

export const apply = (m: Matrix, x: number, y: number) => ({
  x: m.a * x + m.c * y + m.e,
  y: m.b * x + m.d * y + m.f,
});

// Helper: isotropic scale magnitude (length of first column)
export function getScale(m: Matrix): number {
  return Math.hypot(m.a, m.b) || 1;
}

export const getScaleX = (m: Matrix): number => Math.hypot(m.a, m.b) || 1;
export const getScaleY = (m: Matrix): number => Math.hypot(m.c, m.d) || 1;
