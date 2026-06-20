"use client";

export default function LocalDate({ iso, format = "datetime" }: { iso: string | Date; format?: "date" | "datetime" }) {
  const d = new Date(iso);
  if (format === "date") {
    return <>{d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}</>;
  }
  return <>{d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</>;
}
