"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Reveals its children as they scroll into view — a soft rise (or slide/zoom).
 * Works great on mobile (IntersectionObserver, no scroll listeners) and falls
 * back to simply showing the content when observers or motion aren't available.
 *
 * `delay` staggers siblings; `variant` picks the entrance direction.
 */
export default function ScrollReveal({
  children,
  delay = 0,
  variant = "up",
  className = "",
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  variant?: "up" | "left" | "right" | "zoom";
  className?: string;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            if (once) io.disconnect();
          } else if (!once) {
            setShown(false);
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [once]);

  const variantClass =
    variant === "left" ? "reveal-left" : variant === "right" ? "reveal-right" : variant === "zoom" ? "reveal-zoom" : "";

  return (
    <div
      ref={ref}
      className={`reveal ${variantClass} ${shown ? "is-in" : ""} ${className}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}
