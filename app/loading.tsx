export default function Loading() {
  return (
    <main className="loading-shell" aria-label="Loading Ripple">
      <div className="loading-brand skeleton" />
      <div className="loading-title skeleton" />
      <div className="loading-rail skeleton" />
      <div className="loading-grid">
        <div className="loading-panel skeleton" />
        <div className="loading-panel skeleton" />
      </div>
    </main>
  );
}
