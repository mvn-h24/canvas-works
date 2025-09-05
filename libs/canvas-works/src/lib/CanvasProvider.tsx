'use client';
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { type CanvasApi, Ctx, type Drawer, type Ticker } from './context';
import {
  apply,
  I,
  invert,
  type Matrix,
  mul,
  scaleAt,
  translate,
} from './matrix';
import { PanZoomControls } from './PanZoomControl';

interface CanvasProviderProps {
  /** CSS width and height of the canvas. If omitted, use style or container flow. */
  width?: number;
  height?: number;
  /** Opaque background color filled every frame before compositing layers. */
  background?: string;
  className?: string;
  style?: React.CSSProperties;
  /** getContext options */
  contextAttributes?: CanvasRenderingContext2DSettings;
  children?: React.ReactNode;
}

type Layer = {
  id: number;
  z: number;
  visible: boolean;
  draw: Drawer;
  space: 'world' | 'screen';
};

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

  // reactive state
  const [dpr, setDpr] = useState<number>(
    () => (globalThis as any)?.devicePixelRatio || 1
  );
  const [size, setSize] = useState<{ w: number; h: number }>(() => ({
    w: width ?? 300,
    h: height ?? 150,
  }));
  const [world, setWorldState] = useState<Matrix>(I);

  const layersRef = useRef<Map<number, Layer>>(new Map());
  const sortedLayersRef = useRef<Layer[]>([]);
  const layersDirtyRef = useRef<boolean>(true);
  const tickersRef = useRef<Map<number, Ticker>>(new Map());
  const idRef = useRef(1);

  // rAF machinery
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef<boolean>(false);
  const lastNowRef = useRef<number | null>(null);
  const dirtyRef = useRef<boolean>(true); // первый кадр — рисуем

  // cached matrices
  const screenFromWorldRef = useRef<Matrix>(I); // DPR * world
  const worldFromScreenRef = useRef<Matrix>(I); // (DPR * world)^(-1)

  const recomputeMatrices = useCallback(
    (dprValue: number, worldValue: Matrix) => {
      const d = { a: dprValue, b: 0, c: 0, d: dprValue, e: 0, f: 0 };
      const m = mul(d, worldValue);
      screenFromWorldRef.current = m;
      worldFromScreenRef.current = invert(m); // has guard inside
    },
    []
  );

  useEffect(() => {
    recomputeMatrices(dpr, world);
    dirtyRef.current = true;
  }, [dpr, world, recomputeMatrices]);

  const drawFrame = useCallback(
    (now: number) => {
      const ctx = ctxRef.current;
      const canvas = canvasRef.current;
      if (!ctx || !canvas) {
        runningRef.current = false;
        rafRef.current = null;
        return;
      }

      const last = lastNowRef.current;
      const dt = last == null ? 0 : now - last;
      lastNowRef.current = now;

      let need = false;

      // 1) tickers
      if (tickersRef.current.size) {
        for (const [, t] of tickersRef.current) {
          try {
            if (t(dt, now)) need = true;
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[ticker] error', e);
          }
        }
      }

      // 2) dirty flag
      if (dirtyRef.current) {
        need = true;
        dirtyRef.current = false;
      }

      if (need) {
        // clear
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = background ?? '#fff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.restore();

        // world transform (DPR * world)
        const m = screenFromWorldRef.current;
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);

        // stable-sorted layers by z (cache)
        if (layersDirtyRef.current) {
          sortedLayersRef.current = Array.from(layersRef.current.values()).sort(
            (a, b) => a.z - b.z
          );
          layersDirtyRef.current = false;
        }
        const layers = sortedLayersRef.current;

        for (const L of layers) {
          if (!L.visible) continue;
          ctx.save();
          if (L.space === 'screen') {
            // screen-space ignores world, applies DPR only
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          }
          try {
            L.draw(ctx, now);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[layer.draw] error', e);
          } finally {
            ctx.restore();
          }
        }

        rafRef.current = requestAnimationFrame(drawFrame);
      } else {
        runningRef.current = false;
        rafRef.current = null;
      }
    },
    [background, dpr]
  );

  const ensureLoop = useCallback(() => {
    if (!runningRef.current) {
      runningRef.current = true;
      rafRef.current = requestAnimationFrame(drawFrame);
    }
  }, [drawFrame]);

  const scheduleRedraw = useCallback(() => {
    dirtyRef.current = true;
    ensureLoop();
  }, [ensureLoop]);

  // pan by screen (CSS px)
  const panByScreen = useCallback(
    (dx: number, dy: number) => {
      setWorldState((prev) => {
        const next = mul(translate(dx, dy), prev);
        recomputeMatrices(dpr, next);
        return next;
      });
      scheduleRedraw();
    },
    [dpr, recomputeMatrices, scheduleRedraw]
  );

  // zoom at screen point (CSS px), isotropic
  const zoomAtScreen = useCallback(
    (cx: number, cy: number, k: number) => {
      setWorldState((prev) => {
        const next = mul(scaleAt(k, k, cx, cy), prev);
        recomputeMatrices(dpr, next);
        return next;
      });
      scheduleRedraw();
    },
    [dpr, recomputeMatrices, scheduleRedraw]
  );

  const resetView = useCallback(() => {
    setWorldState(() => {
      recomputeMatrices(dpr, I);
      return I;
    });
    scheduleRedraw();
  }, [dpr, recomputeMatrices, scheduleRedraw]);

  // init & observers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', contextAttributes ?? { alpha: false });
    if (!ctx) throw new Error('2d context is not available');
    ctxRef.current = ctx;

    const measure = () => {
      const wCss = width ?? Math.max(1, Math.round(canvas.clientWidth || 500));
      const hCss =
        height ?? Math.max(1, Math.round(canvas.clientHeight || 500));
      setSize((prev) =>
        prev.w !== wCss || prev.h !== hCss ? { w: wCss, h: hCss } : prev
      );
    };
    measure();

    // ResizeObserver for CSS size
    const ro = new ResizeObserver(() => {
      measure();
      scheduleRedraw();
    });
    ro.observe(canvas);

    // DPR watcher (simple: recalc on window resize)
    const updateDpr = () => {
      const next = (globalThis as any)?.devicePixelRatio || 1;
      if (next !== dpr) {
        setDpr(next);
        scheduleRedraw();
      }
    };
    updateDpr();
    window.addEventListener('resize', updateDpr, { passive: true });

    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateDpr);
      ctxRef.current = null;
    };
  }, [contextAttributes, dpr, height, scheduleRedraw, width]);

  // keep backing store sized to CSS * DPR
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const desiredW = Math.max(1, Math.round(size.w * dpr));
    const desiredH = Math.max(1, Math.round(size.h * dpr));

    if (canvas.width !== desiredW || canvas.height !== desiredH) {
      canvas.width = desiredW;
      canvas.height = desiredH;
      // important: do NOT set CSS size here; use props/style instead
      dirtyRef.current = true;
      ensureLoop();
    }
  }, [dpr, size.w, size.h, ensureLoop]);

  // public API memo
  const api = useMemo<CanvasApi>(
    () => ({
      get canvas() {
        return canvasRef.current;
      },
      get ctx() {
        return ctxRef.current;
      },
      dpr,
      size,
      world,
      setWorld: (next) => {
        setWorldState((prev) => {
          const v = typeof next === 'function' ? (next as any)(prev) : next;
          recomputeMatrices(dpr, v);
          return v;
        });
        scheduleRedraw();
      },
      toScreen: (pt) => apply(screenFromWorldRef.current, pt.x, pt.y),
      toWorld: (pt) => apply(worldFromScreenRef.current, pt.x, pt.y),
      registerLayer: ({ draw, z = 0, visible = true, space = 'world' }) => {
        const id = idRef.current++;
        layersRef.current.set(id, { id, z, visible, draw, space });
        layersDirtyRef.current = true;
        scheduleRedraw();
        return () => {
          layersRef.current.delete(id);
          layersDirtyRef.current = true;
          scheduleRedraw();
        };
      },
      registerTicker: (fn: Ticker) => {
        const id = idRef.current++;
        tickersRef.current.set(id, fn);
        ensureLoop();
        return () => {
          tickersRef.current.delete(id);
          scheduleRedraw();
        };
      },
      panByScreen,
      zoomAtScreen,
      resetView,
      scheduleRedraw,
    }),
    [
      dpr,
      size,
      world,
      recomputeMatrices,
      scheduleRedraw,
      panByScreen,
      zoomAtScreen,
      resetView,
    ]
  );

  return (
    <div className={className} style={style}>
      <canvas
        ref={canvasRef}
        style={{
          width: width ?? '100%',
          height: height ?? '100%',
          display: 'block',
        }}
      />
      <Ctx.Provider value={api}>
        <PanZoomControls />
        {children}
      </Ctx.Provider>
    </div>
  );
}
