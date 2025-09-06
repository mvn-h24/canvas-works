'use client';
import {
  CanvasProvider,
  FunctionPlot,
  TrigonometricalGrid,
} from '@canvas-works/canvas-works';

export const CanvasTest = () => {
  return (
    <CanvasProvider background="#fff" className="flex-grow !h-full">
      <TrigonometricalGrid />
      <FunctionPlot fn={(x) => Math.sin(x) * 2} color="#2563eb" />
      <FunctionPlot fn={(x) => 2} color="red" />
      <FunctionPlot fn={(x) => -2} color="red" />
    </CanvasProvider>
  );
};
