import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuickCaptureModal } from "./QuickCaptureModal";

function renderEditor() {
  return render(
    <QuickCaptureModal
      isOpen
      onClose={vi.fn()}
      onSave={vi.fn(async () => undefined)}
    />,
  );
}

describe("QuickCaptureModal interactions", () => {
  it("applies bold through a real toolbar click", () => {
    renderEditor();
    const editor = screen.getByRole("textbox", { name: "Conteúdo da nota" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "Foco" } });
    editor.focus();
    editor.setSelectionRange(0, 4);

    fireEvent.click(screen.getByRole("button", { name: "Negrito" }));

    expect(editor.value).toBe("**Foco**");
  });

  it("opens slash menu and applies checklist through the real modal state", async () => {
    renderEditor();
    const editor = screen.getByRole("textbox", { name: "Conteúdo da nota" }) as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: "/chec" } });

    const checklistOptions = screen.getAllByRole("button", { name: /Checklist/ });
    expect(checklistOptions.length).toBeGreaterThan(1);
    fireEvent.click(checklistOptions.at(-1)!);

    expect(editor.value).toBe("- [ ] ");
    await waitFor(() => expect(screen.queryByText("Blocos")).toBeNull());
  });
});
