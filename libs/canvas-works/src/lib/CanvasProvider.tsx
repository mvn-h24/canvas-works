'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type CanvasApi, Ctx, type Drawer, type Ticker } from './context';
import { apply, I, invert, type Matrix, mul, scaleAt, translate } from './matrix';
import { PanZoomControls } from './PanZoomControl';

interface CanvasProviderProps {
  width?: number;
  height?: number;
  background?: string;
  contextAttributes?: CanvasRenderingContext2DSettings;
  children?: React.ReactNode;
}

type Layer = {
  id: number;
  z: number;
  visible: boolean;
  space: 'world' | 'screen';
  draw: Drawer;
};

export function CanvasProvider({
                                 width,
                                 height,
                                 background = '#ffffff',
                                 contextAttributes,
                                 children,
                               }: CanvasProviderProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  const [dpr, setDpr] = useState<number>((globalThis as any)?.devicePixelRatio || 1);
  const [size, setSize] = useState<{ w: number; h: number }>(() => ({
    w: typeof width === 'number' ? width : 300,
    h: typeof height === 'number' ? height : 150,
  }));
  const [world, setWorldState] = useState<Matrix>(I);

  const layersRef = useRef<Map<number, Layer>>(new Map());
  const sortedLayersRef = useRef<Layer[]>([]);
  const layersDirtyRef = useRef<boolean>(true);
  const tickersRef = useRef<Map<number, Ticker>>(new Map());
  const idRef = useRef(1);

  // подписчики на изменения вида
  const viewListenersRef = useRef(new Set<(w: Matrix) => void>());
  const notifyView = (w: Matrix) => {
    viewListenersRef.current.forEach(cb => { try { cb(w); } catch (e) { console.error('[onViewChange]', e); } });
  };

  // rAF
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef<boolean>(false);
  const lastNowRef = useRef<number | null>(null);
  const dirtyRef = useRef<boolean>(true);

  // Матрицы:
  // cssFromWorld = world (world → CSS px)
  // deviceFromWorld = DPR * world (world → device px)
  // worldFromCss = inverse(world)
  // worldFromDevice = inverse(DPR*world)
  const cssFromWorldRef = useRef<Matrix>(I);
  const deviceFromWorldRef = useRef<Matrix>(I);
  const worldFromCssRef = useRef<Matrix>(I);
  const worldFromDeviceRef = useRef<Matrix>(I);

  const recomputeMatrices = useCallback((dprValue: number, worldValue: Matrix) => {
    cssFromWorldRef.current = worldValue;
    const dev = { a: dprValue, b: 0, c: 0, d: dprValue, e: 0, f: 0 };
    deviceFromWorldRef.current = mul(dev, worldValue);

    const invCss = invert(worldValue);
    if (invCss) worldFromCssRef.current = invCss;

    const invDev = invert(deviceFromWorldRef.current);
    if (invDev) worldFromDeviceRef.current = invDev;
  }, []);

  useEffect(() => { recomputeMatrices(dpr, world); dirtyRef.current = true; }, [dpr, world, recomputeMatrices]);

  const drawFrame = useCallback((now: number) => {
    const ctx = ctxRef.current;
    const canvas = canvasRef.current;
    if (!ctx || !canvas) { runningRef.current = false; rafRef.current = null; return; }

    const last = lastNowRef.current;
    const dt = last == null ? 0 : now - last;
    lastNowRef.current = now;

    let need = false;
    if (tickersRef.current.size) {
      for (const [, t] of tickersRef.current) { try { if (t(dt, now)) need = true; } catch (e) { console.error('[ticker]', e); } }
    }
    if (dirtyRef.current) { need = true; dirtyRef.current = false; }
    if (!need) { runningRef.current = false; rafRef.current = null; return; }

    // фон в screen-space
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = background ?? '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();

    // world-слои: deviceFromWorld (DPR * world)
    const m = deviceFromWorldRef.current;
    ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);

    if (layersDirtyRef.current) {
      const arr = Array.from(layersRef.current.values());
      arr.sort((a, b) => a.z - b.z);
      sortedLayersRef.current = arr;
      layersDirtyRef.current = false;
    }

    for (const L of sortedLayersRef.current) {
      if (!L.visible) continue;
      ctx.save();
      if (L.space === 'screen') {
        // screen-space: только DPR-скейл, координаты в CSS px
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      try { L.draw(ctx, now); } catch (e) { console.error('[layer]', e); }
      ctx.restore();
    }

    rafRef.current = requestAnimationFrame(drawFrame);
  }, [background, dpr]);

  const ensureLoop = useCallback(() => {
    if (!runningRef.current) { runningRef.current = true; rafRef.current = requestAnimationFrame(drawFrame); }
  }, [drawFrame]);

  const scheduleRedraw = useCallback(() => { dirtyRef.current = true; ensureLoop(); }, [ensureLoop]);

  // Пан — dx,dy в CSS px
  const panByScreen = useCallback((dx: number, dy: number) => {
    setWorldState(prev => {
      const next = mul(translate(dx, dy), prev);
      recomputeMatrices(dpr, next);
      notifyView(next);
      return next;
    });
    scheduleRedraw();
  }, [dpr, recomputeMatrices, scheduleRedraw]);

  // Зум вокруг точки экрана (CSS px)
  const zoomAtScreen = useCallback((cx: number, cy: number, k: number) => {
    setWorldState(prev => {
      const next = mul(scaleAt(k, k, cx, cy), prev);
      recomputeMatrices(dpr, next);
      notifyView(next);
      return next;
    });
    scheduleRedraw();
  }, [dpr, recomputeMatrices, scheduleRedraw]);

  // Сброс: (0,0) по центру в CSS px
  const resetView = useCallback(() => {
    setWorldState(() => {
      const centered = translate(size.w / 2, size.h / 2);
      recomputeMatrices(dpr, centered);
      notifyView(centered);
      return centered;
    });
    scheduleRedraw();
  }, [dpr, size.w, size.h, recomputeMatrices, scheduleRedraw]);

  // Инициализация, ResizeObserver, DPR watcher
  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d', contextAttributes ?? { alpha: false });
    if (!ctx) throw new Error('2d context is not available');
    ctxRef.current = ctx;

    const measure = () => {
      const wCss = width ?? Math.max(1, Math.round(canvas.clientWidth || 500));
      const hCss = height ?? Math.max(1, Math.round(canvas.clientHeight || 500));
      setSize(prev => (prev.w !== wCss || prev.h !== hCss ? { w: wCss, h: hCss } : prev));
    };
    measure();

    const ro = new ResizeObserver(() => { measure(); scheduleRedraw(); });
    ro.observe(canvas);

    const updateDpr = () => {
      const next = (globalThis as any)?.devicePixelRatio || 1;
      if (next !== dpr) { setDpr(next); scheduleRedraw(); }
    };
    updateDpr();
    let mq: MediaQueryList | null = null;
    try {
      mq = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      mq.addEventListener?.('change', updateDpr as any);
    } catch {}

    window.addEventListener('resize', updateDpr, { passive: true });

    (canvas.style as any).touchAction = 'none';
    (canvas.style as any).cursor = 'grab';

    return () => {
      if (mq && (mq as any).removeEventListener) (mq as any).removeEventListener('change', updateDpr as any);
      ro.disconnect();
      window.removeEventListener('resize', updateDpr);
      (canvas.style as any).touchAction = '';
      (canvas.style as any).cursor = '';
      ctxRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextAttributes, height, width, scheduleRedraw, dpr]);

  // Бэкинг-стор под DPR
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    const desiredW = Math.max(1, Math.round(size.w * dpr));
    const desiredH = Math.max(1, Math.round(size.h * dpr));
    if (canvas.width !== desiredW || canvas.height !== desiredH) {
      canvas.width = desiredW;
      canvas.height = desiredH;
      dirtyRef.current = true;
      ensureLoop();
    }
  }, [dpr, size.w, size.h, ensureLoop]);

  // Публичный API
  const api = useMemo<CanvasApi>(() => ({
    canvas: canvasRef.current,
    ctx: ctxRef.current,
    dpr,
    size,
    world,
    setWorld: (next) => {
      setWorldState(prev => {
        const v = typeof next === 'function' ? (next as any)(prev) : next;
        recomputeMatrices(dpr, v);
        notifyView(v);
        return v;
      });
      scheduleRedraw();
    },
    // ВНИМАНИЕ: toScreen/toWorld теперь в CSS px
    toScreen: (pt) => apply(cssFromWorldRef.current, pt.x, pt.y),
    toWorld:  (pt) => apply(worldFromCssRef.current, pt.x, pt.y),

    getWorldRect: () => {
      const tl = apply(worldFromCssRef.current, 0, 0);
      const br = apply(worldFromCssRef.current, size.w, size.h);
      return { x0: Math.min(tl.x, br.x), y0: Math.min(tl.y, br.y), x1: Math.max(tl.x, br.x), y1: Math.max(tl.y, br.y) };
    },

    fitToRect: (r, margin = 24) => {
      const wWorld = Math.max(1e-9, r.x1 - r.x0);
      const hWorld = Math.max(1e-9, r.y1 - r.y0);
      const availW = Math.max(1, size.w - 2 * margin);
      const availH = Math.max(1, size.h - 2 * margin);
      const s = Math.max(1e-9, Math.min(availW / wWorld, availH / hWorld));
      const cx = size.w / 2, cy = size.h / 2;
      const wx = (r.x0 + r.x1) / 2, wy = (r.y0 + r.y1) / 2;
      const next = mul(translate(cx, cy), mul(scaleAt(s, s, 0, 0), translate(-wx, -wy)));
      setWorldState(() => { recomputeMatrices(dpr, next); notifyView(next); return next; });
      scheduleRedraw();
    },

    onViewChange: (cb) => { viewListenersRef.current.add(cb); return () => viewListenersRef.current.delete(cb); },

    registerLayer: ({ draw, z = 0, visible = true, space = 'world' }) => {
      const id = idRef.current++;
      layersRef.current.set(id, { id, z, visible, draw, space });
      layersDirtyRef.current = true;
      scheduleRedraw();
      return () => { layersRef.current.delete(id); layersDirtyRef.current = true; scheduleRedraw(); };
    },

    registerTicker: (fn: Ticker) => {
      const id = idRef.current++;
      tickersRef.current.set(id, fn);
      ensureLoop();
      return () => { tickersRef.current.delete(id); scheduleRedraw(); };
    },

    panByScreen,
    zoomAtScreen,
    resetView,
    scheduleRedraw,
  }), [dpr, size, world, recomputeMatrices, scheduleRedraw, panByScreen, zoomAtScreen, resetView]);

  return (
    <div style={{ position: 'relative', width: width ?? '100%', height: height ?? '100%' }}>
      <canvas
        ref={canvasRef}
        style={{ width: width ?? '100%', height: height ?? '100%', display: 'block' }}
      />
      <Ctx.Provider value={api}>
        <PanZoomControls />
        {children}
      </Ctx.Provider>
    </div>
  );
}
