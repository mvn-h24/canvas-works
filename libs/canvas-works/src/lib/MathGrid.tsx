// MathGrid.tsx
'use client';

import { useEffect, useRef } from 'react';
import { useCanvas } from './context';

type Point = { x: number; y: number };

export interface MathGridProps {
  /** Z-index в стеке canvas-слоёв (больше — выше) */
  z?: number;
  /** Показывать ли вспомогательную «тонкую» сетку между мажорными линиями */
  showMinor?: boolean;
}

function distX(a: Point, b: Point) {
  return Math.abs(a.x - b.x);
}

function distY(a: Point, b: Point) {
  return Math.abs(a.y - b.y);
}

function fmtNumber(x: number) {
  // Небольшое форматирование чисел для подписей осей
  if (!isFinite(x)) return '';
  if (Math.abs(x) < 1e-9) return '0';
  // Если число «красивое» — показываем без лишних знаков
  const abs = Math.abs(x);
  if (abs >= 1e-3 && abs < 1e6) {
    const s = x.toFixed(6).replace(/\.?0+$/, '');
    return s;
  }
  // Иначе в экспоненциальном
  return x.toExponential(2).replace(/\+?0*(e[+-]?)/i, '$1');
}

/**
 * Подбирает «красивый» шаг сетки, исходя из текущего масштаба
 * так, чтобы интервалы на экране были близки к targetPx.
 */
function pickNiceStep(pxPerUnit: number, targetPx: number) {
  // Список «приятных» коэффициентов
  const candidates = [1, 2, 2.5, 5, 10];
  // Нормализуем: сколько единиц мира на targetPx
  const unitsPerTarget = Math.max(1e-12, targetPx / Math.max(1e-12, pxPerUnit));

  // Вычисляем порядок величины
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
 * Округление вниз к ближайшему кратному step
 */
function floorToStep(x: number, step: number) {
  return Math.floor(x / step) * step;
}

/**
 * Округление вверх к ближайшему кратному step
 */
function ceilToStep(x: number, step: number) {
  return Math.ceil(x / step) * step;
}

export function MathGrid({ z = 0, showMinor = false }: MathGridProps) {
  const {
    dpr,
    size, // { w, h } в CSS px
    toWorld,
    toScreen,
    registerLayer,
    resetView,
    world,
  } = useCanvas();

  // ---- Автоцентрирование (0,0) при первом появлении/изменении реального размера канваса ----
  // Проблема: resetView() вызывался слишком рано (до того как CanvasProvider измерит фактический CSS‑размер)
  // и центрировался на дефолтных 300×150. После ресайза матрица оставалась с переводом на 150,75 — отсюда «сбитый» центр.
  // Решение: центрируем «лениво», пока (0,0) не окажется близко к геометрическому центру текущего размера.
  // Разрешаем повторный reset при первом изменении size, но только пока нет масштабирования/поворота (world≈единичная + сдвиг).
  const didAutoCenterRef = useRef(false);
  useEffect(() => {
    if (didAutoCenterRef.current) return;
    if (size.w <= 0 || size.h <= 0) return;

    const s0 = toScreen({ x: 0, y: 0 });
    const nearCenter =
      Math.abs(s0.x - size.w / 2) < 0.5 && Math.abs(s0.y - size.h / 2) < 0.5;

    if (nearCenter) {
      // Центр достигнут — можно прекратить автологику
      didAutoCenterRef.current = true;
      return;
    }

    // Без зума/поворота — только сдвиг (начальные состояния)
    const unscaled =
      Math.abs(world.a - 1) < 1e-9 &&
      Math.abs(world.d - 1) < 1e-9 &&
      Math.abs(world.b) < 1e-9 &&
      Math.abs(world.c) < 1e-9;

    // Первичный старт (0,0 возле левого верхнего угла) или мы всё еще в «не зумленном» состоянии — можно сбросить
    const nearTopLeft = Math.abs(s0.x) < 0.5 && Math.abs(s0.y) < 0.5;
    if (nearTopLeft || unscaled) {
      resetView(); // поместить (0,0) в геометрический центр текущего CSS‑размера
      // ВАЖНО: не отмечаем didAutoCenterRef = true здесь. Дождемся следующего рендера и проверим, что реально попали в центр.
    }
  }, [size.w, size.h, toScreen, resetView, world.a, world.b, world.c, world.d]);

  // ---- Слой сетки ----
  useEffect(() => {
    return registerLayer({
      z,
      space: 'screen',
      visible: true,
      draw: (ctx) => {
        const W = Math.max(0, Math.floor(size.w));
        const H = Math.max(0, Math.floor(size.h));
        if (W === 0 || H === 0) return;

        // Вычисляем текущий масштаб: сколько пикселей на единицу мира по осям
        const s00 = toScreen({ x: 0, y: 0 });
        const s10 = toScreen({ x: 1, y: 0 });
        const s01 = toScreen({ x: 0, y: 1 });
        const pxPerUnitX = Math.max(1e-9, distX(s10, s00));
        const pxPerUnitY = Math.max(1e-9, distY(s01, s00));

        // Подбираем шаги для мажорной сетки (около 100px между линиями)
        const majorStepX = pickNiceStep(pxPerUnitX, 110);
        const majorStepY = pickNiceStep(pxPerUnitY, 110);

        // И минорная сетка — 5 делений
        const minorStepX = majorStepX / 5;
        const minorStepY = majorStepY / 5;

        // Вычисляем видимую область в world-координатах
        const worldTL = toWorld({ x: 0, y: 0 });
        const worldBR = toWorld({ x: W, y: H });
        const x0 = Math.min(worldTL.x, worldBR.x);
        const x1 = Math.max(worldTL.x, worldBR.x);
        const y0 = Math.min(worldTL.y, worldBR.y);
        const y1 = Math.max(worldTL.y, worldBR.y);

        // Диапазоны для сетки
        const xStartMinor = floorToStep(x0, minorStepX);
        const xEndMinor = ceilToStep(x1, minorStepX);
        const yStartMinor = floorToStep(y0, minorStepY);
        const yEndMinor = ceilToStep(y1, minorStepY);

        const xStartMajor = floorToStep(x0, majorStepX);
        const xEndMajor = ceilToStep(x1, majorStepX);
        const yStartMajor = floorToStep(y0, majorStepY);
        const yEndMajor = ceilToStep(y1, majorStepY);

        // Тонкие линии
        ctx.save();
        const thin = Math.max(0.5, 0.5 * dpr);
        const mid = Math.max(1, 1 * dpr);
        const thick = Math.max(1.5, 1.5 * dpr);

        if (showMinor) {
          ctx.beginPath();
          for (let x = xStartMinor; x <= xEndMinor; x += minorStepX) {
            // пропускаем мажорные, чтобы не наслаивать толщину
            if (Math.abs(x / majorStepX - Math.round(x / majorStepX)) < 1e-9)
              continue;
            const sx = toScreen({ x, y: 0 }).x;
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, H);
          }
          for (let y = yStartMinor; y <= yEndMinor; y += minorStepY) {
            if (Math.abs(y / majorStepY - Math.round(y / majorStepY)) < 1e-9)
              continue;
            const sy = toScreen({ x: 0, y }).y;
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
          }
          ctx.strokeStyle = 'rgba(0,0,0,0.08)';
          ctx.lineWidth = thin;
          ctx.stroke();
        }

        // Толстые линии (мажор)
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

        // Оси (X=0, Y=0)
        ctx.beginPath();
        // Где на экране проходит ось
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

        // Засечки и подписи на осях ТОЛЬКО для мажорных делений
        ctx.font =
          '12px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial';
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';

        const tickLen = 6; // длина засечки в px
        ctx.lineWidth = mid;
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';

        // Вертикальные засечки на оси X и подписи X-координат
        if (xAxisVisible) {
          ctx.beginPath();
          for (let x = xStartMajor; x <= xEndMajor; x += majorStepX) {
            const sx = toScreen({ x, y: 0 }).x;
            ctx.moveTo(sx, axisYScreen - tickLen);
            ctx.lineTo(sx, axisYScreen + tickLen);
          }
          ctx.stroke();

          for (let x = xStartMajor; x <= xEndMajor; x += majorStepX) {
            if (Math.abs(x) < 1e-9) continue; // не дублируем 0 на пересечении осей
            const sx = toScreen({ x, y: 0 }).x;
            ctx.fillText(fmtNumber(x), sx, axisYScreen + tickLen + 2);
          }
        }

        // Горизонтальные засечки на оси Y и подписи Y-координат
        if (yAxisVisible) {
          ctx.beginPath();
          for (let y = yStartMajor; y <= yEndMajor; y += majorStepY) {
            const sy = toScreen({ x: 0, y }).y;
            ctx.moveTo(axisXScreen - tickLen, sy);
            ctx.lineTo(axisXScreen + tickLen, sy);
          }
          ctx.stroke();

          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          for (let y = yStartMajor; y <= yEndMajor; y += majorStepY) {
            if (Math.abs(y) < 1e-9) continue; // не дублируем 0 на пересечении осей
            const sy = toScreen({ x: 0, y }).y;
            ctx.fillText(fmtNumber(y), axisXScreen - tickLen - 4, sy);
          }
        }

        // Подпись осей (стрелочки)
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
