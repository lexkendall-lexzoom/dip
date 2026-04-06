import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Paperclip Control Plane',
  description: 'Lightweight dashboard for OpenClaw agents.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
