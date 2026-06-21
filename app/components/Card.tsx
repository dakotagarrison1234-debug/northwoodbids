/* ───────────────────────────────────────────────────────────
   Northwood Bids — base card surface
   bg-white + rustic border + rounded-2xl, with className passthrough.
   ─────────────────────────────────────────────────────────── */

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export default function Card({ children, className = "", ...rest }: CardProps) {
  return (
    <div
      className={`bg-white border border-[#e3d6bf] rounded-2xl ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}
