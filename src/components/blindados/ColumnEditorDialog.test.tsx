import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ColumnEditorDialog } from "./ColumnEditorDialog";
import type { KanbanColumn, KanbanProject } from "@/lib/types/blindados";

const column: KanbanColumn = {
  id: "column-1",
  title: "Em andamento",
  behavior: "active",
  projectId: "project-a",
  backgroundColor: null,
  cards: [],
};
const projects: KanbanProject[] = [
  { id: "project-a", name: "Projeto Alfa", color: "#0891b2", createdAt: "" },
  { id: "project-b", name: "Projeto Beta", color: "#dc2626", createdAt: "" },
];

afterEach(cleanup);

describe("ColumnEditorDialog", () => {
  it("offers only existing projects and commits the selected association", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    render(
      <ColumnEditorDialog
        column={column}
        mode="project"
        projects={projects}
        onUpdate={onUpdate}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Projeto da coluna"), { target: { value: "project-b" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("column-1", { projectId: "project-b" }));
  });

  it("keeps the editor open and explains a failed save", async () => {
    const onUpdate = vi.fn().mockResolvedValue(false);
    render(
      <ColumnEditorDialog
        column={column}
        mode="rename"
        projects={projects}
        onUpdate={onUpdate}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Nome da coluna"), { target: { value: "  Em revisão  " } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onUpdate).toHaveBeenCalledWith("column-1", { title: "Em revisão" });
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("supports custom hex and restoring the default column background", async () => {
    const onUpdate = vi.fn().mockResolvedValue(true);
    const { rerender } = render(
      <ColumnEditorDialog
        column={column}
        mode="color"
        projects={projects}
        onUpdate={onUpdate}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.change(screen.getByLabelText("Código hexadecimal da cor"), { target: { value: "#12abef" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("column-1", { backgroundColor: "#12abef" }));

    onUpdate.mockClear();
    rerender(
      <ColumnEditorDialog
        column={{ ...column, backgroundColor: "#12abef" }}
        mode="color"
        projects={projects}
        onUpdate={onUpdate}
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Fundo padrão/ }));
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalledWith("column-1", { backgroundColor: null }));
  });
});