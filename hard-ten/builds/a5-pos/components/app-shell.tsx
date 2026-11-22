"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const links = [
  ["/sale", "Register"], ["/products", "Products"], ["/stock", "Stock"],
  ["/sales", "Sales"], ["/reports", "Reports"],
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return <>
    <header className="topbar">
      <Link className="brand" href="/sale" aria-label="Tallyroom register">
        <span className="brand-mark" aria-hidden="true">T</span>
        <span>Tallyroom<small>POINT OF SALE</small></span>
      </Link>
      <button className="menu-button" aria-expanded={open} aria-controls="shop-navigation" onClick={() => setOpen(!open)}>
        {open ? "Close menu" : "Menu"}
      </button>
      <nav id="shop-navigation" className={open ? "navigation open" : "navigation"} aria-label="Shop navigation">
        {links.map(([href, label]) => <Link key={href} href={href} onClick={() => setOpen(false)}
          className={pathname.startsWith(href) ? "active" : ""} aria-current={pathname.startsWith(href) ? "page" : undefined}>{label}</Link>)}
      </nav>
      <div className="register-status"><span className="status-dot" /> Register 01 <span className="demo-label">Demo data</span></div>
    </header>
    <main>{children}</main>
    <footer className="app-footer">Tallyroom · Totals calculated in integer cents · Stock derived from the movement ledger</footer>
  </>;
}
