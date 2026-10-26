"use client";
// Admin navigation (spec §3 administrator routes, §2 "forest left sidebar").
// Sections whose screens are not built yet are listed but disabled, so the
// structure is visible without leading to broken pages.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import SignOutButton from "./SignOutButton";
import styles from "./AdminSidebar.module.css";

type NavItem = { href: string; label: string; ready: boolean };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: "Overview",
    items: [{ href: "/juniper", label: "Dashboard", ready: true }],
  },
  {
    title: "Inventory",
    items: [
      { href: "/juniper/gins", label: "Gins", ready: true },
      { href: "/juniper/distilleries", label: "Distilleries", ready: true },
      { href: "/juniper/bottles", label: "Bottles", ready: true },
      { href: "/juniper/purchases", label: "Purchases", ready: true },
      { href: "/juniper/wishlist", label: "Wishlist", ready: true },
    ],
  },
  {
    title: "Editorial",
    items: [
      { href: "/juniper/tastings", label: "Tastings", ready: true },
      { href: "/juniper/reviews", label: "Reviews", ready: true },
      { href: "/juniper/cocktails", label: "Cocktails", ready: true },
      { href: "/juniper/blog", label: "Journal", ready: true },
      { href: "/juniper/media", label: "Media", ready: true },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/juniper/settings", label: "Settings", ready: true },
      { href: "/juniper/audit", label: "Audit log", ready: true },
    ],
  },
];

type Props = { displayName: string; csrfToken: string };

export default function AdminSidebar({ displayName, csrfToken }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <aside className={styles.sidebar}>
      <div className={styles.top}>
        <Link href="/juniper" className={styles.brand}>
          The Gin Cabinet
        </Link>
        <button
          type="button"
          className={styles.menuButton}
          aria-expanded={open}
          aria-controls="admin-nav"
          onClick={() => setOpen(!open)}
        >
          Menu
        </button>
      </div>

      <div id="admin-nav" className={open ? styles.bodyOpen : styles.body}>
        <nav aria-label="Admin">
          {SECTIONS.map((section) => (
            <div key={section.title} className={styles.section}>
              <p className={styles.sectionTitle}>{section.title}</p>
              <ul>
                {section.items.map((item) =>
                  item.ready ? (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={styles.link}
                        aria-current={
                          pathname === item.href ||
                          (item.href !== "/juniper" && pathname.startsWith(item.href + "/"))
                            ? "page"
                            : undefined
                        }
                        onClick={() => setOpen(false)}
                      >
                        {item.label}
                      </Link>
                    </li>
                  ) : (
                    <li key={item.href}>
                      <span className={styles.linkDisabled} aria-disabled="true">
                        {item.label}
                        <span className={styles.soon}>soon</span>
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </nav>

        <div className={styles.account}>
          <p className={styles.signedInAs}>
            Signed in as <strong>{displayName}</strong>
          </p>
          <SignOutButton csrfToken={csrfToken} />
        </div>
      </div>
    </aside>
  );
}
