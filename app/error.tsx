"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="state-page">
      <div className="brand-mark" aria-hidden="true">R</div>
      <p className="eyebrow">Ripple paused safely</p>
      <h1>We couldn’t load this recovery case.</h1>
      <p>No external actions were taken. Retry the read-only load, or return when the connection is restored.</p>
      <button className="primary-button" onClick={reset}>Try again</button>
    </main>
  );
}
