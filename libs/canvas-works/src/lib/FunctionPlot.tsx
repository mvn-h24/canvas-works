'use client';

import { useEffect, useRef } from 'react';
import { useCanvas } from './context';

/**
 * Отрисовка графика функции y = fn(x) с:
 *  - адаптивной поддискретизацией по пиксельной длине сегмента
 *  - корректной обработкой разрывов (NaN/Infinity/выбросы) — разрываем линию
 *  - overscan по X, чтобы не было обрубов при лёгком пане/зума
 *  - кэшированием Path2D на диапазон + шаг масштаба
 */
export function FunctionPlot({
  fn,
  color = '#111827',
  lineWidth = 1,
  overscan = 0.25, // доля ширины в мировых единицах (слева/справа)
  pxStep = 1, // целевой шаг по X в пикселях экрана
  maxSegmentPx = 4, // максимально допустимая длина отрисовываемого сегмента в px (адаптивная поддискретизация)
  yLimit = 1e6, // мягкое ограничение по модулю Y; выше — считаем разрывом и рвём линию
  maxDepth = 12, // ограничение рекурсии при поддискретизации
  maxPoints = 200_000, // предохранитель от «взрыва» количества точек
}: {
  fn: (x: number) => number;
  color?: string;
  lineWidth?: number;
  overscan?: number;
  pxStep?: number;
  maxSegmentPx?: number;
  yLimit?: number;
  maxDepth?: number;
  maxPoints?: number;
}) {
  const { registerLayer, toWorld, toScreen, size, dpr } = useCanvas();

  type Cache = {
    range: { x0: number; x1: number } | null;
    worldPerPx: number;
    path: Path2D | null;
  };

  const cacheRef = useRef<Cache>({ range: null, worldPerPx: NaN, path: null });

  useEffect(() => {
    return registerLayer({
      z: 10,
      space: 'world',
      visible: true,
      draw: (ctx) => {
        // Текущий видимый диапазон по X в мировых координатах
        const W0 = toWorld({ x: 0, y: 0 });
        const W1 = toWorld({ x: size.w, y: 0 });
        let x0 = Math.min(W0.x, W1.x);
        let x1 = Math.max(W0.x, W1.x);
        const widthWorld = x1 - x0;

        // overscan — расширяем диапазон слева/справа
        x0 -= widthWorld * overscan;
        x1 += widthWorld * overscan;

        // Сколько мировых единиц приходится на 1 CSS-пиксель по X
        const worldPerPx =
          Math.abs(toWorld({ x: 1, y: 0 }).x - toWorld({ x: 0, y: 0 }).x) ||
          1e-6;

        // Решаем — пересобирать Path2D или используем кэш
        const needRebuild = (() => {
          const cache = cacheRef.current;
          if (!cache.path || !cache.range) return true;
          // Если новый диапазон целиком внутри кэшированного — можно не пересобирать.
          const inRange = x0 >= cache.range.x0 && x1 <= cache.range.x1;
          // И масштаб (worldPerPx) близок к кэшированному.
          const scaleClose =
            Math.abs(cache.worldPerPx - worldPerPx) <= worldPerPx * 0.25;
          return !(inRange && scaleClose);
        })();

        if (needRebuild) {
          cacheRef.current = {
            range: { x0, x1 },
            worldPerPx,
            path: buildPath({
              fn,
              toScreen,
              x0,
              x1,
              pxStep,
              maxSegmentPx,
              yLimit,
              maxDepth,
              maxPoints,
            }),
          };
        }

        const path = cacheRef.current.path;
        if (!path) return;

        ctx.save();
        // Так как CanvasProvider обычно уже масштабирует под dpr, держим «визуальную» толщину
        const scaleX =
          Math.abs(toScreen({ x: 1, y: 0 }).x - toScreen({ x: 0, y: 0 }).x) ||
          1;
        // Нескалируемый штрих: толщина задаётся в CSS-пикселях и не «распухает» при зуме
        ctx.lineWidth = lineWidth / scaleX;
        ctx.strokeStyle = color;
        ctx.stroke(path);
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
    pxStep,
    maxSegmentPx,
    yLimit,
    maxDepth,
    maxPoints,
  ]);

  return null;
}

// === Helpers ===

function buildPath({
  fn,
  toScreen,
  x0,
  x1,
  pxStep,
  maxSegmentPx,
  yLimit,
  maxDepth,
  maxPoints,
}: {
  fn: (x: number) => number;
  toScreen: (p: { x: number; y: number }) => { x: number; y: number };
  x0: number;
  x1: number;
  pxStep: number;
  maxSegmentPx: number;
  yLimit: number;
  maxDepth: number;
  maxPoints: number;
}): Path2D {
  const path = new Path2D();
  let penDown = false;
  let lastX: number | null = null;
  let lastY: number | null = null;
  let points = 0;

  // Безопасный вызов fn
  const safeY = (x: number): number | null => {
    let y: number;
    try {
      y = fn(x);
    } catch {
      return null;
    }
    if (!Number.isFinite(y) || Math.abs(y) > yLimit) return null;
    return y;
  };

  // Рекурсивная поддискретизация до тех пор, пока сегмент не станет «коротким» в px
  const addSegment = (ax: number, ay: number, bx: number, depth: number) => {
    if (points > maxPoints) return;
    const by = safeY(bx);
    if (by == null) {
      // разрыв — поднимаем перо
      penDown = false;
      lastX = lastY = null;
      return;
    }

    const p0 = toScreen({ x: ax, y: ay });
    const p1 = toScreen({ x: bx, y: by });
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= maxSegmentPx || depth >= maxDepth) {
      if (!penDown) {
        path.moveTo(ax, ay);
        penDown = true;
        points++;
      }
      path.lineTo(bx, by);
      points++;
      lastX = bx;
      lastY = by;
      return;
    }

    // Поддискретизация по середине
    const mid = (ax + bx) / 2;
    const my = safeY(mid);
    if (my == null) {
      // середина — разрыв, дробим дальше по половинкам
      addSegment(ax, ay, mid, depth + 1);
      penDown = false;
      lastX = lastY = null;
      addSegment(mid, ay, bx, depth + 1); // ay здесь не используется, но тип совпадает
      return;
    }

    addSegment(ax, ay, mid, depth + 1);
    addSegment(mid, my, bx, depth + 1);
  };

  // Вычислим шаг по X в мировых единицах из целевого шага в px: берём линейную аппроксимацию по краю
  const estimateWorldStep = () => {
    // берём точку слева, сдвигаем на pxStep в экранных координатах по X и обратно в мир
    // Чтобы не зависеть от нелинейностей при сильном зуме, считываем дифференциал около левого края
    const s0 = toScreen({ x: x0, y: 0 });
    const s1 = { x: s0.x + pxStep, y: s0.y };
    const w1 = screenToWorldX(s1.x, toScreen, x0);
    const dxWorld = Math.abs(w1 - x0);
    return dxWorld > 1e-12
      ? dxWorld
      : (x1 - x0) / Math.max(1000, (x1 - x0) * 100);
  };

  const stepWorld = estimateWorldStep();
  const n = Math.max(2, Math.ceil((x1 - x0) / stepWorld));

  for (let i = 0; i <= n; i++) {
    const x = i === n ? x1 : x0 + i * stepWorld;
    const y = safeY(x);

    if (y == null) {
      penDown = false;
      lastX = lastY = null;
      continue;
    }

    if (lastX == null || lastY == null) {
      // старт нового непрерывного участка
      path.moveTo(x, y);
      penDown = true;
      lastX = x;
      lastY = y;
      points++;
      continue;
    }

    addSegment(lastX, lastY, x, 0);
    if (points > maxPoints) break;
  }

  return path;
}

/**
 * Вспомогательная функция: обратное преобразование только по X.
 * Т.к. canvas-works предоставляет только toScreen, мы оцениваем обратное преобразование
 * через бинарный поиск по X в мире, сопоставляя screen.x. Это локальная оценка,
 * достаточная для определения шага по X в мире из pxStep.
 */
function screenToWorldX(
  screenX: number,
  toScreen: (p: { x: number; y: number }) => { x: number; y: number },
  guessWorldX: number
): number {
  // локальный численный инвертор по X
  let lo = guessWorldX - 1;
  let hi = guessWorldX + 1;
  const target = screenX;

  // расширяем диапазон, пока целевое значение вне [lo, hi]
  const f = (x: number) => toScreen({ x, y: 0 }).x;
  let flo = f(lo);
  let fhi = f(hi);
  let expand = 0;
  while (
    !((flo <= target && target <= fhi) || (fhi <= target && target <= flo))
  ) {
    const span = hi - lo;
    lo -= span;
    hi += span;
    flo = f(lo);
    fhi = f(hi);
    if (++expand > 20) return guessWorldX; // fallback
  }

  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const fmid = f(mid);
    if (fmid === target) return mid;
    if (fmid < target === flo < fhi) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
