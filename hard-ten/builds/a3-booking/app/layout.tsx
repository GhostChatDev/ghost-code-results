import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'Hourglass Desk', description: 'A calmer way to make time.' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
