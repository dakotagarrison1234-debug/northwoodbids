/** Line icons for the admin nav. 16-unit grid, stroke only, inherit colour. */
export default function AdminNavIcon({ name, size = 22 }: { name: string; size?: number }) {
  const s = { width: size, height: size, fill: "none", viewBox: "0 0 16 16", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "home": return <svg {...s}><path d="M2 7L8 2l6 5v7a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V7z" /><path d="M6 14V9h4v5" /></svg>;
    case "gavel": return <svg {...s}><path d="M10 2L6 6l4 4 4-4-4-4zM2 14l5-5" /><path d="M6 10l-4 4" /></svg>;
    case "package": return <svg {...s}><path d="M8 2L2 5v6l6 3 6-3V5L8 2z" /><path d="M2 5l6 3 6-3M8 8v7" /></svg>;
    case "coin": return <svg {...s}><circle cx="8" cy="8" r="6" /><path d="M8 4.5v7M6 6.3c0-.8.9-1.3 2-1.3s2 .5 2 1.3-.9 1.2-2 1.5-2 .7-2 1.5.9 1.3 2 1.3 2-.5 2-1.3" /></svg>;
    case "users": return <svg {...s}><circle cx="6" cy="5" r="2.5" /><path d="M1 14c0-3 2-4.5 5-4.5s5 1.5 5 4.5" /><circle cx="12" cy="5" r="2" /><path d="M12 10c2 0 3 1 3 3.5" /></svg>;
    case "ticket": return <svg {...s}><path d="M2 5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1.5a1.5 1.5 0 0 0 0 3V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V9.5a1.5 1.5 0 0 0 0-3V5z" /><path d="M9 4v8" strokeDasharray="1.5 1.5" /></svg>;
    case "settings": return <svg {...s}><circle cx="8" cy="8" r="2.5" /><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" /></svg>;
    case "site": return <svg {...s}><circle cx="8" cy="8" r="6" /><path d="M2 8h12M8 2c2 2 2 10 0 12M8 2c-2 2-2 10 0 12" /></svg>;
    case "mybids": return <svg {...s}><circle cx="8" cy="8" r="6" /><path d="M8 5v3.5l2 1.5" /></svg>;
    case "more": return <svg {...s}><circle cx="3.5" cy="8" r="1" fill="currentColor" /><circle cx="8" cy="8" r="1" fill="currentColor" /><circle cx="12.5" cy="8" r="1" fill="currentColor" /></svg>;
    case "out": return <svg {...s}><path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6" /></svg>;
    default: return null;
  }
}
