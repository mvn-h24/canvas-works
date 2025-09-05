'use client';
import {
  CanvasProvider,
  MathGrid,
} from '@canvas-works/canvas-works';

export const CanvasTest = () => {
  return (
    <CanvasProvider background="#fff" className="flex-grow !h-full">
      <MathGrid centerAxes />
    </CanvasProvider>
  );
};
