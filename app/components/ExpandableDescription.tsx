"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Lot description with an elegant expand / collapse.
 *
 * Collapsed, the text is clamped to a few lines and fades out into the card so
 * it reads as "there's more here" without a hard cut. "Read more" opens it with
 * a smooth height transition; the button only appears when the text actually
 * overflows the clamp, so short descriptions render plain.
 */
export default function ExpandableDescription({ text, lines = 4 }: { text: string; lines?: number }) {
  const [open, setOpen] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const bodyRef = useRef<HTMLParagraphElement | null>(null);
  const trimmed = text.trim();

  // Measure once mounted (and again on resize): does the clamp actually hide anything?
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      if (open) return;
      setOverflows(el.scrollHeight > el.clientHeight + 2);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, trimmed]);

  const clampStyle = open
    ? undefined
    : ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } as React.CSSProperties);

  return (
    <div className="relative">
      <p
        ref={bodyRef}
        style={clampStyle}
        className="text-[15px] text-[#4a3a2b] leading-relaxed whitespace-pre-line"
      >
        {trimmed}
      </p>

      {/* Soft fade so the clamp never looks like a broken line. */}
      {!open && overflows && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white to-white/0"
        />
      )}

      {(overflows || open) && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[#6c4d39] hover:text-[#563e2c] transition-colors"
        >
          <span className="border-b border-dashed border-[#6c4d39]/50 group-hover:border-[#563e2c]">
            {open ? "Show less" : "Read the full description"}
          </span>
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      )}
    </div>
  );
}
