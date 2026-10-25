"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
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

/** Routes that keep their normal look all week (staff tools, the arcade, printables). */
const HW_SKIP = ["/admin", "/superadmin", "/play", "/invoice", "/labels"];

/**
 * Mount once in the root layout. During the week it puts data-hw on <html>
 * for customer pages, which switches on the site-wide restyle in globals.css
 * (pumpkin-orange buttons, haunted section bands, cobwebbed lot cards). The
 * header stays its normal cream. Colour and decoration only: no layout rules, so nothing can shift.
 */
export function HalloweenRoot() {
  const on = useHalloween();
  const pathname = usePathname() ?? "/";
  const active = on && !HW_SKIP.some((p) => pathname === p || pathname.startsWith(p + "/"));
  useEffect(() => {
    const el = document.documentElement;
    if (active) el.setAttribute("data-hw", "1");
    else el.removeAttribute("data-hw");
    return () => el.removeAttribute("data-hw");
  }, [active]);
  return null;
}

const CDN = "https://d8j0ntlcm91z4.cloudfront.net/user_3IByyQncVzaXbwKjQO3GCQGqPd7";
/** Higgsfield renders (Oct 2026). */
export const HW = {
  /** Hero, first frame: the normal home-page lake (same poster as the rest of the year). */
  heroStart: "/hero/northwoods-poster.webp",
  /** Hero, last frame: the same lake dressed for Halloween in the critter style:
   *  ghost-sheet deer and cow, a goofy muskie leaping, a raccoon witch, bats, jack-o-lanterns. */
  heroEnd: `${CDN}/hf_20261025_162851_e6ad5c53-8b22-4bcd-85f9-1f69e5e517dd_min.webp`,
  /** The lake turning Halloween, start frame to end frame, 10 s, no audio, 1080p, ~31 MB
   *  (desktop on a good connection). */
  heroVideo: `${CDN}/hf_20261025_163029_2ce21f9b-f2ae-49da-a092-c1aee5cb7321.mp4`,
  /** The same transformation re-encoded for phones: 960x540 H.264, 10 s, ~1.8 MB. */
  heroVideoMobile: "https://d2ol7oe51mr4n9.cloudfront.net/user_3IByyQncVzaXbwKjQO3GCQGqPd7/e3ba0d4b-db8f-4cb4-bad7-cbc53d2a5184.mp4",
  /** Wide pumpkin-patch banner: fox, bunny witch, ghost-sheet bear cub, owl (calm on the left). */
  banner: `${CDN}/hf_20261025_162909_ba4504d7-ea0f-4dde-bb72-d9860eca556a.png`,
  /** Transparent cutouts. */
  pumpkins: `${CDN}/hf_20261025_153113_2e4a6a64-bc3e-4ddd-a6eb-0bcf88665a54.png`,
  jack: `${CDN}/hf_20261025_153115_efe4d914-6f05-42c6-8d56-888f5c36a12d.png`,
  raccoon: `${CDN}/hf_20261025_163031_bf5eacdf-943b-46b4-bb58-cd3d9e2fdae3.png`,
  cow: `${CDN}/hf_20261025_163034_b9b2c18c-b9a4-43ad-8a2c-637ae60f72c4.png`,
};

/* ── Hero ─────────────────────────────────────────────────────────────────── */

const WIDE = "(min-width: 768px)";
function subscribeWide(cb: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
/** Which transformation video this device gets: the 1080p file on a big screen,
 *  the 1.8 MB copy on phones, none when the user asked to save data or the link is 2g. */
type HeroMode = "pending" | "full" | "lite" | "none";
function getHeroMode(): HeroMode {
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (c?.saveData) return "none";
  if (c?.effectiveType && /(^|-)2g$/.test(c.effectiveType)) return "none";
  if (c?.effectiveType === "3g") return "lite";
  return window.matchMedia(WIDE).matches ? "full" : "lite";
}

/**
 * Replaces the hero backdrop for the week. The usual lake paints first, then it
 * dresses up for Halloween (ghost-sheet deer and cow, the muskie leaps, bats,
 * a raccoon witch, jack-o-lanterns) and stays that way:
 *  - desktop: the 1080p transformation video plays once and freezes on its last frame;
 *  - phones: the same video, 960p (~1.8 MB), same behaviour;
 *  - save-data / 2g, or autoplay refused (iOS Low Power Mode): the two frames with a soft fade;
 *  - reduced motion: the Halloween frame, still.
 */
const isNarrow = () => !window.matchMedia(WIDE).matches;
/** Phones / small tablets during Halloween week: the hero becomes an edge-to-edge,
 *  uncropped 16:9 video header with the headline on its sky, and the rest of the copy
 *  below it (a tall phone hero would crop away most of the 16:9 scene). */
export function useHeroBand() {
  const on = useHalloween();
  const narrow = useSyncExternalStore(subscribeWide, isNarrow, () => false);
  return on && narrow;
}

export function HeroHalloween({ motionOk }: { motionOk: boolean }) {
  const on = useHalloween();
  const mode = useSyncExternalStore<HeroMode>(subscribeWide, getHeroMode, () => "pending");
  const [videoFailed, setVideoFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const src = mode === "full" ? HW.heroVideo : mode === "lite" ? HW.heroVideoMobile : "";
  const useVideo = on && motionOk && !videoFailed && !!src;
  // Autoplay can be refused (iOS Low Power Mode) and leaves the poster up forever:
  // fall back to the crossfade so the lake still turns.
  useEffect(() => {
    const v = videoRef.current;
    if (!useVideo || !v) return;
    const p = v.play();
    if (p) p.catch((e: unknown) => { if ((e as { name?: string })?.name === "NotAllowedError") setVideoFailed(true); });
  }, [useVideo, src]);
  if (!on) return null;
  return (
    <div aria-hidden="true" className="absolute inset-0 overflow-hidden bg-[#f1e7d5]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={HW.heroStart} alt="" className="absolute inset-0 w-full h-full object-cover object-[50%_100%]" fetchPriority="high" decoding="async" />
      {mode === "pending" && motionOk ? null : useVideo ? (
        <video
          ref={videoRef}
          key={src}
          className="nb-hero-video absolute inset-0 w-full h-full object-cover object-[50%_100%]"
          src={src}
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
          {motionOk && <div className="nb-haunt-flash absolute inset-0 bg-[radial-gradient(ellipse_at_50%_60%,#fff4d6,transparent_70%)]" />}
        </>
      )}
    </div>
  );
}

/* ── Header + menu ────────────────────────────────────────────────────────── */

export function LogoPumpkin() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute -right-5 -bottom-1.5 sm:-right-6 w-8 h-8 sm:w-9 sm:h-9 nb-hw-bob">
      <Image src={HW.jack} alt="" fill sizes="36px" className="object-contain drop-shadow-[0_0_8px_rgba(255,170,60,0.6)]" />
    </span>
  );
}

/** The pumpkin-patch banner across the top of the account menu. The scene already
 *  has its own critters, so no cutouts are stacked on it. */
export function MenuHalloween() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div aria-hidden="true" className="relative h-20 shrink-0 overflow-hidden">
      <Image src={HW.banner} alt="" fill sizes="300px" className="object-cover object-[78%_60%]" />
      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#fbf4e6] to-transparent" />
    </div>
  );
}

/* ── Page headers (auction, My Bids) ──────────────────────────────────────── */

/**
 * The haunted pumpkin patch on the right of a cream page header. The cream
 * fades in from the left so the title stays dark-on-light and readable. The scene
 * has its own critters and pumpkins, so no cutouts are stacked on it.
 */
export function HeaderBannerHalloween({ cream = "#efe5d3" }: { cream?: string }) {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Phones: the haunted patch runs along the bottom padding band only, so
          the title and dates always sit on plain cream. */}
      <div className="sm:hidden absolute inset-x-0 bottom-0 h-[52px]">
        <Image src={HW.banner} alt="" fill sizes="100vw" className="object-cover object-[60%_72%]" />
        <div className="absolute inset-0" style={{ background: `linear-gradient(180deg, ${cream} 0%, ${cream}99 35%, ${cream}00 75%)` }} />
      </div>
      {/* Wider screens: the patch fills the right side, cream fades in from the left. */}
      <div className="hidden sm:block absolute inset-0">
        <Image src={HW.banner} alt="" fill sizes="100vw" className="object-cover object-[80%_55%]" />
        <div
          className="absolute inset-0"
          style={{ background: `linear-gradient(90deg, ${cream} 0%, ${cream} 34%, ${cream}e6 50%, ${cream}66 68%, ${cream}00 84%)` }}
        />
      </div>
    </div>
  );
}

/** The ghost-sheet cow and pumpkins at the bottom of the My Bids sidebar. */
export function SidebarPumpkins() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div aria-hidden="true" className="relative mx-auto w-48 h-28 mb-1">
      <div className="absolute left-0 bottom-0 w-28 h-24">
        <Image src={HW.cow} alt="" fill sizes="112px" className="object-contain object-bottom" />
      </div>
      <div className="absolute right-0 bottom-0 w-24 h-16">
        <Image src={HW.pumpkins} alt="" fill sizes="96px" className="object-contain object-bottom" />
      </div>
    </div>
  );
}

/* ── Item page + footer ───────────────────────────────────────────────────── */

/** The raccoon trick-or-treater on the item photo. */
export function PhotoCritter() {
  const on = useHalloween();
  if (!on) return null;
  return (
    // Phones/tablets: standing in the photo's bottom-right corner (the photo is
    // 34vh tall there), so nothing above the photo is covered. Desktop: perched
    // on the photo's top edge.
    <div aria-hidden="true" className="pointer-events-none absolute top-[calc(34vh-50px)] right-2 z-20 w-12 h-12 lg:-top-[46px] lg:right-4 lg:w-16 lg:h-16 nb-crow-tilt">
      <Image src={HW.raccoon} alt="" fill sizes="64px" className="object-contain object-bottom" />
    </div>
  );
}

/** Pumpkins and the ghost-sheet cow on the footer's pine ridge. */
export function FooterHalloween() {
  const on = useHalloween();
  if (!on) return null;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 max-w-6xl mx-auto">
      <div className="absolute left-[4%] bottom-0 w-24 h-[72px] sm:w-44 sm:h-32">
        <Image src={HW.pumpkins} alt="" fill sizes="176px" className="object-contain object-bottom drop-shadow-[0_0_14px_rgba(255,160,50,0.5)]" />
      </div>
      <div className="absolute right-[8%] bottom-0 w-16 h-16 sm:w-24 sm:h-24">
        <Image src={HW.cow} alt="" fill sizes="96px" className="object-contain object-bottom" />
      </div>
    </div>
  );
}
