"use client";

import { useEffect, useRef, type ReactNode } from "react";

// Lightweight animated "shader-like" mesh-gradient background drawn on a 2D
// canvas — evokes the fluid WebGL aesthetic (haoqi.design vibe) without the
// weight/fragility of a real WebGL pipeline. Three drifting radial blobs in
// the accent palette, composited over a dark base, with a soft grain.
export function ShaderBg(): ReactNode {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);

    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const blobs = [
      { hue: 158, sat: 84, light: 52, ax: 0.22, ay: 0.18, bx: 0.6, by: 0.4, r: 0.55 },
      { hue: 190, sat: 80, light: 55, ax: 0.7, ay: 0.3, bx: 0.4, by: 0.6, r: 0.5 },
      { hue: 130, sat: 70, light: 48, ax: 0.5, ay: 0.7, bx: 0.55, by: 0.35, r: 0.45 },
    ];

    const draw = (t: number) => {
      const time = t * 0.00016;
      ctx.clearRect(0, 0, w, h);
      // dark base
      ctx.fillStyle = "#070809";
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = "lighter";
      blobs.forEach((b, i) => {
        const px = (b.ax + (b.bx - b.ax) * (0.5 + 0.5 * Math.sin(time + i))) * w;
        const py = (b.ay + (b.by - b.ay) * (0.5 + 0.5 * Math.cos(time * 0.8 + i))) * h;
        const radius = b.r * Math.max(w, h);
        const g = ctx.createRadialGradient(px, py, 0, px, py, radius);
        g.addColorStop(0, `hsla(${b.hue}, ${b.sat}%, ${b.light}%, 0.55)`);
        g.addColorStop(1, `hsla(${b.hue}, ${b.sat}%, ${b.light}%, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalCompositeOperation = "source-over";

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
      <canvas ref={ref} className="h-full w-full opacity-90" />
      {/* grain + vignette */}
      <div
        className="absolute inset-0 mix-blend-soft-light opacity-[0.12]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.55)_100%)]" />
    </div>
  );
}
