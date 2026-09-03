/**
 * Emits a schema.org JSON-LD block.
 *
 * Server component — the markup is in the initial HTML so crawlers see it
 * without executing JavaScript.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is injected verbatim. `<` is escaped so a stray
      // "</script>" inside any string value cannot close the tag early.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
