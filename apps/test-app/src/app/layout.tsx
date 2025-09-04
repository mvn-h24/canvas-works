import './global.css';
import { PropsWithChildren } from 'react';

export const metadata = {
  title: 'CanvasWorks',
  description: 'Canvas-Works: canvas graph draw lib',
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html>
      <body>
      {children}</body>
    </html>
  );
}
