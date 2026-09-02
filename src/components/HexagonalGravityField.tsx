"use client";

import { useEffect, useRef } from "react";

type Wave = { x: number; y: number; startedAt: number };

export function HexagonalGravityField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;
    const drawingContext = canvasElement.getContext("2d", { alpha: true });
    if (!drawingContext) return;
    const canvas = canvasElement;
    const context = drawingContext;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pointer = { x: -10_000, y: -10_000, active: false };
    const waves: Wave[] = [];
    let width = window.innerWidth;
    let height = window.innerHeight;
    let frame = 0;
    let animation = 0;

    function resize() {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function displacedPoint(x: number, y: number, time: number) {
      if (!pointer.active || reducedMotion) return { x, y, influence: 0 };
      const dx = pointer.x - x;
      const dy = pointer.y - y;
      const distance = Math.hypot(dx, dy) || 1;
      const influence = Math.max(0, 1 - distance / 280);
      const ripple = Math.sin(distance / 22 - time / 210) * influence * influence * 7;
      const pull = influence * influence * 5;
      return {
        x: x + (dx / distance) * (pull + ripple),
        y: y + (dy / distance) * (pull + ripple),
        influence,
      };
    }

    function draw(time = 0) {
      context.clearRect(0, 0, width, height);
      const radius = width < 700 ? 32 : 42;
      const horizontal = Math.sqrt(3) * radius;
      const vertical = radius * 1.5;
      const now = performance.now();
      const activeWaves = waves.filter((wave) => now - wave.startedAt < 1_450);
      waves.splice(0, waves.length, ...activeWaves);

      context.lineWidth = 0.72;
      for (let row = -1; row < height / vertical + 2; row += 1) {
        for (let column = -1; column < width / horizontal + 2; column += 1) {
          const centerX = column * horizontal + (row % 2 ? horizontal / 2 : 0);
          const centerY = row * vertical;
          const points = Array.from({ length: 6 }, (_, index) => {
            const angle = Math.PI / 6 + (Math.PI / 3) * index;
            return displacedPoint(
              centerX + Math.cos(angle) * radius,
              centerY + Math.sin(angle) * radius,
              time,
            );
          });
          const centerDistance = Math.hypot(pointer.x - centerX, pointer.y - centerY);
          const pointerGlow = pointer.active ? Math.max(0, 1 - centerDistance / 250) : 0;
          let solid = 0;
          let waveGlow = 0;

          for (const wave of activeWaves) {
            const age = now - wave.startedAt;
            const waveRadius = age * 0.43;
            const distance = Math.hypot(wave.x - centerX, wave.y - centerY);
            waveGlow = Math.max(waveGlow, Math.max(0, 1 - Math.abs(distance - waveRadius) / 70));
            if (age < 650 && distance < 120 + age * 0.12) {
              solid = Math.max(solid, (1 - age / 650) * (1 - distance / (180 + age * 0.12)));
            }
          }

          context.beginPath();
          points.forEach((point, index) => {
            if (index === 0) context.moveTo(point.x, point.y);
            else context.lineTo(point.x, point.y);
          });
          context.closePath();

          if (solid > 0.025) {
            const gradient = context.createRadialGradient(
              centerX - radius * 0.25,
              centerY - radius * 0.3,
              1,
              centerX,
              centerY,
              radius * 1.2,
            );
            gradient.addColorStop(0, `rgba(255, 243, 184, ${solid * 0.82})`);
            gradient.addColorStop(0.36, `rgba(231, 187, 82, ${solid * 0.72})`);
            gradient.addColorStop(1, `rgba(103, 66, 17, ${solid * 0.34})`);
            context.fillStyle = gradient;
            context.shadowColor = "rgba(255, 204, 96, .7)";
            context.shadowBlur = 20 * solid;
            context.fill();
          }

          const alpha = 0.045 + pointerGlow * 0.18 + waveGlow * 0.26;
          context.shadowBlur = waveGlow * 12;
          context.shadowColor = "rgba(255, 216, 128, .5)";
          context.strokeStyle = `rgba(222, 181, 93, ${alpha})`;
          context.stroke();
          context.shadowBlur = 0;
        }
      }

      frame += 1;
      if (!reducedMotion && !document.hidden) animation = requestAnimationFrame(draw);
    }

    const onPointerMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      waves.push({ x: event.clientX, y: event.clientY, startedAt: performance.now() });
      if (reducedMotion) draw(frame);
    };
    const onVisibility = () => {
      if (!document.hidden && !reducedMotion) animation = requestAnimationFrame(draw);
      else cancelAnimationFrame(animation);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener("pointermove", onPointerMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerdown", onPointerDown, { passive: true, capture: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(animation);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown, { capture: true });
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return <canvas ref={canvasRef} className="hex-gravity-field" aria-hidden="true" />;
}
