import Link from "next/link";

export default function NotFound() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 text-center">
      <div>
        <div className="eyebrow mb-3">404</div>
        <h1 className="text-4xl font-semibold tracking-tight">Nothing projected here.</h1>
        <Link href="/nfl" className="mt-6 inline-block text-sm text-electric-soft hover:text-electric">Back to the command center →</Link>
      </div>
    </div>
  );
}
