import { useEffect } from 'react';
import { useCanvas } from './context';

/** Grid — компонент-сетка, рисуется КАЖДЫЙ кадр поверх фона */
export type GridProps = {
  step?: number;
  strokeStyle?: string;
  lineWidth?: number; // в CSS-пикселях
};

/**
 * createSnap
 * ----------
 * Фабрика, помогающая рисовать _чёткие_ (неразмытые) линии на Canvas при любом DPR.
 *
 * Проблема:
 *  - В Canvas координаты задаются в CSS-пикселях, а физические пиксели устройства (device pixels) — дробные.
 *  - Если центр штриха (`stroke`) не попадает ровно на «сетку» физических пикселей, браузер растеризует линию между пикселями → полупрозрачный «размаз».
 *
 * Решение:
 *  - Привести желаемую толщину к _целому числу физических пикселей_.
 *  - Снэпнуть (выравнять) координату линии так, чтобы центр штриха пришёлся _строго по центру_ device-пикселя(ей).
 *
 * Алгоритм:
 *  1) devicePx = max(1, round(lineWidth * dpr))
 *     — требуемая толщина в ФИЗИЧЕСКИХ пикселях, целое число.
 *  2) lw = devicePx / dpr
 *     — реальная толщина в CSS-пикселях для `ctx.lineWidth`.
 *  3) half = (devicePx % 2 === 1) ? (0.5 / dpr) : 0
 *     — смещение центра штриха:
 *       • для НЕЧЁТНОЙ толщины (1, 3, 5 физ. px) центр должен попасть в середину пикселя → +0.5/devicePx в CSS-пикселях;
 *       • для ЧЁТНОЙ толщины (2, 4, 6 физ. px) центр должен лечь на границу между пикселями → смещение не нужно.
 *  4) snap(v) = round(v * dpr) / dpr + half
 *     — выравнивает координату `v` (в CSS-пикселях) к ближайшей «сетке» device-пикселей с учётом нужного смещения.
 *  @param {number} lineWidth - желаемая толщина линии в CSS-пикселях.
 *  @param {number} dpr       - devicePixelRatio, из canvas-контекста
 *  @returns {{ lw: number; snap: (v: number) => number }}
 *    - lw — толщина для `ctx.lineWidth` (в CSS-пикселях), соответствующая целому числу физ. пикселей.
 *    - snap — функция выравнивания координат для построения «острых» линий.
 *
 * Рекомендации:
 *  - Применяйте `snap()` к координатам ЦЕНТРА штриха (X для вертикалей, Y для горизонталей).
 *  - Стройте общий path и вызывайте один `stroke()` для производительности.
 *  - Если у вас есть трансформации (`ctx.setTransform(scale, ...)`), правило остаётся тем же:
 *    работайте в «мировых» (CSS) координатах и подавайте в `snap` именно их.
 *
 * Потенциальные ошибки:
 *  - Задать `ctx.lineCap='round'`/`'square'` и удивляться, что визуальная толщина «пухлее».
 *  - Снэпнуть не ту координату (например, Y для вертикальной линии).
 *  - Не пересчитывать фабрику при изменении DPR.
 */
export const createSnap = ({
  lineWidth = 1,
  dpr = 1,
}: {
  lineWidth: number;
  dpr: number;
}): { lw: number; snap: (v: number) => number } => {
  const devicePx = Math.max(1, Math.round(lineWidth * dpr));
  const lw = devicePx / dpr;
  const half = devicePx % 2 === 1 ? 0.5 / dpr : 0;
  const snap = (v: number) => Math.round(v * dpr) / dpr + half;
  return { lw, snap };
};

export function Grid({
  step = 25,
  strokeStyle = '#d1d5db',
  lineWidth = 1,
}: GridProps) {
  const { size, registerDraw } = useCanvas();

  useEffect(() => {
    return registerDraw((ctx) => {
      const { width, height, dpr } = size;
      const { lw, snap } = createSnap({ lineWidth, dpr });

      ctx.save();

      ctx.lineWidth = lw;
      ctx.lineCap = 'butt';
      ctx.lineJoin = 'miter';
      ctx.strokeStyle = strokeStyle;
      ctx.beginPath();
      for (let x = 0; x <= width; x += step) {
        const X = snap(x);
        ctx.moveTo(X, 0);
        ctx.lineTo(X, height);
      }
      for (let y = 0; y <= height; y += step) {
        const Y = snap(y);
        ctx.moveTo(0, Y);
        ctx.lineTo(width, Y);
      }
      ctx.stroke();

      ctx.restore();
    });
  }, [
    size.width,
    size.height,
    size.dpr,
    step,
    strokeStyle,
    lineWidth,
    registerDraw,
    size,
  ]);

  return null;
}
