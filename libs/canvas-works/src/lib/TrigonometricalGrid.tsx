// TrigonometricalGrid.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useCanvas } from './context';

type Point = { x: number; y: number };

export interface TrigonometricalGridProps {
  /** Z-index в стеке canvas-слоёв (больше — выше) */
  z?: number;
  /** Показывать ли тонкую «минорную» сетку (π/2, π/4 и т.п.) */
  showMinor?: boolean;
}

/** |Δx| в CSS пикселях */
function distX(a: Point, b: Point) {
  return Math.abs(a.x - b.x);
}
/** |Δy| в CSS пикселях */
function distY(a: Point, b: Point) {
  return Math.abs(a.y - b.y);
}

/** Форматирование обычных чисел (для оси Y) */
function fmtNumber(x: number) {
  if (!isFinite(x)) return '';
  if (Math.abs(x) < 1e-9) return '0';
  const abs = Math.abs(x);
  if (abs >= 1e-3 && abs < 1e6) {
    const s = x.toFixed(6).replace(/\.?0+$/, '');
    return s;
  }
  return x.toExponential(2).replace(/\+?0*(e[+-]?)/i, '$1');
}

/** Округление вниз к ближайшему кратному step */
function floorToStep(x: number, step: number) {
  return Math.floor(x / step) * step;
}
/** Округление вверх к ближайшему кратному step */
function ceilToStep(x: number, step: number) {
  return Math.ceil(x / step) * step;
}

/**
 * «Красивый» шаг для оси Y: 1, 2, 2.5, 5, 10 × 10^k
 * targetPx — желаемое расстояние между линиями в пикселях.
 */
function pickNiceStep(pxPerUnit: number, targetPx: number) {
  const candidates = [1, 2, 2.5, 5, 10];
  const unitsPerTarget = Math.max(1e-12, targetPx / Math.max(1e-12, pxPerUnit));
  const p10 = Math.pow(10, Math.floor(Math.log10(unitsPerTarget)));
  let best = candidates[0] * p10;
  let bestDiff = Infinity;
  for (let k = -1; k <= 3; k++) {
    for (const c of candidates) {
      const step = c * p10 * Math.pow(10, k);
      const diff = Math.abs(step * pxPerUnit - targetPx);
      if (diff < bestDiff) {
        bestDiff = diff;
        best = step;
      }
    }
  }
  return best;
}

/**
 * Шаг по X в радианах как кратный π·2^n (или π/2^n),
 * чтобы расстояние между вертикальными линиями ≈ targetPx.
 * (хочешь сетку по π/6 — можно расширить кандидатов на деление на 3)
 */
function pickRadianStep(pxPerUnitX: number, targetPx: number) {
  let best = Math.PI;
  let bestDiff = Infinity;
  for (let n = -6; n <= 6; n++) {
    const step = Math.PI * Math.pow(2, n); // π/64 ... 64π
    const diff = Math.abs(step * pxPerUnitX - targetPx);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = step;
    }
  }
  return Math.max(1e-12, best);
}

/** НОД для целых */
function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a || 1;
}

/**
 * Форматирует x (радианы) как кратное π: "-3π/2", "π/4", "2π", "0".
 * Делитель из {1,2,4,8,16,32,64}, дробь сокращается.
 */
function fmtRadian(x: number) {
  if (!isFinite(x)) return '';
  if (Math.abs(x) < 1e-9) return '0';
  const t = x / Math.PI;
  const denoms = [1, 2, 4, 8, 16, 32, 64];
  let bestStr = '';
  let bestDiff = Infinity;
  for (const d of denoms) {
    const n = Math.round(t * d);
    const approx = n / d;
    const diff = Math.abs(approx - t);
    if (diff < bestDiff) {
      bestDiff = diff;
      const g = gcd(n, d);
      const nn = n / g;
      const dd = d / g;
      const sign = nn < 0 ? '-' : '';
      const N = Math.abs(nn);
      if (N === 0) {
        bestStr = '0';
      } else if (dd === 1) {
        bestStr = N === 1 ? `${sign}π` : `${sign}${N}π`;
      } else {
        const coeff = N === 1 ? '' : `${N}`;
        bestStr = `${sign}${coeff}π/${dd}`;
      }
    }
  }
  return bestStr;
}

export function TrigonometricalGrid({ z = 0, showMinor = true }: TrigonometricalGridProps) {
  const { dpr, size, toWorld, toScreen, registerLayer, resetView, world } = useCanvas();

  // автоцентрирование (0,0), как в MathGrid.tsx
  const didAutoCenterRef = useRef(false);
  useEffect(() => {
    if (didAutoCenterRef.current) return;
    if (size.w <= 0 || size.h <= 0) return;

    const s0 = toScreen({ x: 0, y: 0 });
    const nearCenter =
      Math.abs(s0.x - size.w / 2) < 0.5 && Math.abs(s0.y - size.h / 2) < 0.5;

    if (nearCenter) {
      didAutoCenterRef.current = true;
      return;
    }

    const unscaled =
      Math.abs(world.a - 1) < 1e-9 &&
      Math.abs(world.d - 1) < 1e-9 &&
      Math.abs(world.b) < 1e-9 &&
      Math.abs(world.c) < 1e-9;

    const nearTopLeft = Math.abs(s0.x) < 0.5 && Math.abs(s0.y) < 0.5;
    if (nearTopLeft || unscaled) {
      resetView();
    }
  }, [size.w, size.h, toScreen, resetView, world.a, world.b, world.c, world.d]);

  useEffect(() => {
    return registerLayer({
      z,
      space: 'screen',
      visible: true,
      draw: (ctx) => {
        const W = Math.max(0, Math.floor(size.w));
        const H = Math.max(0, Math.floor(size.h));
        if (W === 0 || H === 0) return;

        // масштаб: пикселей на единицу мира
        const s00 = toScreen({ x: 0, y: 0 });
        const s10 = toScreen({ x: 1, y: 0 });
        const s01 = toScreen({ x: 0, y: 1 });
        const pxPerUnitX = Math.max(1e-9, distX(s10, s00));
        const pxPerUnitY = Math.max(1e-9, distY(s01, s00));

        // X: шаги кратные π·2^n; Y: «красивые» шаги
        const majorStepX = pickRadianStep(pxPerUnitX, 110);
        const minorStepX = majorStepX / 2;

        const majorStepY = pickNiceStep(pxPerUnitY, 110);
        const minorStepY = majorStepY / 5;

        // видимая область (world)
        const worldTL = toWorld({ x: 0, y: 0 });
        const worldBR = toWorld({ x: W, y: H });
        const x0 = Math.min(worldTL.x, worldBR.x);
        const x1 = Math.max(worldTL.x, worldBR.x);
        const y0 = Math.min(worldTL.y, worldBR.y);
        const y1 = Math.max(worldTL.y, worldBR.y);

        const xStartMinor = floorToStep(x0, minorStepX);
        const xEndMinor   = ceilToStep(x1, minorStepX);
        const yStartMinor = floorToStep(y0, minorStepY);
        const yEndMinor   = ceilToStep(y1, minorStepY);

        const xStartMajor = floorToStep(x0, majorStepX);
        const xEndMajor   = ceilToStep(x1, majorStepX);
        const yStartMajor = floorToStep(y0, majorStepY);
        const yEndMajor   = ceilToStep(y1, majorStepY);

        const thin  = Math.max(0.5, 0.5 * dpr);
        const mid   = Math.max(1.0, 1.0 * dpr);
        const thick = Math.max(1.5, 1.5 * dpr);

        ctx.save();

        // минорная сетка
        if (showMinor) {
          ctx.beginPath();
          for (let x = xStartMinor; x <= xEndMinor; x += minorStepX) {
            if (Math.abs(x / majorStepX - Math.round(x / majorStepX)) < 1e-9) continue;
            const sx = toScreen({ x, y: 0 }).x;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, H);
          }
          for (let y = yStartMinor; y <= yEndMinor; y += minorStepY) {
            if (Math.abs(y / majorStepY - Math.round(y / majorStepY)) < 1e-9) continue;
            const sy = toScreen({ x: 0, y }).y;
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.08)';
          ctx.lineWidth = thin;
          ctx.stroke();
        }

        // мажорная сетка
        ctx.beginPath();
        for (let x = xStartMajor; x <= xEndMajor; x += majorStepX) {
          const sx = toScreen({ x, y: 0 }).x;
          ctx.moveTo(sx, 0);
          ctx.lineTo(sx, H);
        }
        for (let y = yStartMajor; y <= yEndMajor; y += majorStepY) {
          const sy = toScreen({ x: 0, y }).y;
          ctx.moveTo(0, sy);
          ctx.lineTo(W, sy);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.15)';
        ctx.lineWidth = thin;
        ctx.stroke();

        // специальные линии y=±1 (для sin/cos)
        {
          const ySpecial = [-1, 1];
          ctx.beginPath();
          for (const yy of ySpecial) {
            if (yy < y0 - 1e-9 || yy > y1 + 1e-9) continue;
            const sy = toScreen({ x: 0, y: yy }).y;
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.25)';
          ctx.lineWidth = mid;
          ctx.stroke();
        }

        // оси
        ctx.beginPath();
        const axisXScreen = toScreen({ x: 0, y: 0 }).x;
        const axisYScreen = toScreen({ x: 0, y: 0 }).y;
        const xAxisVisible = axisYScreen >= 0 && axisYScreen <= H;
        const yAxisVisible = axisXScreen >= 0 && axisXScreen <= W;
        if (yAxisVisible) {
          ctx.moveTo(axisXScreen, 0);
          ctx.lineTo(axisXScreen, H);
        }
        if (xAxisVisible) {
          ctx.moveTo(0, axisYScreen);
          ctx.lineTo(W, axisYScreen);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = thick;
        ctx.stroke();

        // засечки и подписи
        ctx.font =
          '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        const tickLen = 6;
        ctx.lineWidth = Math.max(1.0, 1.0 * dpr);
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';

        // X (в π-нотации)
        if (xAxisVisible) {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'top';
          ctx.beginPath();
          for (let x = xStartMajor; x <= xEndMajor; x += majorStepX) {
            const sx = toScreen({ x, y: 0 }).x;
            ctx.moveTo(sx, axisYScreen - tickLen);
            ctx.lineTo(sx, axisYScreen + tickLen);
          }
          ctx.stroke();
          for (let x = xStartMajor; x <= xEndMajor; x += majorStepX) {
            if (Math.abs(x) < 1e-9) continue; // не дублируем 0
            const sx = toScreen({ x, y: 0 }).x;
            ctx.fillText(fmtRadian(x), sx, axisYScreen + tickLen + 2);
          }
        }

        // Y (обычные числа)
        if (yAxisVisible) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.beginPath();
          for (let y = yStartMajor; y <= yEndMajor; y += majorStepY) {
            const sy = toScreen({ x: 0, y }).y;
            ctx.moveTo(axisXScreen - tickLen, sy);
            ctx.lineTo(axisXScreen + tickLen, sy);
          }
          ctx.stroke();
          for (let y = yStartMajor; y <= yEndMajor; y += majorStepY) {
            if (Math.abs(y) < 1e-9) continue;
            const sy = toScreen({ x: 0, y }).y;
            ctx.fillText(fmtNumber(y), axisXScreen + tickLen + 3, sy);
          }
        }

        // подписи осей
        if (xAxisVisible) {
          ctx.textAlign = 'right';
          ctx.textBaseline = 'bottom';
          ctx.fillText('x', W - 4, axisYScreen - 4);
        }
        if (yAxisVisible) {
          ctx.textAlign = 'left';
          ctx.textBaseline = 'top';
          ctx.fillText('y', axisXScreen + 4, 4);
        }

        ctx.restore();
      },
    });
  }, [z, dpr, size.w, size.h, toWorld, toScreen, registerLayer, showMinor]);

  return null;
}

export default TrigonometricalGrid;
