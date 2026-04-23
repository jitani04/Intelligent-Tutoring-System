import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { getCurrentUser } from "../api";
import { clearToken, isAuthenticated } from "../auth";

export function RequireAuth() {
  const location = useLocation();
  const authenticated = isAuthenticated();

  const userQuery = useQuery({
    queryKey: ["me"],
    queryFn: getCurrentUser,
    enabled: authenticated,
    retry: false,
  });

  useEffect(() => {
    if (userQuery.isError) {
      clearToken();
    }
  }, [userQuery.isError]);

  if (!authenticated) {
    return <Navigate replace to="/" />;
  }

  if (userQuery.isLoading) {
    return (
      <div className="flow-page">
        <div className="flow-card">
          <div className="flow-step">Loading</div>
          <p className="flow-copy">Checking your account...</p>
        </div>
      </div>
    );
  }

  if (userQuery.isError) {
    return <Navigate replace to="/" />;
  }

  if (userQuery.data && !userQuery.data.onboarding_complete && location.pathname !== "/onboarding") {
    return <Navigate replace to="/onboarding" />;
  }

  if (userQuery.data?.onboarding_complete && location.pathname === "/onboarding") {
    return <Navigate replace to="/dashboard" />;
  }

  return <Outlet />;
}
