import { useQuery } from "@tanstack/react-query";
import { useCoreContext } from "../platform/CoreProvider";

export interface ServerHealth {
  status: "ok" | "error";
  db: "ok" | "error";
}

/**
 * Polls GET /health every 10 s.
 * Returns { daemon: boolean, db: boolean } — both false while loading / offline.
 */
export function useServerHealth() {
  const { apiClient } = useCoreContext();

  const { data, isError } = useQuery<ServerHealth>({
    queryKey: ["server-health"],
    queryFn: () => apiClient.get<ServerHealth>("/health"),
    refetchInterval: 10_000,
    retry: 1,
    staleTime: 8_000,
  });

  const daemon = !isError && data?.status === "ok";
  const db     = !isError && data?.db === "ok";

  return { daemon, db };
}
