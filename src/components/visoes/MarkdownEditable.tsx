"use client";

import React, { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { parseMarkdownBlocks } from "./MarkdownNoteContent";

export interface MarkdownEditableHandle {
  focus: () => void;
  getElement: () => HTMLDivElement | null;
}

interface MarkdownEditableProps {
  value: string;
  onChange: (markdown: string) => void;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  onFocus?: () => void;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  id?: string;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
}

function inlineToHtml(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/==([^=]+)==/g, "<mark>$1</mark>")
    .replace(/~~([^~]+)~~/g, "<del>$1</del>")
    .replace(/(?<!\*)\*([^*\n]+)\*(?!\*)/g, "<em>$1</em>")
    .replace(/(?<!_)_([^_\n]+)_(?!_)/g, "<em>$1</em>");
}

export function markdownToEditableHtml(markdown: string) {
  return parseMarkdownBlocks(markdown).map((block) => {
    if (block.type === "heading") return `<h${block.level}>${inlineToHtml(block.content)}</h${block.level}>`;
    if (block.type === "paragraph") return `<p>${inlineToHtml(block.content)}</p>`;
    if (block.type === "image") return `<p><img src="${escapeHtml(block.src)}" alt="${escapeHtml(block.alt)}" data-note-image="true" style="width:${block.width}%;max-width:100%;height:auto;display:block;border-radius:12px;cursor:ew-resize" /></p>`;
    if (block.type === "unordered-list") return `<ul>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join("")}</ul>`;
    if (block.type === "ordered-list") return `<ol>${block.items.map((item) => `<li>${inlineToHtml(item)}</li>`).join("")}</ol>`;
    if (block.type === "checklist") return `<ul data-checklist="true">${block.items.map((item) => `<li data-checked="${item.checked ? "true" : "false"}"><span data-checkbox="true">${item.checked ? "☑" : "☐"}</span> ${inlineToHtml(item.content)}</li>`).join("")}</ul>`;
    if (block.type === "quote") return `<blockquote>${inlineToHtml(block.content)}</blockquote>`;
    if (block.type === "code") return `<pre><code>${escapeHtml(block.content)}</code></pre>`;
    return "<hr />";
  }).join("") || "<p><br /></p>";
}

function inlineToMarkdown(element: Node): string {
  if (element.nodeType === Node.TEXT_NODE) return element.textContent || "";
  if (!(element instanceof HTMLElement)) return Array.from(element.childNodes).map(inlineToMarkdown).join("");
  const content = Array.from(element.childNodes).map(inlineToMarkdown).join("");
  if (element.tagName === "STRONG" || element.tagName === "B") return `**${content}**`;
  if (element.tagName === "EM" || element.tagName === "I") return `*${content}*`;
  if (element.tagName === "MARK") return `==${content}==`;
  if (element.tagName === "DEL" || element.tagName === "S") return `~~${content}~~`;
  if (element.tagName === "CODE" && element.parentElement?.tagName !== "PRE") return `\`${content}\``;
  if (element.tagName === "IMG") {
    const image = element as HTMLImageElement;
    const width = Math.round(parseFloat(image.style.width || "100"));
    return `![${image.alt || "Imagem anexada"}](${image.src}){width=${Math.min(100, Math.max(20, width))}}`;
  }
  return content;
}

export function editableHtmlToMarkdown(root: HTMLElement) {
  const blocks = Array.from(root.children).map((element) => {
    const tag = element.tagName.toLowerCase();
    if (/^h[1-6]$/.test(tag)) return `${"#".repeat(Number(tag.slice(1)))} ${inlineToMarkdown(element)}`;
    if (tag === "p" || tag === "div") return inlineToMarkdown(element).trim();
    if (tag === "blockquote") return inlineToMarkdown(element).split("\n").map((line) => `> ${line}`).join("\n");
    if (tag === "hr") return "---";
    if (tag === "pre") return `\`\`\`\n${element.textContent || ""}\n\`\`\``;
    if (tag === "ul" || tag === "ol") {
      const isChecklist = element.getAttribute("data-checklist") === "true";
      return Array.from(element.children).map((item, index) => {
        const text = inlineToMarkdown(item).replace(/^[☑☐]\s*/, "").trim();
        if (isChecklist) return `- [${item.getAttribute("data-checked") === "true" ? "x" : " "}] ${text}`;
        return `${tag === "ol" ? `${index + 1}.` : "-"} ${text}`;
      }).join("\n");
    }
    return inlineToMarkdown(element).trim();
  }).filter(Boolean);
  return blocks.join("\n\n").trim();
}

export const MarkdownEditable = forwardRef<MarkdownEditableHandle, MarkdownEditableProps>(function MarkdownEditable({ value, onChange, onKeyDown, onFocus, onClick, id, ariaLabel, placeholder, className = "" }, ref) {
  const elementRef = useRef<HTMLDivElement>(null);
  const lastValueRef = useRef(value);

  useImperativeHandle(ref, () => ({
    focus: () => elementRef.current?.focus(),
    getElement: () => elementRef.current,
  }), []);

  useEffect(() => {
    if (!elementRef.current || lastValueRef.current === value) return;
    const wasFocused = document.activeElement === elementRef.current;
    elementRef.current.innerHTML = markdownToEditableHtml(value);
    lastValueRef.current = value;
    if (wasFocused) elementRef.current.focus();
  }, [value]);

  useEffect(() => {
    if (!elementRef.current) return;
    elementRef.current.innerHTML = markdownToEditableHtml(value);
    lastValueRef.current = value;
  }, []);

  return (
    <div
      ref={elementRef}
      id={id}
      role="textbox"
      aria-label={ariaLabel}
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onFocus={onFocus}
      onClick={onClick}
      onKeyDown={onKeyDown}
      onInput={(event) => {
        const next = editableHtmlToMarkdown(event.currentTarget);
        lastValueRef.current = next;
        onChange(next);
      }}
      className={`markdown-editable min-h-[300px] w-full overflow-y-auto border-0 bg-transparent text-[15px] leading-7 text-white/80 outline-none empty:before:text-white/25 empty:before:content-[attr(data-placeholder)] sm:min-h-[360px] ${className}`}
    />
  );
});

MarkdownEditable.displayName = "MarkdownEditable";
