import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import Shell from "@/components/Shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Confirm & Remind",
  description: "Write it down. Confirm what matters. Get reminded.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Confirm & Remind", statusBarStyle: "default" },
};

export const viewport: Viewport = { themeColor: "#2f6f5e", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
