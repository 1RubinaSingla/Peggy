// Shared site nav. Lives in the root layout so every page gets it for free.
// Active-link styling is done client-side via the URL.

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/methodology", label: "methodology" },
];

export function Navbar() {
  const pathname = usePathname();
  return (
    <nav className="navbar" aria-label="primary">
      <Link href="/" className="nav-brand">
        <span className="brand-mark">peggy.cash</span>
        <span className="brand-tag">the cope calculator</span>
      </Link>
      <ul className="nav-links">
        {LINKS.map((l) => {
          const active = pathname === l.href || pathname.startsWith(l.href + "/");
          return (
            <li key={l.href}>
              <Link href={l.href} className={active ? "active" : undefined}>
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
