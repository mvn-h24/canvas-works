'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Ctx, type CanvasApi, type Drawer, type Ticker } from './context';

/** Lightweight 2D matrix (DOMMatrix-free for SSR safety) */
type Matrix = { a: number; b: number; c: number; d: number; e: number; f: number };
const I: Matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

function mul(m1: Matrix, m2: Matrix): Matrix {
  // m = m1 * m2
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

function invert(m: Matrix): Matrix {
  const det = m.a * m.d - m.b * m.c;
  if (!det) return I;
  const inv = 1 / det;
  return {
    a:  m.d * inv,
    b: -m.b * inv,
    c: -m.c * inv,
    d:  m.a * inv,
    e: (m.c * m.f - m.d * m.e) * inv,
    f: (m.b * m.e - m.a * m.f) * inv,
  };
}

function apply(m: Matrix, x: number, y: number) {
  return { x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f };
}

export interface CanvasProviderProps {
  /** CSS width and height of the canvas. If omitted, use style or container flow. */
  width?: number;
  height?: number;
  /** Opaque background color filled every frame before compositing layers. */
  background?: string;
  className?: string;
  style?: React.CSSProperties;
  /** Context attributes forwarded to getContext('2d') */
  contextAttributes?: CanvasRenderingContext2DSettings;
  children?: React.ReactNode;
}

/** Internal layer representation */
type Layer = { id: number; z: number; visible: boolean; draw: Drawer; space: 'world' | 'screen' };

export function CanvasProvider({
  width,
  height,
  background = '#fff',
  className,
  style,
  contextAttributes,
  children,
}: CanvasProviderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  // --- reactive, SSR-safe state ---
  const [dpr, setDpr] = useState<number>(1); // never read window at render-time
  const [size, setSize] = useState<{ w: number; h: number }>(() => ({
    w: Number.isFinite(width) ? (width as number) : 800,
    h: Number.isFinite(height) ? (height as number) : 500,
  }));
  const [world, setWorld] = useState<Matrix>(I);

  const layersRef = useRef<Map<number, Layer>>(new Map());
  const tickersRef = useRef<Map<number, Ticker>>(new Map());
  const idRef = useRef(1);
  const rafRef = useRef<number | null>(null);
  const lastNowRef = useRef<number | null>(null);
  const dirtyRef = useRef<boolean>(true);

  const scheduleRedraw = useCallback(() => {
    dirtyRef.current = true;
  }, []);

  // Initialize context and observe size only on the client
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 2d context (alpha=false => opaque, cheaper composite)
    const ctx = canvas.getContext('2d', {
      alpha: false,
      desynchronized: true,
      ...contextAttributes,
    });
    if (!ctx) return;
    ctxRef.current = ctx;

    // initial CSS size measurement (if width/height props not provided)
    const measure = () => {
      const wCss = Number.isFinite(width) ? (width as number) : Math.max(1, Math.round(canvas.clientWidth || 800));
      const hCss = Number.isFinite(height) ? (height as number) : Math.max(1, Math.round(canvas.clientHeight || 500));
      setSize((prev) => (prev.w !== wCss || prev.h !== hCss ? { w: wCss, h: hCss } : prev));
    };
    measure();

    // ResizeObserver to follow container/CSS size
    const ro = new ResizeObserver(() => measure());
    ro.observe(canvas);

    // DPR watcher (keep it simple: on resize recalc DPR)
    const updateDpr = () => {
      const next = (globalThis as any)?.devicePixelRatio || 1;
      if (next !== dpr) setDpr(next);
    };
    updateDpr();
    window.addEventListener('resize', updateDpr);

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateDpr);
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height, contextAttributes]);

  // Sync backing store to CSS size & DPR
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const bw = Math.max(1, Math.floor(size.w * dpr));
    const bh = Math.max(1, Math.floor(size.h * dpr));
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    // default transform: device pixels scale first, world next
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // world is applied in the draw() before layers; keep schedule redraw
    scheduleRedraw();
  }, [size.w, size.h, dpr, world, scheduleRedraw]);

  // ---- Public API passed via context ----
  const api: CanvasApi = useMemo(
    () => ({
      canvas: canvasRef.current,
      ctx: ctxRef.current,
      dpr,
      size,
      world,
      setWorld: (newWorld) => {
        setWorld(typeof newWorld === 'function' ? (newWorld as (w: Matrix) => Matrix)(world) : (newWorld as Matrix));
        scheduleRedraw();
      },
      toScreen: (pt) => apply(mul({ a: dpr, b: 0, c: 0, d: dpr, e: 0, f: 0 }, world), pt.x, pt.y),
      toWorld: (pt) => {
        const inv = invert(mul({ a: dpr, b: 0, c: 0, d: dpr, e: 0, f: 0 }, world));
        return apply(inv, pt.x, pt.y);
      },
      registerLayer: ({ draw, z = 0, visible = true, space = 'world' }) => {
        const id = idRef.current++;
        layersRef.current.set(id, { id, z, visible, draw, space });
        scheduleRedraw();
        return () => {
          layersRef.current.delete(id);
          scheduleRedraw();
        };
      },
      registerTicker: (fn: Ticker) => {
        const id = idRef.current++;
        tickersRef.current.set(id, fn);
        return () => {
          tickersRef.current.delete(id);
        };
      },
      scheduleRedraw,
    }),
    [dpr, size, world, scheduleRedraw]
  );

  // ---- main animation loop ----
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const drawFrame = (now: number) => {
      const last = lastNowRef.current ?? now;
      const dt = Math.max(0, now - last);
      lastNowRef.current = now;

      // tickers first
      let need = dirtyRef.current;
      if (tickersRef.current.size) {
        for (const [, t] of tickersRef.current) {
          try {
            if (t(dt, now)) {
              need = true;
              break;
            }
          } catch {
            // ignore ticker errors to keep loop alive
          }
        }
      }

      if (need) {
        // reset 'dirty' early to coalesce bursts
        dirtyRef.current = false;

        // clear to background (device pixel space)
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = background ?? '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // set transform = DPR * world once for "world" layers
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (world !== I) {
          ctx.transform(world.a, world.b, world.c, world.d, world.e, world.f);
        }

        // draw layers sorted by z; screen/world space respected
        const layers = Array.from(layersRef.current.values()).sort((a, b) => a.z - b.z);
        for (const L of layers) {
          if (!L.visible) continue;
          ctx.save();
          if (L.space === 'screen') {
            // screen-space = ignore world; just DPR scale
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          try {
            L.draw(ctx, now);
          } catch {
            // keep drawing others
          } finally {
            ctx.restore();
          }
        }
      }

      rafRef.current = requestAnimationFrame(drawFrame);
    };

    rafRef.current = requestAnimationFrame(drawFrame);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [background, dpr, world]);

  return (
    <Ctx.Provider value={api}>
        <canvas
          ref={canvasRef}
          className={className}
          // CSS size comes from props or style; if neither provided, we fall back to 800x500
          style={{
            width: Number.isFinite(width) ? width : (style?.width as any) ?? 800,
            height: Number.isFinite(height) ? height : (style?.height as any) ?? 500,
            ...style,
          }}
        />
      {children}
    </Ctx.Provider>
  );
}
