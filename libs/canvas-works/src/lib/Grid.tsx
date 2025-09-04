import { useEffect } from 'react';
import { useCanvas } from './context';

/** Grid — компонент-сетка, использует контекст и рисуется КАЖДЫЙ кадр поверх фона */
export type GridProps = {
  step?: number;
  strokeStyle?: string;
  lineWidth?: number;
};

export function Grid({
  step = 25,
  strokeStyle = '#e5e7eb',
  lineWidth = 1,
}: GridProps) {
  const { size, registerDraw } = useCanvas();

  useEffect(() => {
    return registerDraw((ctx) => {
      ctx.save();
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = strokeStyle;

      for (let x = 0; x <= size.width; x += step) {
        ctx.beginPath();
        ctx.moveTo(x + 0.5, 0); // 0.5 для более чёткой 1px линии
        ctx.lineTo(x + 0.5, size.height);
        ctx.stroke();
      }
      for (let y = 0; y <= size.height; y += step) {
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(size.width, y + 0.5);
        ctx.stroke();
      }

      ctx.restore();
    });
  }, [size.width, size.height, step, strokeStyle, lineWidth, registerDraw]);

  return null;
}
