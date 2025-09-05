'use client';

import { useEffect, useRef } from 'react';
import { useCanvas } from '@canvas-works/canvas-works';

interface MovingRectProps {
  rectWidth?: number;
  rectHeight?: number;
  /** пикселей в секунду */
  speed?: number;
  fillStyle?: string;
  startX?: number;
  startY?: number;
}

export function MovingRect({
  rectWidth = 100,
  rectHeight = 100,
  speed = 150, // px/sec
  fillStyle = '#111827',
  startX = 0,
  startY = 0,
}: MovingRectProps) {
  const { size, registerTicker, registerLayer } = useCanvas();

  const state = useRef({ x: startX, y: startY, vx: Math.abs(speed) });

  useEffect(() => {
    return registerTicker((dtMs) => {
      const dt = dtMs / 1000; // в секунды
      const s = state.current;

      s.x += s.vx * dt;

      // отражение от левой/правой стенки (в пределах CSS-пикселей)
      if (s.x < 0) {
        s.x = 0;
        s.vx = Math.abs(s.vx);
      } else if (s.x + rectWidth > size.w) {
        s.x = Math.max(0, size.w - rectWidth);
        s.vx = -Math.abs(s.vx);
      }

      // мы изменили состояние — просим перерисовку
      return true;
    });
  }, [size.w, rectWidth, registerTicker]);

  // отрисовка как слой (world-space по умолчанию)
  useEffect(() => {
    return registerLayer({
      z: 2,
      visible: true,
      draw: (ctx) => {
        const { x, y } = state.current;
        ctx.save();
        ctx.fillStyle = fillStyle;
        ctx.fillRect(x, y, rectWidth, rectHeight);
        ctx.restore();
      },
    });
  }, [fillStyle, rectWidth, rectHeight, registerLayer]);

  return null;
}
