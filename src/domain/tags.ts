/**
 * `#etiquetas` de un texto, en minúsculas y sin repetir. Los títulos de
 * Markdown (`# Título`) no cuentan: tras la almohadilla tiene que ir una letra.
 */
export function extractTags(text: string): string[] {
  const tags = new Set<string>();
  for (const match of text.matchAll(
    /(?<![\p{L}\p{N}_/#])#([\p{L}][\p{L}\p{N}_-]*)/gu,
  )) {
    tags.add(match[1].toLowerCase());
  }
  return [...tags];
}
