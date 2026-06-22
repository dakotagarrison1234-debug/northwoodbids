"use client";
import { useState } from "react";

// Shows the first sentence of a description; a down-arrow "Read more" reveals the rest.
// Falls back gracefully when the text is short or has no clear sentence break.
export default function ExpandableDescription({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const trimmed = text.trim();

  // Preview = first sentence (ends in . ! or ?), else first ~160 characters.
  const sentence = trimmed.match(/^[\s\S]*?[.!?](?=\s|$)/)?.[0]?.trim() ?? "";
  let preview = sentence;
  if (!preview || preview.length < 40) {
    preview = trimmed.length > 160 ? trimmed.slice(0, 160).trim() : trimmed;
  }

  const hasMore = preview.length < trimmed.length;

  if (!hasMore) {
    return <p className="text-[#6f5b46] mb-6 whitespace-pre-line">{trimmed}</p>;
  }

  const endsPunctuated = /[.!?]$/.test(preview);

  return (
    <div className="mb-6">
      <p className="text-[#6f5b46] whitespace-pre-line">
        {open ? trimmed : endsPunctuated ? preview : `${preview}…`}
      </p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-1.5 inline-flex items-center gap-1 text-sm font-semibold text-[#6c4d39] hover:text-[#563e2c] transition-colors"
      >
        {open ? "Show less" : "Read more"}
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
    </div>
  );
}
