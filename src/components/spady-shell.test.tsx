import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FloatingHeader } from "./layout/FloatingHeader";
import { QuickCaptureModal } from "./quick-capture/QuickCaptureModal";
import { ProfileSettingsModal } from "./profile/ProfileSettingsModal";
import { AnotacoesPage } from "./visoes/AnotacoesPage";

const noop = vi.fn();

const user = {
  id: "user-1",
  email: "joao@example.com",
  user_metadata: { nickname: "João Fortes", full_name: "João Fortes" },
} as never;

describe("Spady shell components", () => {
  it("renders the floating header actions and profile identity", () => {
    const html = renderToString(<FloatingHeader userName="João Fortes" onOpenCapture={noop} onOpenProfile={noop} />);
    expect(html).toContain("Capturar");
    expect(html).toContain("João Fortes");
    expect(html).toContain("Perfil pessoal");
  });

  it("renders the notes quick capture dialog without drag or footer chrome", () => {
    const html = renderToString(<QuickCaptureModal isOpen onClose={noop} onSave={vi.fn(async () => undefined)} />);
    expect(html).toContain("Navegação de notas");
    expect(html).toContain("Salvar");
    expect(html).not.toContain("Formatação visual automática");
    expect(html).not.toContain("Ctrl/Cmd + Enter salva");
    expect(html).toContain("Navegação de notas");
    expect(html).toContain('aria-label="Negrito"');
    expect(html).toContain('aria-label="Destaque"');
    expect(html).toContain('aria-label="Checklist"');
    expect(html).toContain("Comece a escrever");
  });

  it("renders the notes page with pinned and recent groups", () => {
    const html = renderToString(
      <AnotacoesPage
        notes={[{
          id: "note-1",
          title: "Plano semanal",
          content: "Conteúdo da nota",
          color: "#22d3ee",
          createdAt: "2026-08-19T10:00:00.000Z",
          updatedAt: "2026-08-19T10:00:00.000Z",
        }]}
        pinnedNoteIds={["note-1"]}
        onAddNote={noop}
        onUpdateNote={noop}
        onRemoveNote={noop}
        onToggleNotePinned={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("Fixadas");
    expect(html).toContain("Plano semanal");
    expect(html).toContain("Desafixar Plano semanal");
  });

  it("renders the profile settings sections without placeholders", () => {
    const html = renderToString(<ProfileSettingsModal isOpen user={user} onClose={noop} onSaveProfile={vi.fn(async () => undefined)} />);
    expect(html).toContain("Configurações");
    expect(html).toContain("Aparência");
    expect(html).toContain("Notificações");
    expect(html).not.toContain("preparada para a próxima etapa");
  });
});
