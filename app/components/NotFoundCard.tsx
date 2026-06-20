import Link from "next/link";

interface Action {
  href: string;
  label: string;
  primary?: boolean;
}

interface Props {
  title: string;
  message?: string;
  actions?: Action[];
}

/**
 * Consistent full-screen "not found / stuck" card with clear ways forward.
 * Mobile-first: stacked full-width buttons with 44px+ tap targets.
 */
export default function NotFoundCard({ title, message, actions }: Props) {
  const links: Action[] = actions && actions.length > 0 ? actions : [{ href: "/auctions", label: "Browse auctions", primary: true }];
  return (
    <main className="min-h-screen bg-[#faf8f4] text-[#1a1916] flex items-center justify-center px-5">
      <div className="text-center max-w-sm w-full">
        <h1 className="text-2xl font-bold mb-2">{title}</h1>
        {message && <p className="text-[#6b6659] text-sm mb-6">{message}</p>}
        <div className="flex flex-col gap-2.5 mt-6">
          {links.map((a) => (
            <Link
              key={a.href + a.label}
              href={a.href}
              className={
                a.primary
                  ? "w-full bg-[#09a7ad] hover:bg-[#0898a0] text-white font-semibold py-3 rounded-xl transition-colors"
                  : "w-full border border-[#d4cfc4] hover:border-[#b0a99a] text-[#4a4640] hover:text-[#1a1916] font-medium py-3 rounded-xl transition-colors"
              }
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
