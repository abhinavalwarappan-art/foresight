export function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="10.5" stroke="url(#lg)" strokeWidth="1.5" />
        <path d="M3 13.5c3.5-4 6.5-5.5 9-5.5s5.5 1.5 9 5.5" stroke="#2fd3f0" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="16.5" cy="9.2" r="1.6" fill="#4f7cff" />
        <defs>
          <linearGradient id="lg" x1="0" y1="0" x2="24" y2="24">
            <stop stopColor="#4f7cff" />
            <stop offset="1" stopColor="#9b7bff" />
          </linearGradient>
        </defs>
      </svg>
      <span className="text-[15px] font-semibold tracking-[-0.02em]">Foresight</span>
    </span>
  );
}
