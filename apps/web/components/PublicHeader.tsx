"use client";
// "use client" = this component runs in the browser too, because it reacts to
// clicks (opening the mobile menu). Components without it render only on the server.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import styles from "./PublicHeader.module.css";

// Spec §3 public routes. Pages arrive in Phase 5; links are in place already.
const NAV = [
  { href: "/collection", label: "Collection" },
  { href: "/reviews", label: "Reviews" },
  { href: "/cocktails", label: "Cocktails" },
  { href: "/tonics", label: "Tonics" },
  { href: "/distilleries", label: "Distilleries" },
  { href: "/blog", label: "Journal" },
  { href: "/about", label: "About" },
];

export default function PublicHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <header className={styles.masthead}>
      <div className={styles.inner}>
        <Link href="/" className={styles.brand}>
          The Gin Cabinet
        </Link>
        {/* On phones the menu collapses behind this button (spec §2 responsive). */}
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls="public-nav"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
        <nav id="public-nav" aria-label="Main" className={open ? styles.navOpen : styles.nav}>
          <ul>
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={pathname.startsWith(item.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
