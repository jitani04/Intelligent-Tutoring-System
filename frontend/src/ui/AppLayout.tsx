import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar } from "./Sidebar";

const COLLAPSED_KEY = "sapient-sidebar-collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSED_KEY) === "true";
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <div className={`app-layout${collapsed ? " app-layout-collapsed" : ""}`}>
      {!collapsed && <Sidebar onCollapse={() => setCollapsed(true)} />}
      <main className="app-main">
        {collapsed && (
          <button
            aria-label="Open sidebar"
            className="sidebar-reveal-btn"
            onClick={() => setCollapsed(false)}
            title="Open sidebar"
            type="button"
          >
            <PanelLeftOpen size={16} strokeWidth={2} />
          </button>
        )}
        <Outlet />
      </main>
    </div>
  );
}
