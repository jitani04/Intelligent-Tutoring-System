import { useEffect, useMemo, useState } from "react";
import { Outlet } from "react-router-dom";
import { PanelLeftOpen } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { StartSessionModal } from "./StartSessionModal";
import { NewSubjectModal } from "./NewSubjectModal";
import { StartSessionModalContext, type StartSessionOptions } from "./StartSessionModalContext";

const COLLAPSED_KEY = "sapient-sidebar-collapsed";

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(COLLAPSED_KEY) === "true";
}

export function AppLayout() {
  const [collapsed, setCollapsed] = useState<boolean>(readCollapsed);
  const [startSessionOptions, setStartSessionOptions] = useState<StartSessionOptions | null>(null);
  const [newSubjectOpen, setNewSubjectOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed));
  }, [collapsed]);

  const contextValue = useMemo(
    () => ({
      openStartSession: (options?: StartSessionOptions) => setStartSessionOptions(options ?? {}),
      openNewSubject: () => setNewSubjectOpen(true),
    }),
    [],
  );

  return (
    <StartSessionModalContext.Provider value={contextValue}>
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
        {startSessionOptions && (
          <StartSessionModal
            initialSubject={startSessionOptions.subject}
            onClose={() => setStartSessionOptions(null)}
          />
        )}
        {newSubjectOpen && <NewSubjectModal onClose={() => setNewSubjectOpen(false)} />}
      </div>
    </StartSessionModalContext.Provider>
  );
}
