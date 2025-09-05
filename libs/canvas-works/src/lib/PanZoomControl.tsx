'use client';
import { useEffect, useRef } from 'react';
import { useCanvas } from './context';
import { getScale } from './matrix';

type Pointer = { id: number; x: number; y: number };

export function PanZoomControls({
  minScale = 0.02, // можно еще меньше, если надо видеть тысячные
  maxScale = 4096,
}: {
  minScale?: number;
  maxScale?: number;
}) {
  const { canvas, world, panByScreen, zoomAtScreen, resetView } = useCanvas();

  const drag = useRef<{ active: boolean; x: number; y: number } | null>(null);
  const pointersRef = useRef<Map<number, Pointer>>(new Map());
  const pinchRef = useRef<{
    prevDist: number;
    prevCx: number;
    prevCy: number;
  } | null>(null);

  const curScale = () => getScale(world); // scale в world→CSS

  useEffect(() => {
    const el = canvas;
    if (!el) return;

    const getPt = (e: PointerEvent): Pointer => ({
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    });

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0 && e.pointerType === 'mouse') return;
      e.preventDefault();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      pointersRef.current.set(e.pointerId, getPt(e));
      drag.current = { active: true, x: e.clientX, y: e.clientY };

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
      el.style.cursor = 'grabbing';
    };

    const onPointerMove = (e: PointerEvent) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, getPt(e));
      }
      if (pointersRef.current.size === 2 && pinchRef.current) {
        const pts = Array.from(pointersRef.current.values());
        const rect = el.getBoundingClientRect();
        const dx = pts[1].x - pts[0].x;
        const dy = pts[1].y - pts[0].y;
        const dist = Math.hypot(dx, dy);
        const cx = (pts[0].x + pts[1].x) / 2 - rect.left;
        const cy = (pts[0].y + pts[1].y) / 2 - rect.top;

        const factor =
          dist > 0 && pinchRef.current.prevDist > 0
            ? dist / pinchRef.current.prevDist
            : 1;
        const cur = curScale();
        const next = Math.min(maxScale, Math.max(minScale, cur * factor));
        const apply = next / cur;
        if (apply !== 1) zoomAtScreen(cx, cy, apply);
        panByScreen(cx - pinchRef.current.prevCx, cy - pinchRef.current.prevCy);

        pinchRef.current = { prevDist: dist, prevCx: cx, prevCy: cy };
        return;
      }

      if (
        drag.current?.active &&
        (e.buttons & 1 || e.pointerType !== 'mouse')
      ) {
        e.preventDefault();
        const dx = e.clientX - drag.current.x;
        const dy = e.clientY - drag.current.y;
        if (dx || dy) panByScreen(dx, dy);
        drag.current = { active: true, x: e.clientX, y: e.clientY };
      }
    };

    const cleanupPointer = (e: PointerEvent) => {
      if (drag.current?.active && e.button === 0) drag.current = null;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size < 2) pinchRef.current = null;
      el.style.cursor = 'grab';
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit =
        e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dx = e.deltaX * unit || 0;
      const dy = e.deltaY * unit;

      if (e.ctrlKey) {
        const speed = 0.0012;
        const raw = Math.exp(-dy * speed);
        const cur = curScale();
        const next = Math.min(maxScale, Math.max(minScale, cur * raw));
        const apply = next / cur;
        if (apply === 1) return;
        const rect = el.getBoundingClientRect();
        zoomAtScreen(e.clientX - rect.left, e.clientY - rect.top, apply);
        return;
      }

      if (e.shiftKey || Math.abs(dx) > 0) {
        panByScreen(-(dx || dy) * 0.5, 0);
      } else {
        panByScreen(0, -dy * 0.5);
      }
    };

    const onDbl = () => {
      resetView();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === '0') resetView();
      else if (e.key === '+' || e.key === '=') {
        const rect = el.getBoundingClientRect();
        const cur = curScale();
        const next = Math.min(maxScale, cur * 1.1);
        zoomAtScreen(rect.width / 2, rect.height / 2, next / cur);
      } else if (e.key === '-') {
        const rect = el.getBoundingClientRect();
        const cur = curScale();
        const next = Math.max(minScale, cur / 1.1);
        zoomAtScreen(rect.width / 2, rect.height / 2, next / cur);
      }
    };

    el.addEventListener('pointerdown', onPointerDown, { passive: false });
    el.addEventListener('pointermove', onPointerMove, { passive: false });
    el.addEventListener('pointerup', cleanupPointer, { passive: true });
    el.addEventListener('pointercancel', cleanupPointer, { passive: true });
    el.addEventListener('pointerleave', cleanupPointer, { passive: true });
    el.addEventListener('pointerout', cleanupPointer, { passive: true });
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('dblclick', onDbl, { passive: true });
    window.addEventListener('keydown', onKey);

    return () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', cleanupPointer);
      el.removeEventListener('pointercancel', cleanupPointer);
      el.removeEventListener('pointerleave', cleanupPointer);
      el.removeEventListener('pointerout', cleanupPointer);
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('dblclick', onDbl);
      window.removeEventListener('keydown', onKey);
      el.style.cursor = '';
      el.style.touchAction = '';
    };
  }, [
    canvas,
    world.a,
    world.b,
    world.c,
    world.d,
    panByScreen,
    zoomAtScreen,
    resetView,
    minScale,
    maxScale,
  ]);

  return null;
}
