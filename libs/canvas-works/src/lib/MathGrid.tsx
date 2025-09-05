'use client';
import { useEffect } from 'react';
import { useCanvas } from './context';

/** Выбор десятичного шага: 1-2-5 × 10^n, чтобы расстояние ~ targetPx */
function pickDecStep(pxPerWorld: number, targetPx: number): number {
  if (!isFinite(pxPerWorld) || pxPerWorld <= 0) return 1;
  const raw = targetPx / pxPerWorld; // желаемый шаг в world-единицах
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 5, 10].map((x) => x * pow10);
  return candidates.reduce((best, x) => (Math.abs(x - raw) < Math.abs(best - raw) ? x : best), candidates[0]);
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Выравнивание на полу-пикселя при lineWidth = 1/dpr (1 физ. пиксель) */
function align1px(v: number, dpr: number) {
  const snapped = Math.round(v * dpr) / dpr;
  return snapped + 0.5 / dpr;
}

/** Округление значения к кратному step (устраняем −0) */
function roundToStep(v: number, step: number) {
  if (!isFinite(v) || !isFinite(step) || step === 0) return v;
  const n = Math.round(v / step);
  const r = n * step;
  return Object.is(r, -0) ? 0 : r;
}

function formatTickByStep(v: number, step: number) {
  if (!isFinite(v)) return '';
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-6)) return v.toExponential(2).replace('+', '');
  let decimals = 0;
  if (step < 1) decimals = Math.min(9, Math.max(0, Math.ceil(-Math.log10(step))));
  const s = v.toFixed(decimals);
  return /^-0(\.0+)?$/.test(s) ? s.replace(/^-0/, '0') : s;
}

interface MathGridProps {
  /** Желаемый пиксельный шаг между линиями */
  targetPx?: number;
  /** Цвета */
  colorMinor?: string;
  colorMajor?: string;
  colorAxis?: string;
  labelColor?: string;
  /** Каждая N-ая линия — мажорная */
  majorEvery?: number;
  /** Увеличение шрифта на мажорах */
  majorLabelScale?: number;
  /** Оси через центр viewport (true) или при 0 (false) */
  centerAxes?: boolean;
  /** Порядок компоновки */
  z?: number;
}

export function MathGrid({
                           targetPx = 64,
                           colorMinor = '#e5e7eb',
                           colorMajor = '#cbd5e1',
                           colorAxis = '#94a3b8',
                           labelColor = '#64748b',
                           majorEvery = 5,
                           majorLabelScale = 1.25,
                           centerAxes = false,
                           z = 0,
                         }: MathGridProps) {
  const { registerLayer, size, dpr, toWorld, toScreen } = useCanvas();

  // 1) Сетка + оси (screen-space)
  useEffect(() => {
    return registerLayer({
      z,
      space: 'screen',
      visible: true,
      draw: (ctx) => {
        // world-границы viewport
        const tl = toWorld({ x: 0, y: 0 });
        const br = toWorld({ x: size.w, y: size.h });
        const x0 = Math.min(tl.x, br.x);
        const x1 = Math.max(tl.x, br.x);
        const y0 = Math.min(tl.y, br.y);
        const y1 = Math.max(tl.y, br.y);

        // масштаб world→screen
        const xUnitPx = Math.abs(toScreen({ x: 1, y: 0 }).x - toScreen({ x: 0, y: 0 }).x);
        const yUnitPx = Math.abs(toScreen({ x: 0, y: 1 }).y - toScreen({ x: 0, y: 0 }).y);

        const stepX = pickDecStep(xUnitPx, targetPx);
        const stepY = pickDecStep(yUnitPx, targetPx);

        const iStart = Math.ceil(x0 / stepX);
        const iEnd = Math.floor(x1 / stepX);
        const jStart = Math.ceil(y0 / stepY);
        const jEnd = Math.floor(y1 / stepY);

        ctx.save();
        ctx.lineWidth = 1 / dpr;

        // вертикали: миноры
        ctx.strokeStyle = colorMinor;
        ctx.beginPath();
        for (let i = iStart; i <= iEnd; i++) {
          if (majorEvery > 0 && i % majorEvery === 0) continue;
          const x = i * stepX;
          const sx = toScreen({ x, y: 0 }).x;
          if (sx < -1 || sx > size.w + 1) continue;
          const ax = align1px(sx, dpr);
          ctx.moveTo(ax, align1px(0, dpr));
          ctx.lineTo(ax, align1px(size.h, dpr));
        }
        ctx.stroke();

        // вертикали: мажоры
        if (majorEvery > 0) {
          ctx.strokeStyle = colorMajor;
          ctx.beginPath();
          for (let i = iStart; i <= iEnd; i++) {
            if (i % majorEvery !== 0) continue;
            const x = i * stepX;
            const sx = toScreen({ x, y: 0 }).x;
            if (sx < -1 || sx > size.w + 1) continue;
            const ax = align1px(sx, dpr);
            ctx.moveTo(ax, align1px(0, dpr));
            ctx.lineTo(ax, align1px(size.h, dpr));
          }
          ctx.stroke();
        }

        // горизонтили: миноры
        ctx.strokeStyle = colorMinor;
        ctx.beginPath();
        for (let j = jStart; j <= jEnd; j++) {
          if (majorEvery > 0 && j % majorEvery === 0) continue;
          const y = j * stepY;
          const sy = toScreen({ x: 0, y }).y;
          if (sy < -1 || sy > size.h + 1) continue;
          const ay = align1px(sy, dpr);
          ctx.moveTo(align1px(0, dpr), ay);
          ctx.lineTo(align1px(size.w, dpr), ay);
        }
        ctx.stroke();

        // горизонтили: мажоры
        if (majorEvery > 0) {
          ctx.strokeStyle = colorMajor;
          ctx.beginPath();
          for (let j = jStart; j <= jEnd; j++) {
            if (j % majorEvery !== 0) continue;
            const y = j * stepY;
            const sy = toScreen({ x: 0, y }).y;
            if (sy < -1 || sy > size.h + 1) continue;
            const ay = align1px(sy, dpr);
            ctx.moveTo(align1px(0, dpr), ay);
            ctx.lineTo(align1px(size.w, dpr), ay);
          }
          ctx.stroke();
        }

        // оси
        const zero = toScreen({ x: 0, y: 0 });
        const axisX = centerAxes ? Math.round(size.w / 2) : clamp(Math.round(zero.x), -1e6, 1e6);
        const axisY = centerAxes ? Math.round(size.h / 2) : clamp(Math.round(zero.y), -1e6, 1e6);

        ctx.strokeStyle = colorAxis;
        ctx.beginPath();
        // Oy
        if (axisX >= -1 && axisX <= size.w + 1) {
          const ax = align1px(axisX, dpr);
          ctx.moveTo(ax, align1px(0, dpr));
          ctx.lineTo(ax, align1px(size.h, dpr));
        }
        // Ox
        if (axisY >= -1 && axisY <= size.h + 1) {
          const ay = align1px(axisY, dpr);
          ctx.moveTo(align1px(0, dpr), ay);
          ctx.lineTo(align1px(size.w, dpr), ay);
        }
        ctx.stroke();

        // подписи
        ctx.fillStyle = labelColor;

        // X labels
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const placeTop = axisY > size.h - 24;
        const xLabelY = clamp(axisY + (placeTop ? -18 : 2), 2, size.h - 2);

        let labels = 0;
        const MAX_LABELS = 400;
        let lastX = -1e9;
        for (let i = iStart; i <= iEnd; i++) {
          const x = i * stepX;
          const px = toScreen({ x, y: 0 }).x;
          if (px < -24 || px > size.w + 24) continue;
          const isMajor = majorEvery > 0 && i % majorEvery === 0;
          const fontPx = isMajor ? Math.round(12 * majorLabelScale) : 12;
          const minDx = Math.max(8, Math.floor(0.8 * fontPx));
          if (px - lastX < minDx) continue;
          lastX = px;
          labels++;
          if (labels > MAX_LABELS) break;

          ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu`;
          ctx.fillText(formatTickByStep(roundToStep(x, stepX), stepX), px, xLabelY);
        }

        // Y labels
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        const placeLeft = axisX > size.w - 30;
        const yLabelX = clamp(axisX + (placeLeft ? -4 : 4), 8, size.w - 8);

        let labelsY = 0;
        let lastY = -1e9;
        for (let j = jStart; j <= jEnd; j++) {
          const y = j * stepY;
          const py = toScreen({ x: 0, y }).y;
          if (py < -12 || py > size.h + 12) continue;
          const isMajor = majorEvery > 0 && j % majorEvery === 0;
          const fontPx = isMajor ? Math.round(12 * majorLabelScale) : 12;
          const minDy = Math.max(8, Math.floor(0.8 * fontPx));
          if (py - lastY < minDy) continue;
          lastY = py;
          labelsY++;
          if (labelsY > MAX_LABELS) break;

          ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu`;
          ctx.fillText(formatTickByStep(roundToStep(y, stepY), stepY), yLabelX, py);
        }

        ctx.restore();
      },
    });
  }, [registerLayer, size.w, size.h, dpr, toWorld, toScreen, targetPx, colorMinor, colorMajor, colorAxis, labelColor, majorEvery, majorLabelScale, centerAxes, z]);

  return null;
}
