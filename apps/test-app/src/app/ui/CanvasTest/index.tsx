'use client';
import { MovingRect } from './MovingRect';
import { CanvasProvider, Grid } from '@canvas-works/canvas-works';

export const CanvasTest = () => {
  return (
    <CanvasProvider background="#fff" className="flex-grow !h-full">
      <MovingRect/>
      <Grid step={20} strokeStyle='red' z={1} />
    </CanvasProvider>
  );
};
