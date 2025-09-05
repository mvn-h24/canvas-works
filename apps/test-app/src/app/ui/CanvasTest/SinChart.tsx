'use client';

import { FunctionPlot } from '@canvas-works/canvas-works';

export function SinChart() {
  return <FunctionPlot fn={(x) => Math.sin(x) * 150} color="#2563eb" />;
}
