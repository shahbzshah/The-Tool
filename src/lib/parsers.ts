/**
 * Parsers for Stitch exports.
 * DESIGN.md -> design token summary; HTML -> screen/component structure summary.
 * These summaries are injected into the doc-generation AI context.
 */

export function parseDesignMd(content: string): string {
  const colors = [...new Set(content.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [])].slice(0, 20);
  const fonts = [
    ...new Set(
      (content.match(/font-family:\s*([^;\n}]+)/gi) ?? []).map((m) =>
        m.split(":")[1].trim()
      )
    ),
  ].slice(0, 10);
  const headings = (content.match(/^#{1,3}\s.+$/gm) ?? [])
    .map((h) => h.replace(/^#+\s*/, ""))
    .slice(0, 20);
  const radii = [
    ...new Set(
      (content.match(/border-radius:\s*([^;\n}]+)/gi) ?? []).map((m) =>
        m.split(":")[1].trim()
      )
    ),
  ].slice(0, 10);

  const parts: string[] = [];
  if (colors.length) parts.push(`Colors found: ${colors.join(", ")}`);
  if (fonts.length) parts.push(`Font families: ${fonts.join("; ")}`);
  if (radii.length) parts.push(`Border radii: ${radii.join(", ")}`);
  if (headings.length) parts.push(`Document sections: ${headings.join(" | ")}`);

  if (parts.length === 0) {
    // No tokens detected — fall back to raw excerpt
    return `Raw DESIGN.md excerpt:\n${content.slice(0, 1500)}`;
  }
  return `Design tokens extracted from DESIGN.md:\n${parts.join("\n")}\n\nRaw excerpt:\n${content.slice(0, 1000)}`;
}

export function parseHtml(content: string): string {
  const title = content.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  const headings = [
    ...content.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi),
  ]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
    .filter(Boolean)
    .slice(0, 25);
  const buttons = [
    ...content.matchAll(/<(?:button|a)[^>]*>([\s\S]*?)<\/(?:button|a)>/gi),
  ]
    .map((m) => m[1].replace(/<[^>]+>/g, "").trim())
    .filter((t) => t && t.length < 40)
    .slice(0, 25);
  const usesTailwind = /class="[^"]*\b(bg|text|flex|grid)-[\w-]+/.test(content);
  const imgCount = (content.match(/<img\b/gi) ?? []).length;
  const formCount = (content.match(/<(?:form|input|select|textarea)\b/gi) ?? []).length;

  const parts: string[] = [];
  if (title) parts.push(`Page title: ${title}`);
  if (headings.length) parts.push(`Section headings (likely screens/sections): ${headings.join(" | ")}`);
  if (buttons.length) parts.push(`Buttons/links: ${buttons.join(" | ")}`);
  parts.push(`Uses Tailwind CSS: ${usesTailwind ? "yes" : "no"}`);
  parts.push(`Images: ${imgCount}, form elements: ${formCount}`);

  return `Component structure extracted from HTML export:\n${parts.join("\n")}\n\nRaw HTML excerpt:\n${content.slice(0, 1200)}`;
}
