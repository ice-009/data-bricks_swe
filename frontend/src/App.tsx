import { useEffect, useState } from "react";
import { api } from "./api";
import { ErrorBanner } from "./components/ui";
import { useApi } from "./hooks/useApi";
import { AccuracyView } from "./views/AccuracyView";
import { DayAheadView } from "./views/DayAheadView";
import { MethodView } from "./views/MethodView";

const REPO_URL = "https://github.com/ice-009/data-bricks_swe";

const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

const TABS = [
  { id: "day-ahead", label: "Day-ahead decision" },
  { id: "accuracy", label: "Forecast accuracy" },
  { id: "method", label: "Method & data" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const tabFromHash = (): TabId => {
  const h = window.location.hash.slice(1);
  return TABS.some((t) => t.id === h) ? (h as TabId) : "day-ahead";
};

function useTheme() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(() => {
    try {
      return (localStorage.getItem("theme") as "light" | "dark" | null) ?? null;
    } catch {
      return null;
    }
  });
  useEffect(() => {
    if (theme) document.documentElement.dataset.theme = theme;
    try {
      if (theme) localStorage.setItem("theme", theme);
    } catch {
      /* storage unavailable: theme just won't persist */
    }
  }, [theme]);
  const isDark = theme ? theme === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  return { isDark, toggle: () => setTheme(isDark ? "light" : "dark") };
}

export default function App() {
  const [tab, setTab] = useState<TabId>(tabFromHash);
  const meta = useApi((s) => api.meta(s), []);
  const { isDark, toggle } = useTheme();

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  return (
    <>
      <header className="app-header">
        <div className="app-header-inner">
          <div className="brand">
            <img src="/favicon.svg" width={28} height={28} alt="" />
            <div>
              <h1>Wind Forecast Desk</h1>
              <small>GB national wind · day-ahead procurement · January 2026 pilot</small>
            </div>
          </div>
          <nav className="tabs">
            {TABS.map((t) => (
              <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => (window.location.hash = t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            <a className="icon-btn" href={REPO_URL} target="_blank" rel="noreferrer" aria-label="Source code on GitHub">
              <GitHubIcon />
              <span className="label">Source</span>
            </a>
            <button className="icon-btn" onClick={toggle} aria-label="Toggle dark mode">
              {isDark ? "☀︎" : "☾"}
            </button>
          </div>
        </div>
      </header>
      <main>
        {meta.error && <ErrorBanner message={meta.error} />}
        {meta.data && tab === "day-ahead" && <DayAheadView meta={meta.data} />}
        {meta.data && tab === "accuracy" && <AccuracyView meta={meta.data} />}
        {meta.data && tab === "method" && <MethodView meta={meta.data} />}
        {!meta.data && !meta.error && <div className="loading">Loading…</div>}
      </main>
    </>
  );
}
