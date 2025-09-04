/**
 * CanvasContext API
 * - инкапсулирует инициализацию <canvas> (HiDPI-скейлинг, opaque фон, RAF-цикл)
 * - даёт хук useCanvas() для регистрации рисовалок (draw) и апдейтеров (tick)
 * - порядок рендера соответствует порядку монтирования компонентов (Grid → Animation и т.д.)
 */

import { createContext, useContext } from 'react';

// Типы подписчиков
export type Drawer = (ctx: CanvasRenderingContext2D, now: number) => void;
export type Ticker = (dt: number, now: number) => void;

export type CanvasCtx = {
  ctx: CanvasRenderingContext2D | null;
  canvas: HTMLCanvasElement | null;
  size: { width: number; height: number; dpr: number };
  registerDraw: (fn: Drawer) => () => void;
  registerTick: (fn: Ticker) => () => void;
};

export const Ctx = createContext<CanvasCtx | null>(null);

export function useCanvas() {
  const value = useContext(Ctx);
  if (!value)
    throw new Error('useCanvas() must be used inside <CanvasProvider />');
  return value;
}
