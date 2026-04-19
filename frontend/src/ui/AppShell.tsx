import { Outlet } from "react-router-dom";

export function AppShell() {
  return (
    <div className="chat-route-shell">
      <Outlet />
    </div>
  );
}
