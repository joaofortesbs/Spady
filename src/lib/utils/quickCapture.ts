export interface QuickCaptureNote {
  title: string;
  content: string;
  color: string;
}

export type QuickCaptureBlockType =
  | "paragraph"
  | "heading-1"
  | "heading-2"
  | "heading-3"
  | "bullet"
  | "ordered"
  | "checklist"
  | "quote"
  | "divider";

export interface QuickCaptureBlock {
  type: QuickCaptureBlockType;
  text: string;
  checked?: boolean;
}

function parseLine(line: string): QuickCaptureBlock {
  if (line === "---") return { type: "divider", text: "" };
  if (line.startsWith("### ")) return { type: "heading-3", text: line.slice(4) };
  if (line.startsWith("## ")) return { type: "heading-2", text: line.slice(3) };
  if (line.startsWith("# ")) return { type: "heading-1", text: line.slice(2) };
  if (line.startsWith("- [x] ")) return { type: "checklist", text: line.slice(6), checked: true };
  if (line.startsWith("- [ ] ")) return { type: "checklist", text: line.slice(6), checked: false };
  if (line.startsWith("- ")) return { type: "bullet", text: line.slice(2) };
  if (/^\d+\. /.test(line)) return { type: "ordered", text: line.replace(/^\d+\. /, "") };
  if (line.startsWith("> ")) return { type: "quote", text: line.slice(2) };
  return { type: "paragraph", text: line };
}

export function parseQuickCaptureContent(content: string): QuickCaptureBlock[] {
  return content.replace(/\r\n/g, "\n").split("\n").map(parseLine);
}

export function serializeQuickCaptureBlocks(blocks: QuickCaptureBlock[]): string {
  return blocks.map((block, index) => {
    if (block.type === "divider") return "---";
    if (block.type === "heading-1") return `# ${block.text}`;
    if (block.type === "heading-2") return `## ${block.text}`;
    if (block.type === "heading-3") return `### ${block.text}`;
    if (block.type === "bullet") return `- ${block.text}`;
    if (block.type === "ordered") return `${index + 1}. ${block.text}`;
    if (block.type === "checklist") return `- [${block.checked ? "x" : " "}] ${block.text}`;
    if (block.type === "quote") return `> ${block.text}`;
    return block.text;
  }).join("\n");
}

/**
 * Canonicaliza Markdown simples sem introduzir um envelope incompatível com notas antigas.
 * A string continua legível pelas telas existentes e já contém estrutura suficiente para
 * headings, listas, checklists, citações, divisores e marcações inline como ==destaque==.
 */
export function serializeQuickCaptureContent(content: string): string {
  return serializeQuickCaptureBlocks(parseQuickCaptureContent(content.trim()));
}

export function buildQuickCaptureNote(title: string, content: string, color = "#22d3ee"): QuickCaptureNote | null {
  const normalizedTitle = title.trim();
  const normalizedContent = serializeQuickCaptureContent(content);
  const fallbackTitle = normalizedContent.split("\n")[0]?.replace(/^#+\s*/, "").slice(0, 72).trim() || "Nota rápida";

  if (!normalizedTitle && !normalizedContent) return null;

  return {
    title: normalizedTitle || fallbackTitle,
    content: normalizedContent,
    color,
  };
}
