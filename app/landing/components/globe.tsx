"use client";

import { useEffect, useRef, useCallback } from "react";

interface Arc {
  startLat: number;
  startLng: number;
  endLat: number;
  endLng: number;
  progress: number;
  opacity: number;
}

function latLngToXY(
  lat: number,
  lng: number,
  cx: number,
  cy: number,
  r: number,
  rotation: number,
): [number, number, boolean] {
  const phi = (lat * Math.PI) / 180;
  const theta = ((lng + rotation) * Math.PI) / 180;
  const x = r * Math.cos(phi) * Math.sin(theta);
  const y = -r * Math.sin(phi);
  const z = r * Math.cos(phi) * Math.cos(theta);
  return [cx + x, cy + y, z > 0];
}

export function Globe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const arcsRef = useRef<Arc[]>([]);
  const rotationRef = useRef(0);
  const animRef = useRef<number>(0);
  const prefersReducedMotion =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const addArc = useCallback(() => {
    const arc: Arc = {
      startLat: (Math.random() - 0.5) * 140,
      startLng: Math.random() * 360 - 180,
      endLat: (Math.random() - 0.5) * 140,
      endLng: Math.random() * 360 - 180,
      progress: 0,
      opacity: 0.8,
    };
    arcsRef.current.push(arc);
    if (arcsRef.current.length > 12) arcsRef.current.shift();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(500, window.innerWidth * 0.8);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const r = size * 0.38;

    const arcInterval = setInterval(addArc, 800);

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      if (!prefersReducedMotion) {
        rotationRef.current += 0.15;
      }
      const rot = rotationRef.current;

      // Draw wireframe globe
      ctx.strokeStyle = "rgba(226, 228, 233, 0.08)";
      ctx.lineWidth = 0.5;

      // Longitude lines
      for (let lng = -180; lng < 180; lng += 30) {
        ctx.beginPath();
        for (let lat = -90; lat <= 90; lat += 3) {
          const [x, y, visible] = latLngToXY(lat, lng, cx, cy, r, rot);
          if (lat === -90) ctx.moveTo(x, y);
          else if (visible) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }

      // Latitude lines
      for (let lat = -60; lat <= 60; lat += 30) {
        ctx.beginPath();
        for (let lng = -180; lng <= 180; lng += 3) {
          const [x, y, visible] = latLngToXY(lat, lng, cx, cy, r, rot);
          if (lng === -180) ctx.moveTo(x, y);
          else if (visible) ctx.lineTo(x, y);
          else ctx.moveTo(x, y);
        }
        ctx.stroke();
      }

      // Draw equator stronger
      ctx.strokeStyle = "rgba(226, 228, 233, 0.12)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      for (let lng = -180; lng <= 180; lng += 3) {
        const [x, y, visible] = latLngToXY(0, lng, cx, cy, r, rot);
        if (lng === -180) ctx.moveTo(x, y);
        else if (visible) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.stroke();

      // Draw arcs
      for (const arc of arcsRef.current) {
        if (!prefersReducedMotion) {
          arc.progress = Math.min(arc.progress + 0.012, 1);
        } else {
          arc.progress = 1;
        }
        arc.opacity = arc.progress < 0.7 ? 0.8 : 0.8 * (1 - (arc.progress - 0.7) / 0.3);

        const [sx, sy, sv] = latLngToXY(arc.startLat, arc.startLng, cx, cy, r, rot);
        const [ex, ey, ev] = latLngToXY(arc.endLat, arc.endLng, cx, cy, r, rot);

        if (!sv && !ev) continue;

        const midX = (sx + ex) / 2;
        const midY = (sy + ey) / 2 - r * 0.3;
        const drawProgress = arc.progress;

        ctx.strokeStyle = `rgba(232, 122, 47, ${arc.opacity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);

        const steps = Math.floor(drawProgress * 20);
        for (let i = 1; i <= steps; i++) {
          const t = i / 20;
          const px = (1 - t) * (1 - t) * sx + 2 * (1 - t) * t * midX + t * t * ex;
          const py = (1 - t) * (1 - t) * sy + 2 * (1 - t) * t * midY + t * t * ey;
          ctx.lineTo(px, py);
        }
        ctx.stroke();

        // Glow dots at endpoints
        if (arc.progress > 0.9) {
          ctx.fillStyle = `rgba(232, 122, 47, ${arc.opacity * 0.6})`;
          ctx.beginPath();
          ctx.arc(ex, ey, 3, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = `rgba(232, 122, 47, ${arc.opacity * 0.4})`;
        ctx.beginPath();
        ctx.arc(sx, sy, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      arcsRef.current = arcsRef.current.filter((a) => a.opacity > 0.01);

      animRef.current = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      clearInterval(arcInterval);
      cancelAnimationFrame(animRef.current);
    };
  }, [addArc, prefersReducedMotion]);

  return (
    <canvas
      ref={canvasRef}
      className="mx-auto block"
      aria-label="Interactive globe showing affiliate click traffic routed across edge nodes"
      role="img"
    />
  );
}
