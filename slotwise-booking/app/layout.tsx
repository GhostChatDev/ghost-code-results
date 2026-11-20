import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = { title: 'SlotWise', description: 'Thoughtful booking for independent studios', manifest: '/manifest.webmanifest' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><header className="header"><Link href="/" className="brand"><span className="brand-mark">S</span>SlotWise</Link><nav aria-label="Main navigation"><Link href="/">Studio</Link><Link href="/bookings">My bookings</Link><Link href="/owner">Owner</Link><Link href="/sign-in">Sign in</Link></nav></header><main className="container">{children}</main><footer className="footer">SlotWise · More time for what matters.</footer></body></html>;
}
