import { createContext, useContext } from 'react';

/** Функция рисования, вызываемая для данного слоя */
export type Drawer = (ctx: CanvasRenderingContext2D, now: number) => void;

/** Вызывается перед отрисовкой. Если верно, оно изменило состояние и требует перерисовки. */
export type Ticker = (dt: number, now: number) => boolean;

/** 2D matrix (DOMMatrix-free) */
export type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };

export type CanvasApi = {
  /** HTML canvas element and its 2d context (may be null just after mount) */
  canvas: HTMLCanvasElement | null;
  ctx: CanvasRenderingContext2D | null;

  /** Device-pixel ratio used for backing store scaling */
  dpr: number;

  /** CSS pixel size of the canvas */
  size: { w: number; h: number };

  /** World transform applied on top of DPR (CSS px units) */
  world: Matrix;

  /** Update world transform (set or updater fn) */
  setWorld: (world: Matrix | ((w: Matrix) => Matrix)) => void;

  /** Convert a CSS-pixel point to device pixels (screen) and vice versa */
  toScreen: (pt: { x: number; y: number }) => { x: number; y: number };
  toWorld: (pt: { x: number; y: number }) => { x: number; y: number };

  /** Register a drawing layer. Returns cleanup */
  registerLayer: (opts: {
    draw: Drawer;
    z?: number;
    visible?: boolean;
    /** Whether the layer is drawn in world space (default) or screen space (ignores world transform). */
    space?: 'world' | 'screen';
  }) => () => void;

  /** Register a ticker (animation/update). Returns cleanup function. */
  registerTicker: (fn: Ticker) => () => void;

  /** Mark canvas as dirty and schedule redraw on next frame */
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
