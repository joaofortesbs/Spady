import React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FloatingHeader } from "./layout/FloatingHeader";
import { QuickCaptureModal } from "./quick-capture/QuickCaptureModal";
import { ProfileSettingsModal } from "./profile/ProfileSettingsModal";

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

  it("renders the draggable quick capture dialog when open", () => {
    const html = renderToString(<QuickCaptureModal isOpen onClose={noop} onSave={vi.fn(async () => undefined)} />);
    expect(html).toContain("Captura rápida");
    expect(html).toContain("Registre agora. Organize depois.");
    expect(html).toContain("Salvar nota");
  });

  it("renders the profile settings sections without placeholders", () => {
    const html = renderToString(<ProfileSettingsModal isOpen user={user} onClose={noop} onSaveProfile={vi.fn(async () => undefined)} />);
    expect(html).toContain("Configurações");
    expect(html).toContain("Aparência");
    expect(html).toContain("Notificações");
    expect(html).not.toContain("preparada para a próxima etapa");
  });
});
