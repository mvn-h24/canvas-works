'use client';
import { useEffect } from 'react';
import { useCanvas } from './context';

/** Grid — компонент-сетка, рисуется каждый кадр поверх фона (screen-space), с учётом DPR */
interface GridProps {
  step?: number;
  strokeStyle?: string;
  lineWidth?: number;
  z?: number;
  visible?: boolean;
}

/** Возвращает реальную толщину линии (lw) в CSS px и функцию snap(v) для выравнивания координат к физическим пикселям.
 *
 * Идея:
 *   devicePx = round(lineWidth * dpr)  → рисуем ровно целым количеством физпикселей
 *   если devicePx нечётное → центр штриха должен лежать на полупикселе CSS, поэтому сдвигаем на 0.5/dpr
 *   snap(v) округляет координату к ближайшему центру пиксельной сетки с учётом этого сдвига
 */
const createSnap = ({
  lineWidth = 1,
  dpr,
}: {
  lineWidth: number;
  dpr: number;
}) => {
  const devicePx = Math.max(1, Math.round(lineWidth * dpr));
  const lw = devicePx / dpr;
  const offset = devicePx % 2 === 1 ? 0.5 / dpr : 0; // чётная толщина → 0, нечётная → 0.5/dpr
  const snap = (v: number) => Math.round((v + offset) * dpr) / dpr - offset;
  return { lw, snap };
};

export function Grid({
  step = 20,
  strokeStyle = '#e5e7eb',
  lineWidth = 1,
  z = 10,
  visible = true,
}: GridProps) {
  const { registerLayer, size, dpr } = useCanvas();

  useEffect(() => {
    if (!visible) return;
    return registerLayer({
      z,
      visible,
      space: 'screen',
      draw: (ctx) => {
        const { w, h } = size;
        const { lw, snap } = createSnap({ lineWidth, dpr });

        ctx.save();
        ctx.lineWidth = lw;
        ctx.strokeStyle = strokeStyle;
        ctx.beginPath();

        const startX = 0;
        const endX = w;
        const firstV = Math.ceil(startX / step) * step;
        for (let x = firstV; x <= endX; x += step) {
          const xs = snap(x);
          ctx.moveTo(xs, 0);
          ctx.lineTo(xs, h);
        }

        const startY = 0;
        const endY = h;
        const firstH = Math.ceil(startY / step) * step;
        for (let y = firstH; y <= endY; y += step) {
          const ys = snap(y);
          ctx.moveTo(0, ys);
          ctx.lineTo(w, ys);
        }

        ctx.stroke();
        ctx.restore();
      },
    });
  }, [
    registerLayer,
    step,
    strokeStyle,
    lineWidth,
    z,
    visible,
    size.w,
    size.h,
    dpr,
    size,
  ]);

  return null;
}
