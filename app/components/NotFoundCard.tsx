import Link from "next/link";
import { WoodenCrate, PineRidge } from "./Illustrations";

interface Action {
  href: string;
  label: string;
  primary?: boolean;
}

interface Props {
  title: string;
  message?: string;
  actions?: Action[];
  /** Small tag above the headline, e.g. "404" or "Auction". */
  eyebrow?: string;
}

/**
 * Full-screen "not found / dead end" card with clear ways forward.
 * An empty crate under a pine ridge; stacked full-width buttons (44px+ taps).
 */
export default function NotFoundCard({ title, message, actions, eyebrow = "Nothing here" }: Props) {
  const links: Action[] =
    actions && actions.length > 0 ? actions : [{ href: "/auctions", label: "Browse live auctions", primary: true }];
  return (
    <main className="relative min-h-[calc(100vh-4.5rem)] bg-[#f1e7d5] text-[#241a12] flex items-center justify-center px-5 py-16 overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-70">
        <PineRidge className="nb-feather-x block w-full h-28 sm:h-40" />
      </div>

      <div className="nb-rise relative w-full max-w-sm">
        <div className="bg-white rounded-2xl border border-[#e3d6bf] shadow-[0_20px_50px_-30px_rgba(60,40,25,0.5)] px-6 pt-8 pb-6 text-center">
          <WoodenCrate className="w-28 h-24 mx-auto mb-4" />
          <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#a08b6e] mb-1.5">{eyebrow}</div>
          <h1 className="font-display text-2xl font-extrabold leading-tight">{title}</h1>
          {message && <p className="text-[#6f5b46] text-sm mt-2 leading-relaxed">{message}</p>}
          <div className="flex flex-col gap-2.5 mt-6">
            {links.map((a) => (
              <Link
                key={a.href + a.label}
                href={a.href}
                className={
                  a.primary
                    ? "nb-focus w-full bg-[#6c4d39] hover:bg-[#563e2c] active:scale-[0.99] text-white font-semibold py-3 rounded-xl transition-[background-color,transform]"
                    : "nb-focus w-full bg-[#fbf4e6] border border-[#e3d6bf] hover:border-[#cdbda3] hover:bg-[#f6efe1] text-[#4a3a2b] hover:text-[#241a12] font-medium py-3 rounded-xl transition-colors"
                }
              >
                {a.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
