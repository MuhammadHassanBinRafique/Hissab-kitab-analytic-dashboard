// Shows loading / error / content for one useApi() result.
export default function Async({ state, onRetry, children }) {
  const { data, loading, error } = state;
  return (
    <>
      {error && <div className="state-banner" role="alert"><span>{error}</span><button onClick={onRetry}>Retry</button></div>}
      {!data ? (!error && <div className="state-msg">Loading…</div>) : <div className={loading ? "content-loading" : undefined}>{children(data)}</div>}
    </>
  );
}
