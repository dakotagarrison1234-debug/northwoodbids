"use client";
import { useState, useSyncExternalStore } from "react";
import Image from "next/image";

/**
 * Halloween week. Runs Oct 20 through Oct 31 every year on the Michigan
 * calendar and switches itself off at midnight going into Nov 1 (it re-checks
 * every minute, so an open tab goes back to normal without a reload and a page
 * cached before midnight can't stay haunted).
 *
 * Everything is decided on the client: the server always renders the normal
 * site, then the decorations mount. That keeps cached HTML honest.
 *
 * Art is from Higgsfield, painted to match the hero (see HW below). Stickers go
 * through next/image so phones get small WebPs, not the multi-MB originals.
 */

export function isHalloweenWeek(now: Date = new Date()): boolean {
  const p = new Intl.DateTimeFormat("en-US", { timeZone: "America/Detroit", month: "numeric", day: "numeric" }).formatToParts(now);
  const month = Number(p.find((x) => x.type === "month")?.value);
  const day = Number(p.find((x) => x.type === "day")?.value);
  return month === 10 && day >= 20;
}

function subscribeClock(cb: () => void) {
  const id = window.setInterval(cb, 60_000);
  return () => window.clearInterval(id);
}

/** True during Halloween week; false on the server and outside the window. */
export function useHalloween(): boolean {
  return useSyncExternalStore(subscribeClock, () => isHalloweenWeek(), () => false);
}

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3IByyQncVzaXbwKjQO3GCQGqPd7";
/** Higgsfield renders (Oct 2026). */
export const HW = {
  /** Hero, first frame: the cozy autumn lake with jack-o-lanterns. */
  heroStart: `${CDN}/hf_20261025_152810_90a55be5-4a80-47c7-bd31-7ea5b9914ec4_min.webp`,
  /** Hero, last frame: slime lake, skeleton deer, crows, the monster fish. */
  heroEnd: `${CDN}/hf_20261025_153001_a8f464b9-3447-4e53-a160-e955d16f225b_min.webp`,
  /** The transformation, start frame to end frame, 10 s, no audio, 1920x1088, ~18 MB. */
  heroVideo: `${CDN}/hf_20261025_153241_e0c0ba4c-b282-467b-830f-d7e07cd384f1.mp4`,
  /** Wide haunted pumpkin-patch banner (dark, moon on the right). */
  banner: `${CDN}/hf_20261025_153228_e1699f91-3b9b-4e86-87c4-8942ca46ab94.png`,
  /** Transparent cutouts. */
  pumpkins: `${CDN}/hf_20261025_153113_2e4a6a64-bc3e-4ddd-a6eb-0bcf88665a54.png`,
  jack: `${CDN}/hf_20261025_153115_efe4d914-6f05-42c6-8d56-888f5c36a12d.png`,
  crow: `${CDN}/hf_20261025_153335_68edaf17-7e8e-44ee-90a1-571253043531.png`,
  slime: `${CDN}/hf_20261025_153334_99052f87-f8d6-43e5-89c9-c2a5d4033ee4.png`,
};

/** A next/image-optimized URL, for CSS backgrounds (w must be a configured size). */
const optimized = (src: string, w: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;

/* ── Hero ─────────────────────────────────────────────────────────────────── */

const WIDE = "(min-width: 768px)";
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** Big screen on a decent connection: worth the 18 MB transformation video. */
function getRich() {
  if (!window.matchMedia(WIDE).matches) return false;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData) return false;
  if (c?.effectiveType && /(^|-)2g$|^3g$/.test(c.effectiveType)) return false;
  return true;
}

/**
 * Replaces the hero backdrop for the week. The cozy autumn lake paints first,
 * then it turns haunted (slime lake, skeleton deer, crows, the monster fish)
 * and stays that way:
 *  - desktop on a good connection: the transformation video plays once and
 *    freezes on its last frame;
 *  - phones / slow links: the same two frames, switched with a lightning
 *    flicker (about half a megabyte instead of 18);
 *  - reduced motion: the haunted frame, still.
 */
export function HeroHalloween({ motionOk }: { motionOk: boolean }) {
  const on = useHalloween();
  const rich = useSyncExternalStore(subscribeWide, getRich, () => false);
  const [videoFailed, setVideoFailed] = useState(false);
  if (!on) return null;
  const useVideo = motionOk && rich && !videoFailed;
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[#1a1226]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HW.heroStart} alt="" className="absolute inset-0 w-full h-full object-cover object-[50%_100%]" fetchPriority="high" decoding="async" />
      {useVideo ? (
        <video
          className="nb-hero-video absolute inset-0 w-full h-full object-cover object-[50%_100%]"
          src={HW.heroVideo}
          poster={HW.heroStart}
          autoPlay
          muted
          playsInline
          preload="auto"
          onPlaying={(e) => e.currentTarget.classList.add("is-playing")}
          onError={() => setVideoFailed(true)}
        />
      ) : (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={HW.heroEnd}
            alt=""
            className={`absolute inset-0 w-full h-full object-cover object-[50%_100%] ${motionOk ? "nb-haunt" : ""}`}
            decoding="async"
          />
          {motionOk && <div className="nb-haunt-flash absolute inset-0 bg-[#e8ffd0]" />}
        </>
      )}
    </div>
  );
}

/* ── Header + menu ────────────────────────────────────────────────────────── */

/**
 * Slime dripping from the top edge of the home hero (home page only). It
 * lives in the hero, not the sticky header, so it scrolls away with the page.
 * Short on phones so it never reaches the live pill under it.
 */
export function HeroSlime() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div
      aria-hidden="true"
      className="nb-slime pointer-events-none absolute left-0 right-0 top-0 z-[1] h-[30px] sm:h-[44px]"
      style={{ backgroundImage: `url(${optimized(HW.slime, 640)})` }}
    />
  );
}

export function LogoPumpkin() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -right-5 -bottom-1.5 sm:-right-6 w-8 h-8 sm:w-9 sm:h-9 nb-hw-bob">
      <Image src={HW.jack} alt="" fill sizes="36px" className="object-contain drop-shadow-[0_0_8px_rgba(255,170,60,0.6)]" />
    </span>
  );
}

/** The haunted banner across the top of the account menu. */
export function MenuHalloween() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div aria-hidden="true" className="relative h-20 shrink-0 overflow-hidden">
      <Image src={HW.banner} alt="" fill sizes="300px" className="object-cover object-[70%_50%]" />
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#fbf4e6] to-transparent" />
      <div className="absolute right-3 bottom-0 w-14 h-14">
        <Image src={HW.crow} alt="" fill sizes="56px" className="object-contain" />
      </div>
    </div>
  );
}

/* ── Page headers (auction, My Bids) ──────────────────────────────────────── */

/**
 * The haunted pumpkin patch on the right of a cream page header. The cream
 * fades in from the left so the title stays dark-on-light and readable.
 */
export function HeaderBannerHalloween({ cream = "#efe5d3", pumpkins = true }: { cream?: string; pumpkins?: boolean }) {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Phones: the haunted patch runs along the bottom padding band only, so
          the title and dates always sit on plain cream. */}
      <div className="sm:hidden absolute inset-x-0 bottom-0 h-[52px]">
        <Image src={HW.banner} alt="" fill sizes="100vw" className="object-cover object-[60%_72%]" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${cream} 0%, ${cream}99 35%, ${cream}00 75%)` }} />
        {pumpkins && (
          <div className="absolute right-2 bottom-0 w-16 h-12">
            <Image src={HW.pumpkins} alt="" fill sizes="64px" className="object-contain object-bottom" />
          </div>
        )}
      </div>
      {/* Wider screens: the patch fills the right side, cream fades in from the left. */}
      <div className="hidden sm:block absolute inset-0">
        <Image src={HW.banner} alt="" fill sizes="100vw" className="object-cover object-[80%_55%]" />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(90deg, ${cream} 0%, ${cream} 34%, ${cream}e6 50%, ${cream}66 68%, ${cream}00 84%)` }}
        />
        {pumpkins && (
          <div className="absolute right-[3%] -bottom-2 w-36 h-[108px]">
            <Image src={HW.pumpkins} alt="" fill sizes="144px" className="object-contain drop-shadow-[0_0_14px_rgba(255,160,50,0.55)]" />
          </div>
        )}
      </div>
    </div>
  );
}

/** Pumpkins for the bottom of the My Bids sidebar. */
export function SidebarPumpkins() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div aria-hidden="true" className="relative mx-auto w-40 h-28 mb-1">
      <Image src={HW.pumpkins} alt="" fill sizes="160px" className="object-contain" />
    </div>
  );
}

/* ── Item page + footer ───────────────────────────────────────────────────── */

/** A crow perched on the top edge of the item photo. */
export function PhotoCrow() {
  const on = useHalloween();
  if (!on) return null;
  return (
    // Phones/tablets: standing in the photo's bottom-right corner (the photo is
    // 34vh tall there), so nothing above the photo is covered. Desktop: perched
    // on the photo's top edge.
    <div aria-hidden="true" className="pointer-events-none absolute top-[calc(34vh-50px)] right-2 z-20 w-12 h-12 lg:-top-[46px] lg:right-4 lg:w-16 lg:h-16 nb-crow-tilt">
      <Image src={HW.crow} alt="" fill sizes="64px" className="object-contain object-bottom" />
    </div>
  );
}

/** Pumpkins and a crow on the footer's pine ridge. */
export function FooterHalloween() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 max-w-6xl mx-auto">
      <div className="absolute left-[4%] bottom-0 w-24 h-[72px] sm:w-44 sm:h-32">
        <Image src={HW.pumpkins} alt="" fill sizes="176px" className="object-contain object-bottom drop-shadow-[0_0_14px_rgba(255,160,50,0.5)]" />
      </div>
      <div className="absolute right-[8%] bottom-0 w-12 h-12 sm:w-16 sm:h-16">
        <Image src={HW.crow} alt="" fill sizes="64px" className="object-contain object-bottom" />
      </div>
    </div>
  );
}
