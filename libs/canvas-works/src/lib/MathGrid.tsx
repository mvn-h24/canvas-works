'use client';
import { useEffect } from 'react';
import { useCanvas } from './context';

function pickDecStep(pxPerWorld: number, targetPx: number): number {
  if (!isFinite(pxPerWorld) || pxPerWorld <= 0) return 1;
  const raw = targetPx / pxPerWorld;
  const pow10 = Math.pow(10, Math.floor(Math.log10(raw)));
  const candidates = [1, 2, 5, 10].map((x) => x * pow10);
  return candidates.reduce((best, x) => (Math.abs(x - raw) < Math.abs(best - raw) ? x : best), candidates[0]);
}

function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function align1px(v: number, dpr: number) { return Math.round(v * dpr) / dpr + 0.5 / dpr; }
function roundToStep(v: number, step: number) {
  if (!isFinite(v) || !isFinite(step) || step === 0) return v;
  const n = Math.round(v / step);
  const r = n * step;
  return Object.is(r, -0) ? 0 : r;
}
function formatTickByStep(v: number, step: number): string {
  const abs = Math.abs(step);
  if (abs >= 1) return String(Math.round(v));
  const decimals = Math.max(0, Math.ceil(-Math.log10(abs)));
  return v.toFixed(decimals);
}

export function MathGrid({
                           z = -1000,
                           targetPx = 80,
                           majorEvery = 5,
                           majorLabelScale = 1.15,
                           colorMinor = 'rgba(0,0,0,0.06)',
                           colorMajor = 'rgba(0,0,0,0.12)',
                           axisColor = 'rgba(0,0,0,0.35)',
                           labelColor = 'rgba(0,0,0,0.75)',
                           centerAxes = true,
                         }: {
  z?: number;
  targetPx?: number;
  majorEvery?: number;
  majorLabelScale?: number;
  colorMinor?: string;
  colorMajor?: string;
  axisColor?: string;
  labelColor?: string;
  centerAxes?: boolean;
}) {
  const { registerLayer, size, dpr, toWorld, toScreen } = useCanvas();

  useEffect(() => {
    return registerLayer({
      z,
      space: 'screen',
      visible: true,
      draw: (ctx) => {
        // world bounds of viewport (toWorld принимает CSS px!)
        const tl = toWorld({ x: 0, y: 0 });
        const br = toWorld({ x: size.w, y: size.h });
        const x0 = Math.min(tl.x, br.x);
        const x1 = Math.max(tl.x, br.x);
        const y0 = Math.min(tl.y, br.y);
        const y1 = Math.max(tl.y, br.y);

        // px-per-world (CSS px!)
        const xUnitPx = Math.abs(toScreen({ x: 1, y: 0 }).x - toScreen({ x: 0, y: 0 }).x);
        const yUnitPx = Math.abs(toScreen({ x: 0, y: 1 }).y - toScreen({ x: 0, y: 0 }).y);

        const stepX = pickDecStep(xUnitPx, targetPx);
        const stepY = pickDecStep(yUnitPx, targetPx);

        const iStart = Math.floor(x0 / stepX);
        const iEnd   = Math.ceil (x1 / stepX);
        const jStart = Math.floor(y0 / stepY);
        const jEnd   = Math.ceil (y1 / stepY);

        ctx.lineWidth = 1 / dpr;

        // MINOR verticals
        ctx.strokeStyle = colorMinor;
        ctx.beginPath();
        for (let i = iStart; i <= iEnd; i++) {
          if (majorEvery > 0 && i % majorEvery === 0) continue;
          const x = i * stepX;
          const sx = toScreen({ x, y: 0 }).x; // CSS px
          if (sx < -1 || sx > size.w + 1) continue;
          const ax = align1px(sx, dpr);
          ctx.moveTo(ax, align1px(0, dpr));
          ctx.lineTo(ax, align1px(size.h, dpr));
        }
        ctx.stroke();

        // MAJOR verticals
        ctx.strokeStyle = colorMajor;
        ctx.beginPath();
        for (let i = iStart; i <= iEnd; i++) {
          if (!(majorEvery > 0 && i % majorEvery === 0)) continue;
          const x = i * stepX;
          const sx = toScreen({ x, y: 0 }).x;
          if (sx < -1 || sx > size.w + 1) continue;
          const ax = align1px(sx, dpr);
          ctx.moveTo(ax, align1px(0, dpr));
          ctx.lineTo(ax, align1px(size.h, dpr));
        }
        ctx.stroke();

        // MINOR horizontals
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

        // MAJOR horizontals
        ctx.strokeStyle = colorMajor;
        ctx.beginPath();
        for (let j = jStart; j <= jEnd; j++) {
          if (!(majorEvery > 0 && j % majorEvery === 0)) continue;
          const y = j * stepY;
          const sy = toScreen({ x: 0, y }).y;
          if (sy < -1 || sy > size.h + 1) continue;
          const ay = align1px(sy, dpr);
          ctx.moveTo(align1px(0, dpr), ay);
          ctx.lineTo(align1px(size.w, dpr), ay);
        }
        ctx.stroke();

        // Оси в (0,0)
        const s0 = toScreen({ x: 0, y: 0 }); // CSS px, центр мира
        ctx.strokeStyle = axisColor;
        ctx.beginPath();
        // X axis
        if (s0.y >= -1 && s0.y <= size.h + 1) {
          const ay = align1px(s0.y, dpr);
          ctx.moveTo(align1px(0, dpr), ay);
          ctx.lineTo(align1px(size.w, dpr), ay);
        }
        // Y axis
        if (s0.x >= -1 && s0.x <= size.w + 1) {
          const ax = align1px(s0.x, dpr);
          ctx.moveTo(ax, align1px(0, dpr));
          ctx.lineTo(ax, align1px(size.h, dpr));
        }
        ctx.stroke();

        // Подписи: вдоль видимых осей, не только по краям
        const fontPx = clamp(12 * majorLabelScale, 10, 18);
        ctx.fillStyle = labelColor;

        // X labels
        {
          const minDx = targetPx * 0.8;
          let lastX = -Infinity;

          let yPos: number;
          let baseline: CanvasTextBaseline = 'top';
          if (s0.y >= 0 && s0.y <= size.h) {
            const below = size.h - s0.y;
            if (below >= fontPx + 6) { baseline = 'top'; yPos = s0.y + 4; }
            else { baseline = 'bottom'; yPos = s0.y - 4; }
          } else {
            baseline = 'top'; yPos = size.h - fontPx - 2;
          }

          ctx.textBaseline = baseline;
          ctx.textAlign = 'center';
          ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu`;

          for (let i = iStart; i <= iEnd; i++) {
            if (!(majorEvery > 0 && i % majorEvery === 0)) continue;
            const x = i * stepX;
            const sx = toScreen({ x, y: 0 }).x;
            if (sx < -10 || sx > size.w + 10) continue;
            if (sx - lastX < minDx) continue;
            lastX = sx;
            const v = roundToStep(x, stepX);
            ctx.fillText(formatTickByStep(v, stepX), sx, yPos!);
          }
        }

        // Y labels
        {
          const minDy = targetPx * 0.75;
          let lastY = -Infinity;

          let xPos: number;
          let align: CanvasTextAlign = 'right';
          if (s0.x >= 0 && s0.x <= size.w) {
            const right = size.w - s0.x;
            if (right >= 36) { align = 'left'; xPos = s0.x + 4; }
            else { align = 'right'; xPos = s0.x - 4; }
          } else {
            align = 'left'; xPos = 4;
          }

          ctx.textAlign = align;
          ctx.textBaseline = 'middle';
          ctx.font = `${fontPx}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Ubuntu`;

          for (let j = jStart; j <= jEnd; j++) {
            if (!(majorEvery > 0 && j % majorEvery === 0)) continue;
            const y = j * stepY;
            const sy = toScreen({ x: 0, y }).y;
            if (sy < -10 || sy > size.h + 10) continue;
            if (sy - lastY < minDy) continue;
            lastY = sy;
            const v = roundToStep(y, stepY);
            ctx.fillText(formatTickByStep(v, stepY), xPos!, sy);
          }
        }
      },
    });
  }, [
    registerLayer,
    size.w, size.h, dpr,
    toWorld, toScreen,
    targetPx, z, majorEvery, majorLabelScale,
    colorMinor, colorMajor, axisColor, labelColor,
  ]);

  return null;
}
