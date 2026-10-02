import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

function renderEditor(
  onSave = vi.fn().mockResolvedValue({ success: true }),
  onDelete?: (projectId: string) => Promise<{ success: boolean; error?: string }>,
) {
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
      onDelete={onDelete}
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

  it("exposes an accessible delete control and never deletes before explicit confirmation", async () => {
    const onDelete = vi.fn().mockResolvedValue({ success: true });
    renderEditor(undefined, onDelete);

    const deleteButton = screen.getByRole("button", { name: "Excluir projeto Projeto A" });
    expect(deleteButton.getAttribute("aria-haspopup")).toBe("dialog");
    expect(deleteButton.className).toContain("h-11");
    expect(deleteButton.className).toContain("w-11");
    expect(onDelete).not.toHaveBeenCalled();

    fireEvent.click(deleteButton);
    const alertDialog = await screen.findByRole("alertdialog");
    expect(within(alertDialog).getByText("Excluir definitivamente Projeto A?")).toBeTruthy();
    expect(within(alertDialog).getByText("Colunas e tarefas serão preservadas e ficarão sem projeto.")).toBeTruthy();

    fireEvent.click(within(alertDialog).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes only once after confirmation and closes the editor on success", async () => {
    const onDelete = vi.fn().mockResolvedValue({ success: true });
    const { onOpenChange } = renderEditor(undefined, onDelete);

    fireEvent.click(screen.getByRole("button", { name: "Excluir projeto Projeto A" }));
    const alertDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(alertDialog).getByRole("button", { name: "Excluir definitivamente" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(onDelete).toHaveBeenCalledWith(project.id);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("keeps the editor and draft after a deletion result failure", async () => {
    const onDelete = vi.fn().mockResolvedValue({ success: false, error: "Projeto em uso" });
    const { onOpenChange } = renderEditor(undefined, onDelete);
    const name = await screen.findByLabelText("Nome");
    fireEvent.change(name, { target: { value: "Rascunho intacto" } });

    fireEvent.click(screen.getByRole("button", { name: "Excluir projeto Projeto A" }));
    const alertDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(alertDialog).getByRole("button", { name: "Excluir definitivamente" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Projeto em uso");
    expect((screen.getByLabelText("Nome") as HTMLInputElement).value).toBe("Rascunho intacto");
    expect(screen.getByRole("dialog", { name: "Editar projeto Projeto A", hidden: true })).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("keeps the confirmation open after a rejected delete request", async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error("Falha de conexão"));
    renderEditor(undefined, onDelete);
    fireEvent.click(screen.getByRole("button", { name: "Excluir projeto Projeto A" }));
    const alertDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(alertDialog).getByRole("button", { name: "Excluir definitivamente" }));

    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Falha de conexão");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(screen.getByLabelText("Nome")).toBeTruthy();
  });

  it("blocks duplicate delete and save submissions and prevents Escape from closing while deleting", async () => {
    let finishDelete!: (value: { success: boolean }) => void;
    const onDelete = vi.fn(() => new Promise<{ success: boolean }>((resolve) => { finishDelete = resolve; }));
    const onSave = vi.fn().mockResolvedValue({ success: true });
    const { onOpenChange } = renderEditor(onSave, onDelete);

    fireEvent.click(screen.getByRole("button", { name: "Excluir projeto Projeto A" }));
    const alertDialog = await screen.findByRole("alertdialog");
    const confirmButton = within(alertDialog).getByRole("button", { name: "Excluir definitivamente" });
    fireEvent.click(confirmButton);
    expect(await screen.findByRole("button", { name: "Excluindo..." })).toHaveProperty("disabled", true);
    fireEvent.click(confirmButton);
    fireEvent.submit(screen.getByLabelText("Nome").closest("form") as HTMLFormElement);
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toBeTruthy();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    finishDelete({ success: true });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("blocks Escape and deletion while a save is pending", async () => {
    let finishSave!: (value: { success: boolean }) => void;
    const onSave = vi.fn(() => new Promise<{ success: boolean }>((resolve) => { finishSave = resolve; }));
    const onDelete = vi.fn().mockResolvedValue({ success: true });
    const { onOpenChange } = renderEditor(onSave, onDelete);

    fireEvent.change(await screen.findByLabelText("Nome"), { target: { value: "Projeto editado" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar" }));
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Excluir projeto Projeto A" }));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onDelete).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);

    finishSave({ success: true });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});