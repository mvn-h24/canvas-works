import { createContext, useContext } from 'react';
import type { Matrix } from './matrix';

/** Функция рисования слоя */
export type Drawer = (ctx: CanvasRenderingContext2D, now: number) => void;
/** Вызывается перед отрисовкой. Если вернуло true — требуется перерисовка */
export type Ticker = (dt: number, now: number) => boolean;

export type CanvasApi = {
  /** HTML canvas и его контекст (может быть null сразу после mount) */
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;

  /** Текущий DPR (devicePixelRatio) */
  dpr: number;

  /** CSS‑размеры канваса */
  size: { w: number; h: number };

  /** Мировая матрица (CSS px → CSS px), применяемая поверх DPR */
  world: Matrix;
  /** Установить world (значение или updater) */
  setWorld: (world: Matrix | ((w: Matrix) => Matrix)) => void;

  /** Конвертация точек */
  toScreen: (pt: { x: number; y: number }) => { x: number; y: number };
  toWorld: (pt: { x: number; y: number }) => { x: number; y: number };

  /** Регистрация слоя */
  registerLayer: (opts: {
    draw: Drawer;
    z?: number;
    visible?: boolean;
    /** world — по умолчанию; screen — игнорирует world и использует только DPR */
    space?: 'world' | 'screen';
  }) => () => void;

  /** Регистрация тикера */
  registerTicker: (fn: Ticker) => () => void;

  /** Панорамирование в экранных координатах (CSS px) */
  panByScreen: (dx: number, dy: number) => void;

  /** Зум под точкой экрана (CSS px). k>1 — увеличение */
  zoomAtScreen: (cx: number, cy: number, k: number) => void;

  /** Сброс вида к I */
  resetView: () => void;

  /** Отметить как «грязный» и гарантированно запустить ближайший rAF */
  scheduleRedraw: () => void;
};

export const Ctx = createContext<CanvasApi | null>(null);

export function useCanvas(): CanvasApi {
  const value = useContext(Ctx);
  if (!value) {
    throw new Error('useCanvas() must be used inside <CanvasProvider />');
  }
  return value;
}
