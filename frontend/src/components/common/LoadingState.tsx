export function LoadingState({ title, description }: { title: string; description?: string }) {
  return <div className="loading-state" role="status" aria-live="polite">
    <span className="status-indicator" aria-hidden="true"><i /><i /><i /></span>
    <strong>{title}</strong>
    {description && <p>{description}</p>}
    <div className="loading-skeletons" aria-hidden="true"><span /><span /><span /></div>
  </div>;
}
