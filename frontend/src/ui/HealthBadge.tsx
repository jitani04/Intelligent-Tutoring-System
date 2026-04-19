import { useQuery } from "@tanstack/react-query";

import { getHealth } from "../api";

export function HealthBadge() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["health"],
    queryFn: getHealth,
    retry: 1,
    refetchInterval: 30000,
  });

  let label = "Checking backend";
  let className = "badge badge-muted";

  if (data?.status === "ok") {
    label = "Backend online";
    className = "badge badge-success";
  } else if (isError) {
    label = "Backend offline";
    className = "badge badge-error";
  } else if (!isLoading) {
    label = "Backend unknown";
  }

  return (
    <div className={className}>
      <span className="badge-dot" />
      {label}
    </div>
  );
}
