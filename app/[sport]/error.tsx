"use client";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="surface mx-auto mt-10 max-w-lg p-8 text-center">
      <div className="eyebrow mb-2 text-down">Something broke</div>
      <h2 className="text-xl font-semibold">We couldn&apos;t build this view.</h2>
      <p className="mt-2 text-sm text-fg-muted">A provider or engine failed. Cached data is used when available; nothing is fabricated to fill the gap.{error.digest && <span className="block font-mono text-xs text-fg-dim">ref {error.digest}</span>}</p>
      <button onClick={reset} className="focus-ring mt-5 rounded-lg bg-electric px-4 py-2 text-sm font-medium text-white">Try again</button>
    </div>
  );
}
