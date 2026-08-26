"use client";

import React from "react";

export type MarkdownBlock =
  | { type: "heading"; level: number; content: string }
  | { type: "paragraph"; content: string }
  | { type: "unordered-list"; items: string[] }
  | { type: "ordered-list"; items: string[] }
  | { type: "checklist"; items: Array<{ checked: boolean; content: string }> }
  | { type: "quote"; content: string }
  | { type: "code"; content: string; language?: string }
  | { type: "image"; alt: string; src: string; width: number }
  | { type: "divider" };

const BLOCK_MARKERS = /^(#{1,6})\s+|^\s*([-*+]\s+|\d+\.\s+|>\s?|```|---\s*$|\*\*\*\s*$|___\s*$)/;

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  const pushParagraph = (paragraphLines: string[]) => {
    const content = paragraphLines.join(" ").trim();
    if (content) blocks.push({ type: "paragraph", content });
  };

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fenced = line.match(/^\s*```\s*([\w-]*)\s*$/);
    if (fenced) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push({ type: "code", content: codeLines.join("\n"), language: fenced[1] || undefined });
      continue;
    }

    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, content: heading[2] });
      index += 1;
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)\{width=(\d+)\}$/);
    if (image) {
      blocks.push({ type: "image", alt: image[1], src: image[2], width: Math.min(100, Math.max(20, Number(image[3]))) });
      index += 1;
      continue;
    }

    if (/^\s*(---|\*\*\*|___)\s*$/.test(line)) {
      blocks.push({ type: "divider" });
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", content: quoteLines.join(" ").trim() });
      continue;
    }

    const checklist = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
    if (checklist) {
      const items: Array<{ checked: boolean; content: string }> = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+\[([ xX])\]\s+(.+)$/);
        if (!item) break;
        items.push({ checked: item[1].toLowerCase() === "x", content: item[2] });
        index += 1;
      }
      blocks.push({ type: "checklist", items });
      continue;
    }

    const unordered = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*[-*+]\s+(.+)$/);
        if (!item || /^\s*[-*+]\s+\[([ xX])\]\s+/.test(lines[index])) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: "unordered-list", items });
      continue;
    }

    const ordered = line.match(/^\s*\d+\.\s+(.+)$/);
    if (ordered) {
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*\d+\.\s+(.+)$/);
        if (!item) break;
        items.push(item[1]);
        index += 1;
      }
      blocks.push({ type: "ordered-list", items });
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !BLOCK_MARKERS.test(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }
    pushParagraph(paragraphLines);
  }

  return blocks;
}

function renderInline(source: string, keyPrefix: string): React.ReactNode[] {
  const tokenPattern = /(\*\*.+?\*\*|==.+?==|~~.+?~~|`[^`]+`|(?<!\*)\*[^*\n]+\*(?!\*)|(?<!_)_[^_\n]+_(?!_))/g;
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index > lastIndex) nodes.push(source.slice(lastIndex, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${match.index}`;
    if (token.startsWith("**")) nodes.push(<strong key={key} className="font-semibold text-white">{renderInline(token.slice(2, -2), key)}</strong>);
    else if (token.startsWith("==")) nodes.push(<mark key={key} className="rounded bg-cyan-300/20 px-1 text-cyan-100">{renderInline(token.slice(2, -2), key)}</mark>);
    else if (token.startsWith("~~")) nodes.push(<del key={key} className="text-white/45">{renderInline(token.slice(2, -2), key)}</del>);
    else if (token.startsWith("`")) nodes.push(<code key={key} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[.9em] text-cyan-100">{token.slice(1, -1)}</code>);
    else nodes.push(<em key={key} className="italic text-white/90">{renderInline(token.slice(1, -1), key)}</em>);
    lastIndex = tokenPattern.lastIndex;
  }

  if (lastIndex < source.length) nodes.push(source.slice(lastIndex));
  return nodes;
}

export function toggleChecklistItem(markdown: string, blockIndex: number, itemIndex: number, checked: boolean): string {
  const blocks = parseMarkdownBlocks(markdown);
  const nextBlocks = blocks.map((block, currentBlockIndex) => {
    if (block.type !== "checklist") return block;
    if (currentBlockIndex !== blockIndex) return block;
    return {
      ...block,
      items: block.items.map((item, currentIndex) => currentIndex === itemIndex ? { ...item, checked } : item),
    };
  });

  return nextBlocks.map((block) => {
    if (block.type === "heading") return `${"#".repeat(block.level)} ${block.content}`;
    if (block.type === "paragraph") return block.content;
    if (block.type === "unordered-list") return block.items.map((item) => `- ${item}`).join("\n");
    if (block.type === "ordered-list") return block.items.map((item, index) => `${index + 1}. ${item}`).join("\n");
    if (block.type === "checklist") return block.items.map((item) => `- [${item.checked ? "x" : " "}] ${item.content}`).join("\n");
    if (block.type === "quote") return block.content.split("\n").map((line) => `> ${line}`).join("\n");
    if (block.type === "code") return `\`\`\`\n${block.content}\n\`\`\``;
    if (block.type === "image") return `![${block.alt}](${block.src}){width=${block.width}}`;
    return "---";
  }).join("\n\n");
}

export function getMarkdownPreview(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+\[([ xX])\]\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_~=]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface MarkdownNoteContentProps {
  content: string;
  className?: string;
  onToggleChecklist?: (blockIndex: number, itemIndex: number, checked: boolean) => void;
}

const HEADING_TAGS = ["h1", "h2", "h3", "h4", "h5", "h6"] as const;

export function MarkdownNoteContent({ content, className = "", onToggleChecklist }: MarkdownNoteContentProps) {
  const blocks = parseMarkdownBlocks(content);

  if (!content.trim()) return <p className={`text-white/40 ${className}`}>Sem conteúdo</p>;

  return (
    <div className={`space-y-4 text-sm leading-7 text-white/80 ${className}`}>
      {blocks.map((block, blockIndex) => {
        const render = (value: string, key: string) => renderInline(value, key);
        if (block.type === "heading") {
          const Tag = HEADING_TAGS[Math.min(Math.max(block.level, 1), 6) - 1];
          const styles = ["", "text-2xl", "text-xl", "text-lg", "text-base", "text-sm", "text-sm"][block.level];
          return <Tag key={blockIndex} className={`${styles} font-semibold tracking-[-.02em] text-white`}>{render(block.content, `heading-${blockIndex}`)}</Tag>;
        }
        if (block.type === "paragraph") return <p key={blockIndex} className="whitespace-pre-wrap">{render(block.content, `paragraph-${blockIndex}`)}</p>;
        if (block.type === "unordered-list") return <ul key={blockIndex} className="list-disc space-y-1 pl-6 marker:text-cyan-200">{block.items.map((item, itemIndex) => <li key={itemIndex}>{render(item, `ul-${blockIndex}-${itemIndex}`)}</li>)}</ul>;
        if (block.type === "ordered-list") return <ol key={blockIndex} className="list-decimal space-y-1 pl-6 marker:text-cyan-200">{block.items.map((item, itemIndex) => <li key={itemIndex}>{render(item, `ol-${blockIndex}-${itemIndex}`)}</li>)}</ol>;
        if (block.type === "quote") return <blockquote key={blockIndex} className="border-l-2 border-cyan-300/60 pl-4 italic text-white/60">{render(block.content, `quote-${blockIndex}`)}</blockquote>;
        if (block.type === "divider") return <hr key={blockIndex} className="border-white/10" />;
        if (block.type === "code") return <pre key={blockIndex} className="overflow-x-auto rounded-xl border border-white/10 bg-black/25 p-4 font-mono text-xs leading-6 text-cyan-100"><code>{block.content}</code></pre>;
        if (block.type === "image") return <img key={blockIndex} src={block.src} alt={block.alt} style={{ width: `${block.width}%` }} />;
        return <ul key={blockIndex} className="space-y-2">{block.items.map((item, itemIndex) => <li key={itemIndex} className="flex items-start gap-3"><input type="checkbox" checked={item.checked} aria-label={`Marcar item ${itemIndex + 1}`} onChange={(event) => onToggleChecklist?.(blockIndex, itemIndex, event.target.checked)} className="mt-1.5 h-4 w-4 accent-cyan-300" /><span className={item.checked ? "text-white/40 line-through" : "text-white/80"}>{render(item.content, `check-${blockIndex}-${itemIndex}`)}</span></li>)}</ul>;
      })}
    </div>
  );
}
