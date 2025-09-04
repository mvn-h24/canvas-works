'use client';
import { MovingRect } from './MovingRect';
import { CanvasProvider, Grid } from '@canvas-works/canvas-works';
export const CanvasTest = () => {
  return (
    <CanvasProvider width={500} height={300} background="#fff">
      <Grid step={10} strokeStyle="#d1d5db" lineWidth={1} />
      <MovingRect
        rectWidth={100}
        rectHeight={100}
        speed={200}
        fillStyle="#000"
      />
    </CanvasProvider>
  );
};
