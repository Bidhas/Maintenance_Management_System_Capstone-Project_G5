export default function ErrorBox({ message, onRetry }) {
  if (!message) return null;
  return (
    <div className="g warn">
      <b>{message}</b>
      {onRetry && <div className="mt"><button type="button" className="btn s xs" onClick={onRetry}>Try again</button></div>}
    </div>
  );
}
