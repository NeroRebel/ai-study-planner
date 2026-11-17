import { useAppData } from "../../hooks/useAppData";
import type { ReactNode } from "react";
import { EmptyState } from "./EmptyState";

export function DataBoundary({ children }: { children: ReactNode }) {
  const { status, error, retry } = useAppData();
  if (status === "loading") return <div className="product-page" role="status" aria-live="polite">
    <EmptyState title="Loading your workspace" description="Fetching subjects, tasks, availability, and study sessions." />
  </div>;
  if (status === "error") return <div className="product-page" role="alert">
    <EmptyState title="Could not load your workspace" description={error}
      action={<button className="button button-primary" onClick={retry}>Retry loading</button>} />
  </div>;
  return children;
}
