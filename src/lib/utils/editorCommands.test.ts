import { describe, expect, it } from "vitest";
import { applyInlineCommand, applyLinePrefixCommand, insertSlashCommand } from "./editorCommands";

describe("editor commands", () => {
  it("applies bold and highlight around selected text", () => {
    expect(applyInlineCommand("Plano", 0, 5, "**")).toEqual({ content: "**Plano**", cursor: 9 });
    expect(applyInlineCommand("Foco", 0, 4, "==")).toEqual({ content: "==Foco==", cursor: 8 });
  });

  it("adds a checklist prefix to the active line", () => {
    expect(applyLinePrefixCommand("Plano\nRevisar", 10, "- [ ] ")).toEqual({
      content: "Plano\n- [ ] Revisar",
      cursor: 16,
    });
  });

  it("replaces a slash command with the selected block prefix", () => {
    expect(insertSlashCommand("Plano\n/chec", 11, "- [ ] ")).toEqual({
      content: "Plano\n- [ ] ",
      cursor: 12,
    });
  });
});
