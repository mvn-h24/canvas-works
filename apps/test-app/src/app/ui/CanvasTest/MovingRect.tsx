import { useEffect, useRef } from 'react';
import { useCanvas } from '@canvas-works/canvas-works';

interface MovingRectProps {
  rectWidth?: number;
  rectHeight?: number;
  speed?: number; // px/sec
  fillStyle?: string;
  startX?: number;
  startY?: number;
}

export function MovingRect({
  rectWidth = 100,
  rectHeight = 100,
  speed = 150,
  fillStyle = '#111827',
  startX = 0,
  startY = 0,
}: MovingRectProps) {
  const { size, registerTick, registerDraw } = useCanvas();
  const state = useRef({ x: startX, y: startY, vx: Math.abs(speed) });

  // Логика движения (tick)
  useEffect(() => {
    return registerTick((dt) => {
      const s = state.current;
      s.x += s.vx * dt;
      // Столкновения со стенами (по X)
      if (s.x < 0) {
        s.x = 0;
        s.vx = Math.abs(s.vx);
      } else if (s.x + rectWidth > size.width) {
        s.x = Math.max(0, size.width - rectWidth);
        s.vx = -Math.abs(s.vx);
      }
    });
  }, [size.width, rectWidth, registerTick]);

  // Отрисовка прямоугольника (draw)
  useEffect(() => {
    return registerDraw((ctx) => {
      ctx.save();
      ctx.fillStyle = fillStyle;
      ctx.fillRect(state.current.x, state.current.y, rectWidth, rectHeight);
      ctx.restore();
    });
  }, [fillStyle, rectWidth, rectHeight, registerDraw]);

  return <></>;
}
