/**
 * Headless smoke test for the arcade cabinets. Needs jsdom on NODE_PATH
 * (it is not a project dependency; the file is excluded from tsconfig):
 *
 *   npm i --no-save jsdom && npx tsx scripts/arcade-smoke.tsx
 *
 * Mounts every game in jsdom with a recording 2D canvas stub, runs
 * `drawAttract` for a few seconds, then starts a run and feeds it random
 * taps/drags/keys for up to 120 s of simulated time in both portrait and
 * landscape. Fails loudly on: an exception anywhere, `onEnd` not called
 * (for timed games) or called twice, a score outside [0, 20000], or a
 * non-finite number reaching the canvas. It does not judge fun — only that
 * nothing crashes on a phone.
 */
import { JSDOM } from "jsdom";
import { createElement, createRef } from "react";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
const win = dom.window as unknown as Window & typeof globalThis;
for (const [k, v] of Object.entries({ window: win, document: win.document, HTMLElement: win.HTMLElement, HTMLCanvasElement: win.HTMLCanvasElement, Element: win.Element, Node: win.Node, Event: win.Event, KeyboardEvent: win.KeyboardEvent, MouseEvent: win.MouseEvent, PointerEvent: win.MouseEvent, getComputedStyle: win.getComputedStyle, localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })) {
  Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
}
Object.defineProperty(globalThis, "navigator", { value: win.navigator, configurable: true });

// ── Fake 2D context: records nothing, validates numbers ───────────────────────
let badNumber: string | null = null;
function chk(name: string, args: unknown[]) {
  for (const a of args) if (typeof a === "number" && !Number.isFinite(a)) { badNumber = badNumber ?? `${name}(${args.map(String).join(",")})`; }
}
const gradient = { addColorStop: (o: number) => chk("addColorStop", [o]) };
function makeCtx(canvas: HTMLCanvasElement) {
  const state: Record<string, unknown> = {};
  const ctx = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (prop === "canvas") return canvas;
      if (prop === "measureText") return (s: string) => ({ width: String(s).length * 7, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 3 });
      if (prop === "createLinearGradient" || prop === "createRadialGradient" || prop === "createConicGradient") return (...a: unknown[]) => { chk(prop, a); return gradient; };
      if (prop === "createPattern") return () => ({});
      if (prop === "getImageData") return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === "isPointInPath") return () => false;
      if (prop in state) return state[prop];
      return (...a: unknown[]) => { chk(prop, a); };
    },
    set(_t, prop: string, v) { if (typeof v === "number") chk(`set ${prop}`, [v]); state[prop] = v; return true; },
  });
  return ctx as unknown as CanvasRenderingContext2D;
}
let W = 390, H = 700;
(win.HTMLCanvasElement.prototype as unknown as { getContext: unknown }).getContext = function (this: HTMLCanvasElement) { return makeCtx(this); };
(win.HTMLElement.prototype as unknown as { getBoundingClientRect: unknown }).getBoundingClientRect = function () { return { x: 0, y: 0, left: 0, top: 0, right: W, bottom: H, width: W, height: H, toJSON() {} }; };
(win.HTMLElement.prototype as unknown as { setPointerCapture: unknown }).setPointerCapture = () => {};
(win.HTMLElement.prototype as unknown as { releasePointerCapture: unknown }).releasePointerCapture = () => {};
(win.HTMLElement.prototype as unknown as { hasPointerCapture: unknown }).hasPointerCapture = () => false;
Object.defineProperty(win, "devicePixelRatio", { value: 2, configurable: true });
Object.defineProperty(win, "innerWidth", { get: () => W, configurable: true });
Object.defineProperty(win, "innerHeight", { get: () => H, configurable: true });

// ResizeObserver: fire once on observe.
class RO { cb: ResizeObserverCallback; constructor(cb: ResizeObserverCallback) { this.cb = cb; } observe(el: Element) { this.cb([{ target: el, contentRect: { width: W, height: H } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver); } unobserve() {} disconnect() {} }
Object.assign(globalThis, { ResizeObserver: RO });
Object.assign(win, { ResizeObserver: RO });

// Manual clock + RAF.
let now = 0;
const rafs = new Map<number, FrameRequestCallback>();
let rafId = 0;
const raf = (cb: FrameRequestCallback) => { rafs.set(++rafId, cb); return rafId; };
const caf = (id: number) => { rafs.delete(id); };
Object.assign(globalThis, { requestAnimationFrame: raf, cancelAnimationFrame: caf });
Object.assign(win, { requestAnimationFrame: raf, cancelAnimationFrame: caf });
const perf = { now: () => now };
Object.defineProperty(globalThis, "performance", { value: perf, configurable: true });
Object.defineProperty(win, "performance", { value: perf, configurable: true });
Object.assign(globalThis, { AudioContext: undefined });
function step(ms: number) {
  now += ms;
  const due = [...rafs.entries()];
  rafs.clear();
  for (const [, cb] of due) cb(now);
}

// ── Load the games (after the DOM shims) ──────────────────────────────────────
async function main() {

const { createRoot } = await import("react-dom/client");
const { act } = await import("react");
const { GAMES } = await import("../app/play/games/types");
const { SoundFx } = await import("../app/play/_sound");
const mods: Record<string, typeof import("../app/play/games/Gavel")> = {
  gavel: await import("../app/play/games/Gavel"),
  buck: await import("../app/play/games/Buck"),
  stack: await import("../app/play/games/Stack"),
  paddles: await import("../app/play/games/Paddles"),
  flap: await import("../app/play/games/Flap"),
  pies: await import("../app/play/games/Pies"),
  trail: await import("../app/play/games/Trail"),
};
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = false;

let failures = 0;
const fail = (m: string) => { failures++; console.log("  FAIL  " + m); };

function fire(el: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}) {
  const ev = new win.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, ...extra });
  Object.defineProperty(ev, "pointerId", { value: 1 });
  Object.defineProperty(ev, "pointerType", { value: "touch" });
  Object.defineProperty(ev, "isPrimary", { value: true });
  el.dispatchEvent(ev);
}
function key(type: "keydown" | "keyup", k: string) {
  win.dispatchEvent(new win.KeyboardEvent(type, { key: k, code: k === " " ? "Space" : k, bubbles: true, cancelable: true }));
  win.document.dispatchEvent(new win.KeyboardEvent(type, { key: k, code: k === " " ? "Space" : k, bubbles: true, cancelable: true }));
}

async function runGame(key_: string, w: number, h: number, seed: number) {
  W = w; H = h;
  const mod = mods[key_];
  const meta = GAMES.find((g) => g.key === key_)!;
  const label = `${meta.title} ${w}x${h}`;
  badNumber = null;
  // attract
  try {
    const c = win.document.createElement("canvas");
    const ctx = c.getContext("2d")!;
    for (let t = 0; t < 6; t += 0.033) mod.drawAttract(ctx, 200, 125, t);
  } catch (e) { fail(`${label}: drawAttract threw: ${(e as Error).message}`); }
  if (badNumber) { fail(`${label}: non-finite in attract ${badNumber}`); badNumber = null; }

  const host = win.document.createElement("div");
  win.document.body.appendChild(host);
  const root = createRoot(host);
  const ref = createRef<import("../app/play/games/types").GameHandle>();
  let ends = 0, endScore = -1, huds = 0;
  const sfx = new SoundFx();
  const lots = Array.from({ length: 12 }, (_, i) => ({ id: `l${i}`, title: `Test lot number ${i} with a longish name`, photo: null, href: null }));
  const errors: string[] = [];
  const onErr = (e: ErrorEvent) => { errors.push(e.message); };
  win.addEventListener("error", onErr);
  try {
    await act(async () => { root.render(createElement(mod.default, { ref, onEnd: (s: number) => { ends++; endScore = s; }, onHud: () => { huds++; }, sfx, lots })); });
    // idle frames
    for (let i = 0; i < 30; i++) step(16.6);
    await act(async () => { ref.current?.start(); });
    const canvas = host.querySelector("canvas") ?? host.firstElementChild!;
    const target = (host.querySelector("canvas") ? canvas : host.firstElementChild!) as Element;
    let rnd = seed;
    const rand = () => { rnd = (rnd * 1664525 + 1013904223) >>> 0; return rnd / 4294967296; };
    let down = false;
    for (let f = 0; f < 120 * 60 && ends === 0; f++) {
      step(16.6);
      if (f % 6 === 0) {
        const x = rand() * W, y = rand() * H;
        const r = rand();
        if (r < 0.35) { fire(target, "pointerdown", x, y); down = true; }
        else if (r < 0.6 && down) { fire(target, "pointermove", x, y); }
        else if (r < 0.8 && down) { fire(target, "pointerup", x, y); down = false; }
        else if (r < 0.9) { key("keydown", " "); }
        else { key("keyup", " "); }
        // Buck: aim for the shoot button bottom-right too.
        if (key_ === "buck" && rand() < 0.3) { fire(target, "pointerdown", W - 50, H - 50); fire(target, "pointerup", W - 50, H - 50); }
      }
      if (badNumber) { fail(`${label}: non-finite number reached the canvas: ${badNumber}`); badNumber = null; break; }
      if (errors.length) break;
    }
    // Gavel ends on a real-time beat (setTimeout), not the simulated clock.
    if (ends === 0) await new Promise((r) => setTimeout(r, 1200));
    const timed = ["buck", "paddles", "pies", "gavel"].includes(key_);
    if (errors.length) fail(`${label}: ${errors[0]}`);
    if (ends === 0 && timed) fail(`${label}: onEnd never called after 120 s`);
    if (ends > 1) fail(`${label}: onEnd called ${ends} times`);
    if (ends === 1 && (!Number.isInteger(endScore) || endScore < 0 || endScore > 20000)) fail(`${label}: bad final score ${endScore}`);
    if (huds === 0) fail(`${label}: onHud never called`);
    // restart after end + stop + unmount must not throw
    await act(async () => { ref.current?.start(); });
    for (let i = 0; i < 60; i++) step(16.6);
    await act(async () => { ref.current?.stop(); });
    await act(async () => { root.unmount(); });
    for (let i = 0; i < 5; i++) step(16.6);
    console.log(`  ok    ${label}: ended=${ends} score=${endScore} huds=${huds}`);
  } catch (e) {
    fail(`${label}: threw ${(e as Error).stack?.split("\n").slice(0, 3).join(" | ")}`);
    try { root.unmount(); } catch { /* ignore */ }
  } finally {
    win.removeEventListener("error", onErr);
    host.remove();
    rafs.clear();
  }
}

for (const g of GAMES) {
  console.log(g.title);
  await runGame(g.key, 390, 700, 7);
  await runGame(g.key, 900, 560, 11);
}
console.log(failures ? `\n${failures} failure(s)` : "\nall cabinets passed");


  process.exit(failures ? 1 : 0);
}
void main();
