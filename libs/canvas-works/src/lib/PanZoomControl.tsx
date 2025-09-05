'use client';
import { useEffect, useRef } from 'react';
import { useCanvas } from './context';
import { getScale } from './matrix';

type Pointer = { id: number; x: number; y: number };

export function PanZoomControls({ minScale = 0.25, maxScale = 20 }: { minScale?: number; maxScale?: number }) {
  const { canvas, world, panByScreen, zoomAtScreen, resetView } = useCanvas();

  const drag = useRef<{ active: boolean; x: number; y: number } | null>(null);
  const pointersRef = useRef<Map<number, Pointer>>(new Map());
  const pinchRef = useRef<{ prevDist: number; prevCx: number; prevCy: number } | null>(null);

  // текущие скейлы (по world-матрице)
  const getCurScale = () => {
    const sx = Math.hypot(world.a, world.b) || 1;
    const sy = Math.hypot(world.c, world.d) || 1;
    return { sx, sy };
  };

  useEffect(() => {
    const el = canvas;
    if (!el) return;

    // важное для pointer/pinch
    (el.style as any).touchAction = 'none';
    (el.style as any).cursor = 'grab';

    // === Drag (ЛКМ) ===
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return; // только ЛКМ
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      drag.current = { active: true, x: e.clientX, y: e.clientY };

      // регистрируем палец для pinch
      pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
      if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const dist = Math.hypot(dx, dy);
        const rect = el.getBoundingClientRect();
        const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
        const cy = (pts[0].y + pts[1].y) / 2 - rect.top;
        pinchRef.current = { prevDist: dist, prevCx: cx, prevCy: cy };
      }
      (el.style as any).cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      // обновляем палец
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });
      }

      // pinch (2 пальца): пан + зум одновременно
      if (pointersRef.current.size === 2 && pinchRef.current) {
        e.preventDefault();
        const rect = el.getBoundingClientRect();
        const pts = Array.from(pointersRef.current.values());
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const dist = Math.hypot(dx, dy);
        const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
        const cy = (pts[0].y + pts[1].y) / 2 - rect.top;

        const factor = dist > 0 && pinchRef.current.prevDist > 0 ? dist / pinchRef.current.prevDist : 1;
        const { sx } = getCurScale();
        const nextSx = Math.min(maxScale, Math.max(minScale, sx * factor));
        const apply = nextSx / sx;

        if (apply !== 1) {
          zoomAtScreen(cx, cy, apply);
        }
        // параллельное смещение для стабилизации центра
        panByScreen(cx - pinchRef.current.prevCx, cy - pinchRef.current.prevCy);

        pinchRef.current = { prevDist: dist, prevCx: cx, prevCy: cy };
        return;
      }

      // обычный drag
      if (drag.current?.active) {
        e.preventDefault();
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        if (dx || dy) panByScreen(dx, dy);
        drag.current = { active: true, x: e.clientX, y: e.clientY };
      }
    };

    const onPointerUpOrCancel = (e: PointerEvent) => {
      if (drag.current?.active && e.button === 0) {
        drag.current = null;
      }
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      (el.style as any).cursor = 'grab';
    };

    // === Колесо / трекпад ===
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // нормализуем deltaMode и различаем pinch‑zoom на трекпаде (ctrlKey)
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dy = e.deltaY * unit;
      const speed = e.ctrlKey ? 0.01 : 0.001;
      const raw = Math.exp(-dy * speed);

      const sx = getScale(world);
      const next = Math.min(maxScale, Math.max(minScale, sx * raw));
      const apply = next / sx;
      if (apply === 1) return;

      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      zoomAtScreen(px, py, apply);
    };

    // === Двойной клик: сброс ===
    const onDbl = () => {
      resetView();
    };

    // хоткеи: 0 и +/-
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '0') {
        resetView();
      } else if (e.key === '+' || e.key === '=') {
        const rect = el.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const sx = getScale(world);
        const next = Math.min(maxScale, Math.max(minScale, sx * 1.1));
        const apply = next / sx;
        zoomAtScreen(cx, cy, apply);
      } else if (e.key === '-') {
        const rect = el.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const sx = getScale(world);
        const next = Math.min(maxScale, Math.max(minScale, sx / 1.1));
        const apply = next / sx;
        zoomAtScreen(cx, cy, apply);
      }
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: false });
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', onPointerUpOrCancel, { passive: true });
    el.addEventListener('pointercancel', onPointerUpOrCancel, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDbl, { passive: true });
    window.addEventListener('keydown', onKey);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', onPointerUpOrCancel);
      el.removeEventListener('pointercancel', onPointerUpOrCancel);
      el.removeEventListener('wheel', onWheel as any);
      el.removeEventListener('dblclick', onDbl as any);
      window.removeEventListener('keydown', onKey);
      (el.style as any).cursor = '';
      (el.style as any).touchAction = '';
    };
  }, [canvas, minScale, maxScale, world.a, world.b, world.c, world.d, panByScreen, zoomAtScreen, resetView]);

  return null;
}
