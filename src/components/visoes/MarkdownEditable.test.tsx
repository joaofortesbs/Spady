import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownEditable, editableHtmlToMarkdown, markdownToEditableHtml } from "./MarkdownEditable";

describe("MarkdownEditable", () => {
  it("renders Markdown as visual HTML without exposing syntax tokens", () => {
    const html = markdownToEditableHtml("# Título\n\nTexto com **negrito** e *itálico*.\n\n- [ ] Próxima ação");
    expect(html).toContain("<h1>Título</h1>");
    expect(html).toContain("<strong>negrito</strong>");
    expect(html).toContain("<em>itálico</em>");
    expect(html).not.toContain("**");
    expect(html).not.toContain("[ ]");
  });

  it("serializes visual blocks back to Markdown", () => {
    const root = document.createElement("div");
    root.innerHTML = "<h1>Título</h1><p>Texto com <strong>negrito</strong> e <em>itálico</em>.</p><ul data-checklist=\"true\"><li data-checked=\"true\"><span data-checkbox=\"true\">☑ </span> Feito</li></ul>";
    expect(editableHtmlToMarkdown(root)).toBe("# Título\n\nTexto com **negrito** e *itálico*.\n\n- [x] Feito");
  });

  it("accepts visual input and emits serialized Markdown through onChange", () => {
    const onChange = vi.fn();
    render(<MarkdownEditable value="" onChange={onChange} ariaLabel="Conteúdo" />);
    const editor = screen.getByRole("textbox", { name: "Conteúdo" });
    (editor as HTMLDivElement).innerHTML = "<h2>Seção</h2><p><strong>Foco</strong></p>";
    fireEvent.input(editor);
    expect(onChange).toHaveBeenCalledWith("## Seção\n\n**Foco**");
  });
});
