import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectEditorPopover } from "./ProjectEditorPopover";
import type { KanbanColumn, KanbanProject, KanbanProjectUpdates } from "@/lib/types/blindados";

const project: KanbanProject = {
  id: "project-a",
  name: "Projeto A",
  color: "#06b6d4",
  createdAt: "2026-10-02T12:00:00.000Z",
};

const columns: KanbanColumn[] = [
  { id: "column-a", title: "Planejamento", behavior: "active", projectId: project.id, cards: [] },
  { id: "column-b", title: "Revisão", behavior: "active", projectId: "project-b", cards: [] },
  { id: "column-c", title: "Pessoal", behavior: "active", projectId: null, cards: [] },
];

function renderEditor(onSave = vi.fn().mockResolvedValue({ success: true })) {
  const onOpenChange = vi.fn();
  render(
    <ProjectEditorPopover
      project={project}
      columns={columns}
      projects={[project, { ...project, id: "project-b", name: "Projeto B" }]}
      palette={["#06b6d4", "#ef4444"]}
      open
      onOpenChange={onOpenChange}
      onSave={onSave}
    />,
  );
  return { onSave, onOpenChange };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProjectEditorPopover", () => {
  it("sends only changed metadata and column bindings, with their expected values", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true });
    const { onOpenChange } = renderEditor(onSave);

    const name = await screen.findByLabelText("Nome");
    fireEvent.change(name, { target: { value: "Projeto novo" } });
    fireEvent.click(screen.getByRole("button", { name: "Cor 2: #ef4444" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Revisão/ }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Pessoal/ }));
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    const updates = onSave.mock.calls[0][1] as KanbanProjectUpdates;
    expect(onSave).toHaveBeenCalledWith(project.id, {
      name: "Projeto novo",
      color: "#ef4444",
      expected: { name: project.name, color: project.color },
      columnChanges: [
        { columnId: "column-b", expectedProjectId: "project-b", projectId: project.id },
        { columnId: "column-c", expectedProjectId: null, projectId: project.id },
      ],
    });
    expect(updates.columnChanges).not.toContainEqual(expect.objectContaining({ columnId: "column-a" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("confirms transfers before saving and preserves the draft when declined", async () => {
    const onSave = vi.fn().mockResolvedValue({ success: true });
    renderEditor(onSave);
    fireEvent.click(screen.getByRole("checkbox", { name: /Revisão/ }));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("Transferir a coluna “Revisão”"));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox", { name: /Revisão/ }).hasAttribute("checked")).toBe(false);
    expect((screen.getByRole("checkbox", { name: /Revisão/ }) as HTMLInputElement).checked).toBe(true);
  });

  it("keeps entered values available after a save error and blocks a duplicate submission", async () => {
    let finishSave!: (value: { success: boolean; error: string }) => void;
    const onSave = vi.fn(() => new Promise<{ success: boolean; error: string }>((resolve) => { finishSave = resolve; }));
    renderEditor(onSave);
    const name = await screen.findByLabelText("Nome");
    fireEvent.change(name, { target: { value: "Rascunho preservado" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));

    const savingButton = await screen.findByRole("button", { name: "Salvando..." });
    expect(savingButton.hasAttribute("disabled")).toBe(true);
    fireEvent.click(savingButton);
    expect(onSave).toHaveBeenCalledTimes(1);

    finishSave({ success: false, error: "Conflito de edição" });
    expect((await screen.findByRole("alert")).textContent).toContain("Conflito de edição");
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Rascunho preservado");
  });

  it("cancels without saving", async () => {
    const onSave = vi.fn();
    const { onOpenChange } = renderEditor(onSave);
    fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Descartado" } });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onSave).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});