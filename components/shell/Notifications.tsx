"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell } from "lucide-react";

export interface Notice {
  id: string;
  title: string;
  body: string;
  href: string;
  tone: "down" | "up" | "amber" | "violet";
}

const DOT = { down: "bg-down", up: "bg-up", amber: "bg-amber", violet: "bg-violet" };

export function Notifications({ items }: { items: Notice[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="focus-ring relative grid size-9 place-items-center rounded-lg border border-line bg-ink-900 text-fg-muted hover:text-fg" aria-label={`Notifications (${items.length})`} aria-expanded={open}>
        <Bell size={15} />
        {items.length > 0 && <span className="absolute right-1.5 top-1.5 size-1.5 rounded-full bg-electric shadow-[0_0_8px_#4f7cff]" />}
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-40 cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />
          <div className="surface-raised absolute right-0 z-50 mt-2 w-80 overflow-hidden">
            <div className="eyebrow border-b border-line px-4 py-2.5">Alerts</div>
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <Link href={n.href} onClick={() => setOpen(false)} className="flex gap-3 px-4 py-3 hover:bg-white/[0.03]">
                    <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${DOT[n.tone]}`} />
                    <span>
                      <span className="block text-[13px] font-medium">{n.title}</span>
                      <span className="block text-xs text-fg-muted">{n.body}</span>
                    </span>
                  </Link>
                </li>
              ))}
              {!items.length && <li className="px-4 py-6 text-center text-sm text-fg-dim">You’re all caught up.</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
