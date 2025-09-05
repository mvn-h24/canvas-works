'use client';
import { CanvasProvider, FunctionPlot, MathGrid } from '@canvas-works/canvas-works';
import { SinChart } from '@/app/ui/CanvasTest/SinChart';

export const CanvasTest = () => {
  return (
    <CanvasProvider background="#fff" className="flex-grow !h-full">
      <MathGrid />
      <SinChart />
      <FunctionPlot fn={(x) => 150} color="red" />
      <FunctionPlot fn={(x) => -150} color="red" />
    </CanvasProvider>
  );
};
