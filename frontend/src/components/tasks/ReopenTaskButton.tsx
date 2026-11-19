import { useState } from "react";
import type { Task } from "../../types";
import { useAppData } from "../../hooks/useAppData";

export function ReopenTaskButton({ task, onReopened }: { task: Task; onReopened?: () => void }) {
  const { dispatch, pending } = useAppData();
  const [error, setError] = useState("");
  if (task.status !== "COMPLETED") return null;
  return <>
    <button type="button" className="text-button" disabled={pending}
      aria-label={"Reopen task: " + task.title}
      title="Keep current progress and study history. Update progress if more work remains."
      onClick={async () => {
        setError("");
        const result = await dispatch({ type: "reopen-task", id: task.id });
        if (result) setError(result); else onReopened?.();
      }}>Reopen task</button>
    {error && <span role="alert" className="form-error">{error}</span>}
  </>;
}
