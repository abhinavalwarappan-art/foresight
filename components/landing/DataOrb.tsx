"use client";

import { useEffect, useRef } from "react";

/**
 * Original generative hero: a rotating point-cloud sphere. Latitude bands read as
 * basketball channels, a laced great-circle reads as a football seam, and orbiting
 * probability arcs carry "player-data" particles. Pure canvas, no 3D library.
 */
export function DataOrb({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let w = 0, h = 0, dpr = 1, raf = 0, t = 0;

    // Fibonacci sphere
    const N = 900;
    const pts = Array.from({ length: N }, (_, i) => {
      const y = 1 - (i / (N - 1)) * 2;
      const r = Math.sqrt(1 - y * y);
      const phi = i * Math.PI * (3 - Math.sqrt(5));
      return { x: Math.cos(phi) * r, y, z: Math.sin(phi) * r, s: Math.random() };
    });
    // Seam: a tilted great circle with laces
    const seam = Array.from({ length: 160 }, (_, i) => {
      const a = (i / 160) * Math.PI * 2;
      return { x: Math.cos(a), y: Math.sin(a) * 0.35, z: Math.sin(a) * 0.94 };
    });
    const arcs = [0, 1, 2].map((k) => ({ tilt: 0.5 + k * 0.55, speed: 0.6 + k * 0.25, r: 1.25 + k * 0.13, hue: ["79,124,255", "47,211,240", "155,123,255"][k] }));

    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      w = rect.width; h = rect.height;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const project = (x: number, y: number, z: number, rot: number, R: number) => {
      const cx = Math.cos(rot), sx = Math.sin(rot);
      const x1 = x * cx + z * sx;
      const z1 = -x * sx + z * cx;
      const tilt = 0.32;
      const y1 = y * Math.cos(tilt) - z1 * Math.sin(tilt);
      const z2 = y * Math.sin(tilt) + z1 * Math.cos(tilt);
      const persp = 2.6 / (2.6 + z2);
      return { X: w / 2 + x1 * R * persp, Y: h / 2 + y1 * R * persp, z: z2, p: persp };
    };

    const frame = () => {
      t += reduce ? 0 : 0.0035;
      ctx.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.34;
      const rot = t * 1.4 + 0.6;

      // core glow
      const g = ctx.createRadialGradient(w / 2, h / 2, R * 0.1, w / 2, h / 2, R * 1.6);
      g.addColorStop(0, "rgba(79,124,255,0.16)");
      g.addColorStop(0.5, "rgba(155,123,255,0.05)");
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // points, with latitude "channels" brightened
      for (const pt of pts) {
        const q = project(pt.x, pt.y, pt.z, rot, R);
        const channel = Math.abs(pt.y) < 0.035 || Math.abs(pt.x * Math.cos(0.9) + pt.z * Math.sin(0.9)) < 0.03;
        const depth = (1 - q.z) / 2;
        const a = (0.2 + depth * 0.85) * (channel ? 1.5 : 1);
        ctx.fillStyle = channel ? `rgba(47,211,240,${Math.min(1, a)})` : `rgba(200,212,255,${a * (0.55 + pt.s * 0.45)})`;
        const size = (channel ? 1.5 : 1) * q.p * (0.6 + depth * 0.9);
        ctx.fillRect(q.X, q.Y, size, size);
      }

      // football seam + laces
      ctx.beginPath();
      seam.forEach((s, i) => {
        const q = project(s.x, s.y, s.z, rot, R * 1.002);
        if (i === 0) ctx.moveTo(q.X, q.Y); else ctx.lineTo(q.X, q.Y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(233,237,245,0.22)";
      ctx.lineWidth = 1;
      ctx.stroke();
      for (let i = 0; i < 9; i++) {
        const s = seam[60 + i * 4];
        const q = project(s.x, s.y, s.z, rot, R);
        if (q.z > 0.15) continue;
        ctx.strokeStyle = "rgba(233,237,245,0.45)";
        ctx.beginPath();
        ctx.moveTo(q.X - 4 * q.p, q.Y - 3 * q.p);
        ctx.lineTo(q.X + 4 * q.p, q.Y + 3 * q.p);
        ctx.stroke();
      }

      // probability arcs with travelling particles
      for (const arc of arcs) {
        ctx.beginPath();
        const steps = 120;
        let prev: ReturnType<typeof project> | null = null;
        for (let i = 0; i <= steps; i++) {
          const a = (i / steps) * Math.PI * 2;
          const q = project(Math.cos(a) * arc.r, Math.sin(a) * arc.r * Math.sin(arc.tilt), Math.sin(a) * arc.r * Math.cos(arc.tilt), rot * 0.4, R);
          if (prev && q.z < 0.6) { ctx.moveTo(prev.X, prev.Y); ctx.lineTo(q.X, q.Y); }
          prev = q;
        }
        ctx.strokeStyle = `rgba(${arc.hue},0.16)`;
        ctx.stroke();
        for (let k = 0; k < 3; k++) {
          const a = t * arc.speed * 6 + k * 2.1;
          const q = project(Math.cos(a) * arc.r, Math.sin(a) * arc.r * Math.sin(arc.tilt), Math.sin(a) * arc.r * Math.cos(arc.tilt), rot * 0.4, R);
          const glow = ctx.createRadialGradient(q.X, q.Y, 0, q.X, q.Y, 10 * q.p);
          glow.addColorStop(0, `rgba(${arc.hue},0.95)`);
          glow.addColorStop(1, `rgba(${arc.hue},0)`);
          ctx.fillStyle = glow;
          ctx.fillRect(q.X - 12, q.Y - 12, 24, 24);
        }
      }
      if (!reduce) raf = requestAnimationFrame(frame);
    };
    frame();
    const onVis = () => {
      cancelAnimationFrame(raf);
      if (!document.hidden && !reduce) raf = requestAnimationFrame(frame);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return <canvas ref={ref} className={className} aria-hidden />;
}
