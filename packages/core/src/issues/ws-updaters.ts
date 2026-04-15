import type { QueryClient } from "@tanstack/react-query";
import { issueKeys } from "./queries";
import type { Issue } from "../types";

export function onIssueCreated(qc: QueryClient, wsId: string, issue: Issue) {
  qc.setQueryData<Issue[]>(issueKeys.list(wsId), (old) => {
    if (!old) return [issue];
    return [issue, ...old];
  });
}

export function onIssueUpdated(qc: QueryClient, wsId: string, issue: Issue) {
  // Update detail cache
  qc.setQueryData(issueKeys.detail(wsId, issue.id), issue);
  // Update list cache
  qc.setQueryData<Issue[]>(issueKeys.list(wsId), (old) => {
    if (!old) return old;
    return old.map((i) => (i.id === issue.id ? issue : i));
  });
}

export function onIssueDeleted(qc: QueryClient, wsId: string, id: string) {
  qc.removeQueries({ queryKey: issueKeys.detail(wsId, id) });
  qc.setQueryData<Issue[]>(issueKeys.list(wsId), (old) => {
    if (!old) return old;
    return old.filter((i) => i.id !== id);
  });
}
