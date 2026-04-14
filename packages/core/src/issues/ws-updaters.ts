import type { QueryClient } from "@tanstack/react-query";
import { issueKeys } from "./queries";
import type { Issue } from "../types";

export function onIssueCreated(qc: QueryClient, wsId: string, issue: Issue) {
  qc.setQueryData<{ issues: Issue[] }>(issueKeys.list(wsId), (old) => {
    if (!old) return { issues: [issue] };
    return { issues: [issue, ...old.issues] };
  });
}

export function onIssueUpdated(qc: QueryClient, wsId: string, issue: Issue) {
  // Update detail cache
  qc.setQueryData(issueKeys.detail(wsId, issue.id), issue);
  // Update list cache
  qc.setQueryData<{ issues: Issue[] }>(issueKeys.list(wsId), (old) => {
    if (!old) return old;
    return {
      issues: old.issues.map((i) => (i.id === issue.id ? issue : i)),
    };
  });
}

export function onIssueDeleted(qc: QueryClient, wsId: string, id: string) {
  qc.removeQueries({ queryKey: issueKeys.detail(wsId, id) });
  qc.setQueryData<{ issues: Issue[] }>(issueKeys.list(wsId), (old) => {
    if (!old) return old;
    return { issues: old.issues.filter((i) => i.id !== id) };
  });
}
