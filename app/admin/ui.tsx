"use client";
import React from "react";
import { fmtMoney } from "./format";

/**
 * Shared admin UI vocabulary.
 *
 * The admin side deliberately does NOT follow the customer theme. Staff are working
 * fast, often on a phone, often standing in a warehouse — so meaning is carried by
 * colour first and text second, using the conventions everyone already knows:
 *
 *   RED    = money owed to you, or a destructive action
 *   GREEN  = paid / done / good
 *   AMBER  = needs attention soon, in progress, caution
 *   SLATE  = neutral / informational
 *
 * Every interactive element here is at least 44px tall (Apple's minimum touch
 * target). Nothing uses a fixed width, so nothing can overflow a 375px phone.
 */

export type Tone = "red" | "green" | "amber" | "slate" | "blue";

const TONE: Record<Tone, { bg: string; text: string; border: string; solid: string; soft: string }> = {
  red:   { bg: "bg-red-50",    text: "text-red-700",    border: "border-red-200",    solid: "bg-red-600",    soft: "bg-red-100" },
  green: { bg: "bg-green-50",  text: "text-green-700",  border: "border-green-200",  solid: "bg-green-600",  soft: "bg-green-100" },
  amber: { bg: "bg-amber-50",  text: "text-amber-800",  border: "border-amber-200",  solid: "bg-amber-500",  soft: "bg-amber-100" },
  blue:  { bg: "bg-sky-50",    text: "text-sky-800",    border: "border-sky-200",    solid: "bg-sky-600",    soft: "bg-sky-100" },
  slate: { bg: "bg-slate-50",  text: "text-slate-700",  border: "border-slate-200",  solid: "bg-slate-600",  soft: "bg-slate-100" },
};

export const tone = (t: Tone) => TONE[t];

/** A status pill. Short word, strong colour, readable at a glance. */
export function Pill({ tone: t = "slate", children }: { tone?: Tone; children: React.ReactNode }) {
  const c = TONE[t];
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide px-2.5 py-1 rounded-full border whitespace-nowrap ${c.bg} ${c.text} ${c.border}`}>
      {children}
    </span>
  );
}

/**
 * The core admin card: a headline number with a plain-English label, colour-coded
 * by what it means. Tapping it goes somewhere useful — a number you can't act on
 * doesn't belong on a dashboard.
 */
export function StatCard({
  label, value, sub, tone: t = "slate", href, urgent,
}: {
  label: string; value: string | number; sub?: string; tone?: Tone; href?: string; urgent?: boolean;
}) {
  const c = TONE[t];
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-bold uppercase tracking-wide text-slate-500">{label}</div>
        {urgent && <span className={`w-2.5 h-2.5 rounded-full ${c.solid} shrink-0 mt-1`} />}
      </div>
      <div className={`text-3xl font-extrabold mt-1 tabular-nums ${c.text}`}>{value}</div>
      {sub && <div className="text-sm text-slate-500 mt-1 leading-snug">{sub}</div>}
    </>
  );
  const cls = `block rounded-2xl border-2 p-4 min-h-[44px] ${c.bg} ${c.border} ${href ? "active:scale-[0.99] transition-transform" : ""}`;
  if (!href) return <div className={cls}>{inner}</div>;
  return <a href={href} className={cls}>{inner}</a>;
}

/** Section wrapper — white card, clear title, optional right-hand action. */
export function Panel({
  title, sub, action, children, className = "",
}: {
  title?: string; sub?: string; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`bg-white border border-slate-200 rounded-2xl overflow-hidden ${className}`}>
      {(title || action) && (
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-bold text-slate-900 truncate">{title}</h2>}
            {sub && <p className="text-sm text-slate-500 truncate">{sub}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Full-width, 48px-tall action button. Never smaller than a thumb. */
export function Btn({
  tone: t = "slate", variant = "solid", full, className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; variant?: "solid" | "outline"; full?: boolean }) {
  const c = TONE[t];
  const base = "inline-flex items-center justify-center gap-2 min-h-[48px] px-5 rounded-xl font-bold text-base transition-colors disabled:opacity-50 whitespace-nowrap";
  const look = variant === "solid"
    ? `${c.solid} text-white`
    : `bg-white border-2 ${c.border} ${c.text}`;
  return <button className={`${base} ${look} ${full ? "w-full" : ""} ${className}`} {...rest} />;
}

/** Empty state — says what's missing and what to do about it. */
export function Empty({ text, action }: { text: string; action?: React.ReactNode }) {
  return (
    <div className="px-4 py-10 text-center">
      <p className="text-base text-slate-500">{text}</p>
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Money({ value, bold = true }: { value: number; bold?: boolean }) {
  const neg = value < 0;
  return (
    <span className={`tabular-nums ${bold ? "font-extrabold" : "font-semibold"} ${neg ? "text-red-600" : "text-slate-900"}`}>
      {neg ? "−" : ""}{fmtMoney(value)}
    </span>
  );
}
