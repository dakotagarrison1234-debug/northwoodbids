"use client";
import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { fmtMoney } from "./format";
import { groupForPath, isActivePage } from "./nav";

/**
 * Admin design kit — "the workshop".
 *
 * Warm parchment canvas, white cards with a soft tan edge, espresso display
 * headings, leather buttons. Meaning still rides on colour first (staff are on a
 * phone in a warehouse): RED = money owed / destructive, GREEN = paid / done,
 * AMBER = needs attention, INK = neutral. Every tap target is 44px+.
 *
 * Palette (shared with the customer site so the brand reads as one thing):
 *   canvas #f4ede1 · card #ffffff · line #e6dac6 · ink #241a12 · leather #6c4d39
 *   mute #8a7559 · body #4a3a2b · moss #4a7c59 · amber #c47b3e · gold #f0a35a
 */

export type Tone = "red" | "green" | "amber" | "slate" | "blue" | "ink" | "leather";

const TONE: Record<Tone, { bg: string; text: string; border: string; solid: string; soft: string; dot: string }> = {
  red:     { bg: "bg-[#fbeae6]", text: "text-[#a1321f]", border: "border-[#f0c4ba]", solid: "bg-[#c0392b] hover:bg-[#a52f22]", soft: "bg-[#f6d6cf]", dot: "bg-[#c0392b]" },
  green:   { bg: "bg-[#e6f1e8]", text: "text-[#2f5d3a]", border: "border-[#bfd9c5]", solid: "bg-[#4a7c59] hover:bg-[#3c6449]", soft: "bg-[#d3e6d7]", dot: "bg-[#4a7c59]" },
  amber:   { bg: "bg-[#fbeed8]", text: "text-[#8a4f1c]", border: "border-[#eed3ab]", solid: "bg-[#c47b3e] hover:bg-[#a85f28]", soft: "bg-[#f6e0bf]", dot: "bg-[#c47b3e]" },
  blue:    { bg: "bg-[#e7eef5]", text: "text-[#2b4d6e]", border: "border-[#c3d3e3]", solid: "bg-[#3a6a93] hover:bg-[#2f567a]", soft: "bg-[#d4e0ec]", dot: "bg-[#3a6a93]" },
  slate:   { bg: "bg-[#f4ede1]", text: "text-[#6f5b46]", border: "border-[#e6dac6]", solid: "bg-[#6f5b46] hover:bg-[#5a4838]", soft: "bg-[#efe3d0]", dot: "bg-[#a3927b]" },
  ink:     { bg: "bg-[#241a12]", text: "text-[#f6ecda]", border: "border-[#241a12]", solid: "bg-[#241a12] hover:bg-black", soft: "bg-[#3a2b1f]", dot: "bg-[#241a12]" },
  leather: { bg: "bg-[#f1e7d5]", text: "text-[#563e2c]", border: "border-[#d9c7ab]", solid: "bg-[#6c4d39] hover:bg-[#563e2c]", soft: "bg-[#e9dcc6]", dot: "bg-[#6c4d39]" },
};

export const tone = (t: Tone) => TONE[t];

// ── Page scaffolding ──────────────────────────────────────────────────────────

/**
 * Standard page header. Title in the display face, one-line blurb, actions on the
 * right. When the page belongs to a multi-page group, the group's section tabs
 * render underneath automatically — so Money shows "Winners · Reports", People shows
 * "Bidders · Referrals · Team · Text a group", etc.
 */
export function PageHeader({
  title,
  sub,
  actions,
  eyebrow,
  tabs = true,
  back,
}: {
  title: React.ReactNode;
  sub?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: string;
  /** Hide the group tabs (detail pages that have their own back link). */
  tabs?: boolean;
  back?: { href: string; label: string };
}) {
  return (
    <header className="bg-white/70 backdrop-blur border-b border-[#e6dac6]">
      <div className="px-4 sm:px-8 pt-4 pb-3 sm:pt-5 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          {back && (
            <Link href={back.href} className="inline-flex items-center gap-1 text-sm font-semibold text-[#8a7559] hover:text-[#241a12] mb-1">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 3L5 8l5 5" /></svg>
              {back.label}
            </Link>
          )}
          {eyebrow && <div className="text-[11px] font-black uppercase tracking-[0.18em] text-[#a85f28]">{eyebrow}</div>}
          <h1 className="font-display text-2xl sm:text-3xl font-black tracking-tight text-[#241a12] leading-none">{title}</h1>
          {sub && <p className="text-sm text-[#8a7559] mt-1.5">{sub}</p>}
        </div>
        {actions && <div className="flex items-center gap-2 shrink-0 flex-wrap">{actions}</div>}
      </div>
      {tabs && <SectionTabs />}
    </header>
  );
}

/** The tabs for the current group (renders nothing for single-page groups). */
export function SectionTabs() {
  const pathname = usePathname() ?? "";
  const g = groupForPath(pathname);
  if (!g || g.pages.length < 2) return null;
  return (
    <nav className="px-4 sm:px-8 flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label={`${g.label} sections`}>
      {g.pages.map((p) => {
        const active = isActivePage(pathname, p.href);
        return (
          <Link
            key={p.href}
            href={p.href}
            className={`relative shrink-0 px-3.5 py-2.5 text-sm font-bold rounded-t-lg transition-colors ${
              active ? "text-[#241a12]" : "text-[#8a7559] hover:text-[#241a12] hover:bg-[#f4ede1]"
            }`}
          >
            {p.label}
            <span className={`absolute left-2 right-2 -bottom-px h-[3px] rounded-full ${active ? "bg-[#c47b3e]" : "bg-transparent"}`} />
          </Link>
        );
      })}
    </nav>
  );
}

/** Content container — consistent gutters and a sane max width. */
export function PageBody({ children, wide = false, className = "" }: { children: React.ReactNode; wide?: boolean; className?: string }) {
  return <div className={`px-4 sm:px-8 py-5 sm:py-6 w-full ${wide ? "max-w-6xl" : "max-w-3xl"} space-y-5 ${className}`}>{children}</div>;
}

// ── Atoms ────────────────────────────────────────────────────────────────────

/** A status pill. Short word, strong colour, readable at a glance. */
export function Pill({ tone: t = "slate", children, dot }: { tone?: Tone; children: React.ReactNode; dot?: boolean }) {
  const c = TONE[t];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide px-2.5 py-1 rounded-full border whitespace-nowrap ${c.bg} ${c.text} ${c.border}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />}
      {children}
    </span>
  );
}

/** Small uppercase label for a group of things. */
export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] font-black uppercase tracking-[0.16em] text-[#8a7559] ${className}`}>{children}</div>;
}

/**
 * Headline number with a plain-English label, colour-coded by what it means.
 * Tapping it goes somewhere useful — a number you can't act on doesn't belong on a
 * dashboard.
 */
export function StatCard({
  label, value, sub, tone: t = "slate", href, urgent, icon,
}: {
  label: string; value: string | number; sub?: string; tone?: Tone; href?: string; urgent?: boolean; icon?: React.ReactNode;
}) {
  const c = TONE[t];
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="text-[11px] font-black uppercase tracking-[0.14em] text-[#8a7559]">{label}</div>
        {icon ? <span className={`${c.text} opacity-80`}>{icon}</span> : urgent ? <span className={`w-2.5 h-2.5 rounded-full ${c.dot} shrink-0 mt-1`} /> : null}
      </div>
      <div className={`font-display text-3xl font-black mt-1 tabular-nums leading-none ${t === "slate" ? "text-[#241a12]" : c.text}`}>{value}</div>
      {sub && <div className="text-sm text-[#8a7559] mt-1.5 leading-snug">{sub}</div>}
    </>
  );
  const cls = `block rounded-2xl border p-4 min-h-[44px] bg-white ${t === "slate" ? "border-[#e6dac6]" : c.border} ${href ? "nb-lift-sm hover:border-[#c47b3e]/50" : ""}`;
  if (!href) return <div className={cls}>{inner}</div>;
  return <Link href={href} className={cls}>{inner}</Link>;
}

/** Section wrapper — white card, clear title, optional right-hand action. */
export function Panel({
  title, sub, action, children, className = "", tone: t, flush = false,
}: {
  title?: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string; tone?: Tone; flush?: boolean;
}) {
  const edge = t ? TONE[t].border : "border-[#e6dac6]";
  return (
    <section className={`bg-white border ${edge} rounded-2xl overflow-hidden shadow-[0_6px_18px_-14px_rgba(60,40,25,0.35)] ${className}`}>
      {(title || action) && (
        <div className="px-4 sm:px-5 py-3.5 border-b border-[#f0e6d6] flex items-center justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-lg font-black text-[#241a12] truncate">{title}</h2>}
            {sub && <p className="text-sm text-[#8a7559] truncate">{sub}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      <div className={flush ? "" : ""}>{children}</div>
    </section>
  );
}

/** Button. 48px tall by default, never smaller than a thumb. */
export function Btn({
  tone: t = "leather", variant = "solid", full, size = "md", className = "", ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: Tone; variant?: "solid" | "outline" | "ghost"; full?: boolean; size?: "sm" | "md" }) {
  const c = TONE[t];
  const base = `inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap ${
    size === "sm" ? "min-h-[40px] px-3.5 text-sm" : "min-h-[48px] px-5 text-base"
  }`;
  const look =
    variant === "solid"
      ? `${c.solid} text-white shadow-sm`
      : variant === "outline"
        ? `bg-white border-2 ${c.border} ${c.text} hover:bg-[#faf5ea]`
        : `bg-transparent ${c.text} hover:bg-[#f4ede1]`;
  return <button className={`${base} ${look} ${full ? "w-full" : ""} ${className}`} {...rest} />;
}

/** Link styled as a button (same sizes/tones as Btn). */
export function BtnLink({
  href, tone: t = "leather", variant = "solid", size = "md", className = "", children,
}: { href: string; tone?: Tone; variant?: "solid" | "outline" | "ghost"; size?: "sm" | "md"; className?: string; children: React.ReactNode }) {
  const c = TONE[t];
  const base = `inline-flex items-center justify-center gap-2 rounded-xl font-bold transition-colors whitespace-nowrap ${
    size === "sm" ? "min-h-[40px] px-3.5 text-sm" : "min-h-[48px] px-5 text-base"
  }`;
  const look =
    variant === "solid" ? `${c.solid} text-white shadow-sm` : variant === "outline" ? `bg-white border-2 ${c.border} ${c.text} hover:bg-[#faf5ea]` : `bg-transparent ${c.text} hover:bg-[#f4ede1]`;
  return <Link href={href} className={`${base} ${look} ${className}`}>{children}</Link>;
}

/** Text input / search box with the kit's look. */
export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <input
      {...rest}
      className={`w-full min-h-[46px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl px-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition ${className}`}
    />
  );
}

export function SearchBox(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const { className = "", ...rest } = props;
  return (
    <div className={`relative ${className}`}>
      <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a3927b]" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></svg>
      <input
        {...rest}
        className="w-full min-h-[46px] bg-white border border-[#d9c7ab] focus:border-[#6c4d39] focus:ring-2 focus:ring-[#6c4d39]/15 rounded-xl pl-10 pr-4 text-[#241a12] placeholder:text-[#b3a085] outline-none transition"
      />
    </div>
  );
}

/** Segmented control — a row of mutually exclusive choices. */
export function Segmented<T extends string>({
  value, onChange, options, className = "",
}: { value: T; onChange: (v: T) => void; options: { value: T; label: React.ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={`inline-flex rounded-xl border border-[#e6dac6] bg-white p-1 gap-1 max-w-full overflow-x-auto [scrollbar-width:none] ${className}`} role="tablist">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-bold transition-colors ${on ? "bg-[#241a12] text-[#f6ecda] shadow-sm" : "text-[#6f5b46] hover:bg-[#f4ede1]"}`}
          >
            {o.label}
            {o.count != null && <span className={`text-[11px] tabular-nums rounded-full px-1.5 py-0.5 ${on ? "bg-white/15" : "bg-[#efe3d0] text-[#8a7559]"}`}>{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** Toolbar row: search on the left, controls on the right, wraps on phones. */
export function Toolbar({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`flex flex-wrap items-center gap-2 sm:gap-3 ${className}`}>{children}</div>;
}

/** Empty state — says what's missing and what to do about it. */
export function Empty({ text, sub, action, icon }: { text: string; sub?: string; action?: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="px-4 py-12 text-center">
      {icon && <div className="flex justify-center mb-3 text-[#cdbda3]">{icon}</div>}
      <p className="font-display text-lg font-black text-[#241a12]">{text}</p>
      {sub && <p className="text-sm text-[#8a7559] mt-1">{sub}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}

/** A tappable list row: leading, body, trailing, chevron. */
export function Row({
  href, onClick, leading, title, sub, trailing, tone: t, className = "",
}: {
  href?: string; onClick?: () => void; leading?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; trailing?: React.ReactNode; tone?: Tone; className?: string;
}) {
  const inner = (
    <>
      {leading && <div className="shrink-0">{leading}</div>}
      <div className="min-w-0 flex-1">
        <div className="font-bold text-[#241a12] leading-tight truncate">{title}</div>
        {sub && <div className="text-sm text-[#8a7559] mt-0.5 leading-snug truncate">{sub}</div>}
      </div>
      {trailing && <div className="shrink-0 text-right">{trailing}</div>}
      {(href || onClick) && (
        <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#cdbda3] shrink-0"><path d="M6 3l5 5-5 5" /></svg>
      )}
    </>
  );
  const bg = t ? `${TONE[t].bg}` : "bg-white";
  const cls = `flex items-center gap-3 px-4 py-3.5 min-h-[56px] ${bg} ${href || onClick ? "hover:bg-[#faf5ea] active:bg-[#f4ede1] transition-colors" : ""} ${className}`;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={`${cls} w-full text-left`}>{inner}</button>;
  return <div className={cls}>{inner}</div>;
}

/** A big "job to do" card: count, sentence, whole row taps through. */
export function ActionCard({
  href, count, label, sub, tone: t = "slate",
}: { href: string; count: number | string; label: string; sub: string; tone?: Tone }) {
  const c = TONE[t];
  return (
    <Link href={href} className={`flex items-center gap-4 px-4 py-4 border rounded-2xl bg-white ${t === "slate" ? "border-[#e6dac6]" : c.border} nb-lift-sm hover:border-[#c47b3e]/50`}>
      <div className={`font-display text-4xl font-black tabular-nums min-w-[4rem] text-center shrink-0 ${t === "slate" ? "text-[#cdbda3]" : c.text}`}>{count}</div>
      <div className="min-w-0 flex-1">
        <div className="font-bold text-[#241a12] leading-tight">{label}</div>
        <div className="text-sm text-[#8a7559] leading-snug mt-0.5">{sub}</div>
      </div>
      <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#cdbda3] shrink-0"><path d="M6 3l5 5-5 5" /></svg>
    </Link>
  );
}

/** Progress bar, 0–1. */
export function Progress({ value, tone: t = "green", className = "" }: { value: number; tone?: Tone; className?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={`h-2 rounded-full bg-[#efe3d0] overflow-hidden ${className}`}>
      <div className={`h-full rounded-full ${TONE[t].dot} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
    </div>
  );
}

/** Inline notice (success / error / info). */
export function Notice({ tone: t = "slate", children, className = "" }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  const c = TONE[t];
  return <div className={`rounded-xl border px-4 py-3 text-sm font-semibold ${c.bg} ${c.text} ${c.border} ${className}`}>{children}</div>;
}

export function Money({ value, bold = true }: { value: number; bold?: boolean }) {
  const neg = value < 0;
  return (
    <span className={`tabular-nums ${bold ? "font-extrabold" : "font-semibold"} ${neg ? "text-[#a1321f]" : "text-[#241a12]"}`}>
      {neg ? "−" : ""}{fmtMoney(value)}
    </span>
  );
}

/** Avatar circle from a name's initials. */
export function Initials({ name, size = 40, className = "" }: { name: string | null | undefined; size?: number; className?: string }) {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  const txt = parts.length === 0 ? "?" : parts.length === 1 ? parts[0][0] : parts[0][0] + parts[parts.length - 1][0];
  const hue = [...(name ?? "")].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 360, 0);
  return (
    <span
      className={`inline-grid place-items-center rounded-full font-black text-white shrink-0 ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hue} 28% 42%)` }}
    >
      {txt.toUpperCase()}
    </span>
  );
}
