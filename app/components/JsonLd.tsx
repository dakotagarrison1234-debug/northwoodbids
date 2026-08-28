/**
 * Renders a schema.org JSON-LD block. Server component, invisible to users — it just
 * feeds structured data to search engines. Pass any object (or {@graph:[...]}).
 */
export default function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe here; no user-controlled HTML is emitted.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}
