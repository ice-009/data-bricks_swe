import { useEffect, useState } from "react";
import { api } from "./api";
import { ErrorBanner } from "./components/ui";
import { useApi } from "./hooks/useApi";
import { AccuracyView } from "./views/AccuracyView";
import { DayAheadView } from "./views/DayAheadView";
import { MethodView } from "./views/MethodView";

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
          <button className="theme-btn" onClick={toggle} aria-label="Toggle dark mode">
            {isDark ? "☀︎" : "☾"}
          </button>
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
