"use client";

import Link from "next/link";
import type { ReactElement } from "react";

export type TabKey = "photo" | "stats" | "history" | "mapping";

type BottomTabBarProps = {
  activeTab: TabKey;
  onTabChange?: (tab: TabKey) => void;
};

const TABS: Array<{ key: TabKey; label: string; href: string }> = [
  { key: "photo", label: "Photo", href: "/?tab=photo" },
  { key: "stats", label: "Stats", href: "/?tab=stats" },
  { key: "history", label: "History", href: "/?tab=history" },
  { key: "mapping", label: "Mapping", href: "/?tab=mapping" }
];

export function BottomTabBar({ activeTab, onTabChange }: BottomTabBarProps): ReactElement {
  return (
    <nav className="tab-bar" aria-label="Primary tabs">
      {TABS.map((tab) =>
        onTabChange ? (
          <button
            className={`tab-button ${activeTab === tab.key ? "active" : ""}`}
            key={tab.key}
            onClick={() => onTabChange(tab.key)}
            type="button"
          >
            {tab.label}
          </button>
        ) : (
          <Link className={`tab-button ${activeTab === tab.key ? "active" : ""}`} href={tab.href} key={tab.key}>
            {tab.label}
          </Link>
        )
      )}
    </nav>
  );
}
