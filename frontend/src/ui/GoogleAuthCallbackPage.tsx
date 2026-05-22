import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { setToken } from "../auth";
import Loading from "./Loading";

export function GoogleAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = searchParams.get("token");
    const next = searchParams.get("next") ?? "/dashboard";

    if (!token) {
      navigate("/", { replace: true });
      return;
    }

    setToken(token);
    void queryClient.invalidateQueries({ queryKey: ["me"] });
    navigate(next, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <Loading title="Signing in…" />;
}
