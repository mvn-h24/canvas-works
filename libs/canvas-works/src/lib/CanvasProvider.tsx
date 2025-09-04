import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type CanvasCtx, Ctx, type Drawer, type Ticker } from './context';

export interface CanvasProviderProps {
  width: number;
  height: number;
  background?: string; // цвет фона, заполняется КАЖДЫЙ кадр (opaque)
  className?: string;
  style?: React.CSSProperties;
  contextAttributes?: CanvasRenderingContext2DSettings;
  children?: React.ReactNode;
}

export function CanvasProvider({
  width,
  height,
  background = '#fff',
  className,
  style,
  contextAttributes = { alpha: false, desynchronized: true },
  children,
}: CanvasProviderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const dprRef = useRef<number>(1);

  const drawersRef = useRef<Drawer[]>([]); // порядок = порядок монтирования
  const tickersRef = useRef<Ticker[]>([]);

  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);

  // Локальное состояние только для триггера рендера детей после инициализации
  const [ready, setReady] = useState(false);

  // Регистрация/снятие подписчиков
  const registerDraw = useCallback((fn: Drawer) => {
    drawersRef.current.push(fn);
    return () => {
      const i = drawersRef.current.indexOf(fn);
      if (i >= 0) drawersRef.current.splice(i, 1);
    };
  }, []);

  const registerTick = useCallback((fn: Ticker) => {
    tickersRef.current.push(fn);
    return () => {
      const i = tickersRef.current.indexOf(fn);
      if (i >= 0) tickersRef.current.splice(i, 1);
    };
  }, []);

  // Инициализация контекста 2D + HiDPI-скейлинг
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      dprRef.current = dpr;

      // Физический буфер в device-пикселях
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);

      // CSS размер (логические пиксели)
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      const ctx = canvas.getContext(
        '2d',
        contextAttributes
      ) as CanvasRenderingContext2D | null;
      if (!ctx) return;

      // Сброс и установка трансформа под DPR (один раз)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      ctxRef.current = ctx;
      setReady(true);

      // RAF-цикл
      const frame = (ts: number) => {
        const ctx2d = ctxRef.current;
        if (!ctx2d) {
          rafRef.current = requestAnimationFrame(frame);
          return;
        }
        const last = lastTsRef.current ?? ts;
        const dt = (ts - last) / 1000; // в секундах
        lastTsRef.current = ts;

        // CLEAR + BACKGROUND (в логических пикселях, т.к. трансформ уже масштабирует)
        ctx2d.fillStyle = background;
        ctx2d.fillRect(0, 0, width, height);

        // UPDATE → DRAW
        for (const t of tickersRef.current) t(dt, ts);
        for (const d of drawersRef.current) d(ctx2d, ts);

        rafRef.current = requestAnimationFrame(frame);
      };

      rafRef.current = requestAnimationFrame(frame);
    }

    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      lastTsRef.current = null;
      ctxRef.current = null;
      setReady(false);
    };
  }, [width, height, background, contextAttributes]);

  const value = useMemo<CanvasCtx>(
    () => ({
      ctx: ctxRef.current,
      canvas: canvasRef.current,
      size: { width, height, dpr: dprRef.current },
      registerDraw,
      registerTick,
    }),
    [width, height, registerDraw, registerTick]
  );

  return (
    <Ctx.Provider value={value}>
      <div style={{ display: 'inline-block', lineHeight: 0 }}>
        <canvas
          ref={canvasRef}
          className={className}
          style={{ border: '1px solid #ccc', ...style }}
        />
      </div>
      {/* Детей можно рендерить сразу; подписки сработают как только ctx готов */}
      {ready && children}
    </Ctx.Provider>
  );
}
