"use client";
// Accessible tabs (the WAI-ARIA "tabs" pattern):
// - screen readers announce "tab, 2 of 7, selected";
// - Left/Right arrow keys move between tabs, Home/End jump to the ends;
// - only the selected tab is in the Tab-key order, so keyboard users don't
//   have to step through every tab to reach the content.
// All panels stay rendered (just hidden), so form edits survive tab switches.

import { useId, useRef, useState } from "react";

import styles from "./Tabs.module.css";

type Tab = { id: string; label: string; content: React.ReactNode; badge?: string };

export default function Tabs({ tabs, label }: { tabs: Tab[]; label: string }) {
  const [active, setActive] = useState(0);
  const prefix = useId();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(event: React.KeyboardEvent) {
    const moves: Record<string, number> = {
      ArrowRight: (active + 1) % tabs.length,
      ArrowLeft: (active - 1 + tabs.length) % tabs.length,
      Home: 0,
      End: tabs.length - 1,
    };
    if (event.key in moves) {
      event.preventDefault();
      const next = moves[event.key];
      setActive(next);
      buttons.current[next]?.focus();
    }
  }

  return (
    <div>
      <div role="tablist" aria-label={label} className={styles.tablist} onKeyDown={onKeyDown}>
        {tabs.map((tab, index) => (
          <button
            key={tab.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`${prefix}-tab-${tab.id}`}
            aria-selected={index === active}
            aria-controls={`${prefix}-panel-${tab.id}`}
            tabIndex={index === active ? 0 : -1}
            className={styles.tab}
            onClick={() => setActive(index)}
          >
            {tab.label}
            {tab.badge && <span className={styles.badge}>{tab.badge}</span>}
          </button>
        ))}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${prefix}-panel-${tab.id}`}
          aria-labelledby={`${prefix}-tab-${tab.id}`}
          hidden={index !== active}
          className={styles.panel}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}
