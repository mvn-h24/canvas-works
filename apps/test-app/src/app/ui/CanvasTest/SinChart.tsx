'use client';

import { useEffect, useRef } from 'react';
import { useCanvas } from '@canvas-works/canvas-works';

/** Отрисовка графика функции y = fn(x) с адаптивной дискретизацией и overscan */
export function FunctionPlot({
  fn,
  color = '#111827',
  lineWidth = 2,
  overscan = 0.25, // доля ширины в мировых единицах
}: {
  fn: (x: number) => number;
  color?: string;
  lineWidth?: number;
  overscan?: number;
}) {
  const { registerLayer, toWorld, toScreen, size, dpr } = useCanvas();
  const cacheRef = useRef<{
    range: { x0: number; x1: number } | null;
    pts: Float64Array | null;
    dx: number; // шаг дискретизации (в мировых единицах)
  }>({ range: null, pts: null, dx: NaN });

  useEffect(() => {
    return registerLayer({
      z: 10,
      space: 'world',
      visible: true,
      draw: (ctx) => {
        const W0 = toWorld({ x: 0, y: 0 });
        const W1 = toWorld({ x: size.w, y: 0 });
        let x0 = Math.min(W0.x, W1.x);
        let x1 = Math.max(W0.x, W1.x);
        const widthWorld = x1 - x0;
        // overscan по краям — чтобы при лёгком пане график не «обрезался»
        x0 -= widthWorld * overscan;
        x1 += widthWorld * overscan;

        // 1 CSS px в мировых единицах
        const dxWorldPerPx =
          Math.abs(toWorld({ x: 1, y: 0 }).x - toWorld({ x: 0, y: 0 }).x) ||
          1e-3;
        const dx = dxWorldPerPx; // хотим по одной точке на css-пиксель (достаточно гладко)

        const needRebuild = (() => {
          const cache = cacheRef.current;
          if (!cache.range || !cache.pts) return true;
          const grow = dx / 2; // допускаем небольшую погрешность шага
          const inRange = x0 >= cache.range.x0 && x1 <= cache.range.x1;
          const similarStep = Math.abs(cache.dx - dx) <= grow;
          return !(inRange && similarStep);
        })();

        if (needRebuild) {
          const n = Math.max(2, Math.ceil((x1 - x0) / dx));
          const buf = new Float64Array(n * 2);
          let xi = x0;
          for (let i = 0; i < n; i++, xi += dx) {
            buf[i * 2] = xi;
            buf[i * 2 + 1] = fn(xi);
          }
          cacheRef.current = { range: { x0, x1 }, pts: buf, dx };
        }

        const { pts } = cacheRef.current;
        if (!pts) return;

        ctx.save();
        ctx.lineWidth = Math.max(1 / dpr, lineWidth / dpr);
        ctx.strokeStyle = color;
        ctx.beginPath();
        // Рисуем непрерывно; для разрывных функций можно было бы внедрить NaN-разделители
        ctx.moveTo(pts[0], pts[1]);
        for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
        ctx.stroke();
        ctx.restore();
      },
    });
  }, [
    registerLayer,
    toWorld,
    toScreen,
    size.w,
    size.h,
    dpr,
    color,
    lineWidth,
    overscan,
    fn,
  ]);

  return null;
}

/**
 * Готовый график sin(x): сетка, оси, пан/зум и сам график
 */
export function SinChart() {
  return (
    <>
      {/*<MathGrid />*/}
      <FunctionPlot fn={(x) => Math.sin(x)} color="#2563eb" />
    </>
  );
}

/**
 * Пример использования:
 *
 * <CanvasProvider width={900} height={520} background="#fff">
 *   <SinChart />
 * </CanvasProvider>
 */
