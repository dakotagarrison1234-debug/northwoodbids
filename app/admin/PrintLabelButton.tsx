"use client";

/**
 * Opens the 4x6 label PDF in the browser's native PDF viewer (new tab), where you
 * print it to the Rollo at "Actual size."
 *
 * Why not auto-print via a hidden iframe: printing a PDF through an iframe goes
 * through the browser's PAGE-print engine — it forces letter paper, adds URL/date
 * headers and footers, and shrinks the 4x6 to fit. The PDF viewer respects the
 * PDF's real 4x6 page size and adds no chrome, so the label fills the label.
 * Opening the URL also shows every page of a multi-page batch (all transfers).
 */
export default function PrintLabelButton({
  href,
  label = "Print label",
  className = "",
}: {
  href: string; // /api/admin/label?...
  label?: string;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
      style={{ textDecoration: "none" }}
    >
      {label}
    </a>
  );
}
