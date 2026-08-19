import { describe, expect, it } from "vitest";
import { buildQuickCaptureNote, parseQuickCaptureContent, serializeQuickCaptureBlocks } from "./quickCapture";

describe("buildQuickCaptureNote", () => {
  it("uses the first content line as a fallback title", () => {
    expect(buildQuickCaptureNote("", "Revisar roteiro\nAdicionar CTA")).toEqual({
      title: "Revisar roteiro",
      content: "Revisar roteiro\nAdicionar CTA",
      color: "#22d3ee",
    });
  });

  it("trims fields and preserves an explicit title", () => {
    expect(buildQuickCaptureNote("  Ideia  ", "  Detalhes  ", "#a855f7")).toEqual({
      title: "Ideia",
      content: "Detalhes",
      color: "#a855f7",
    });
  });

  it("returns null when the capture is empty", () => {
    expect(buildQuickCaptureNote("   ", "\n  ")).toBeNull();
  });
});

describe("quick capture structured markdown", () => {
  it("preserves headings, highlight and checklist blocks", () => {
    const blocks = parseQuickCaptureContent("# Plano\n==Foco==\n- [ ] Revisar");
    expect(serializeQuickCaptureBlocks(blocks)).toBe("# Plano\n==Foco==\n- [ ] Revisar");
  });
});
