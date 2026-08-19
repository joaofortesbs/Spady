import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickCaptureModal } from "./QuickCaptureModal";

function renderEditor(onSave = vi.fn(async () => undefined)) {
  return {
    onSave,
    ...render(
      <QuickCaptureModal
        isOpen
        onClose={vi.fn()}
        onSave={onSave}
      />,
    ),
  };
}

describe("QuickCaptureModal WYSIWYG interactions", () => {
  it("renders a visual editor without exposing Preview or Edit controls", () => {
    renderEditor();
    const editor = screen.getByRole("textbox", { name: "Conteúdo da nota" });

    expect(editor.getAttribute("contenteditable")).toBe("true");
    expect(screen.queryByRole("button", { name: /Visualizar Markdown|Voltar para edição|Editar/ })).toBeNull();
    expect(screen.getByLabelText("Navegação de notas")).toBeTruthy();
  });

  it("does not expose a draggable affordance or drag handler", () => {
    const { container } = renderEditor();
    expect(container.querySelector('[aria-label*="arrast" i]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/GripVertical|grabbing|pointercapture/i);
  });

  it("navigates the user's notes and exposes a pin action", () => {
    const onToggleNotePinned = vi.fn();
    render(
      <QuickCaptureModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        notes={[{
          id: "note-1",
          title: "Plano semanal",
          content: "Texto da nota",
          color: "#22d3ee",
          createdAt: "2026-08-19T10:00:00.000Z",
          updatedAt: "2026-08-19T10:00:00.000Z",
        }]}
        onToggleNotePinned={onToggleNotePinned}
      />,
    );

    expect(screen.getByText("Plano semanal")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Fixar Plano semanal" }));
    expect(onToggleNotePinned).toHaveBeenCalledWith("note-1");
  });

  it("selects an existing note inside the quick capture editor", () => {
    render(
      <QuickCaptureModal
        isOpen
        onClose={vi.fn()}
        onSave={vi.fn(async () => undefined)}
        notes={[{
          id: "note-2",
          title: "Nota selecionável",
          content: "Conteúdo existente",
          color: "#22d3ee",
          createdAt: "2026-08-19T10:00:00.000Z",
          updatedAt: "2026-08-19T10:00:00.000Z",
        }]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^Nota selecionável$/ }));
    expect(screen.getByDisplayValue("Nota selecionável")).toBeTruthy();
    expect(screen.getByText("Salvar")).toBeTruthy();
  });

  it("serializes visual formatting to Markdown only when saving", async () => {
    const { onSave } = renderEditor();
    const editor = screen.getByRole("textbox", { name: "Conteúdo da nota" }) as HTMLDivElement;
    editor.innerHTML = "<h1>Título</h1><p>Texto com <strong>negrito</strong> e <em>itálico</em>.</p><ul data-checklist=\"true\"><li data-checked=\"false\"><span data-checkbox=\"true\">☐</span> Próxima ação</li></ul>";
    fireEvent.input(editor);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(
      "Título",
      "# Título\n\nTexto com **negrito** e *itálico*.\n\n- [ ] Próxima ação",
    ));
  });

  it("applies the checklist command through the visual toolbar", () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    renderEditor();
    fireEvent.click(screen.getByRole("button", { name: "Checklist" }));
    expect(execCommand).toHaveBeenCalledWith("insertUnorderedList");
  });

  it("applies checklist from the keyboard shortcut", () => {
    const execCommand = vi.fn(() => true);
    Object.defineProperty(document, "execCommand", { value: execCommand, configurable: true });
    renderEditor();
    const editor = screen.getByRole("textbox", { name: "Conteúdo da nota" });
    fireEvent.keyDown(editor, { key: "8", ctrlKey: true, shiftKey: true });
    expect(execCommand).toHaveBeenCalledWith("insertUnorderedList");
  });

  it("opens the visual slash menu without inserting a raw slash token", () => {
    renderEditor();
    const editor = screen.getByRole("textbox", { name: "Conteúdo da nota" });
    fireEvent.keyDown(editor, { key: "/" });
    expect(screen.getByText("Blocos")).toBeTruthy();
  });

  it("keeps the rich surface accessible and accepts keyboard input without raw Markdown tokens", () => {
    renderEditor();
    const editor = screen.getByRole("textbox", { name: "Conteúdo da nota" }) as HTMLDivElement;
    editor.innerHTML = "<p>Texto visual</p>";
    fireEvent.input(editor);
    expect(editor.textContent).toContain("Texto visual");
    expect(editor.textContent).not.toContain("**");
    expect(editor.textContent).not.toContain("[ ]");
  });
});
