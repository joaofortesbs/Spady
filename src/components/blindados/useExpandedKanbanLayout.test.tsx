import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useExpandedKanbanLayout } from "./useExpandedKanbanLayout";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function sizedElement(height: number) {
  const element = document.createElement("div");
  Object.defineProperty(element, "clientHeight", { configurable: true, value: height });
  return element;
}

describe("useExpandedKanbanLayout", () => {
  it("measures after delayed auth mount and reattaches after a mode-wait section swap", async () => {
    vi.stubGlobal("ResizeObserver", class {
      observe() {}
      disconnect() {}
    });
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });

    const { result } = renderHook(() => useExpandedKanbanLayout());
    expect(result.current.flowsBoardHeight).toBeUndefined();

    const flows = sizedElement(800);
    const timerChart = sizedElement(400);
    act(() => {
      result.current.flowsSectionRef(flows);
      result.current.timerChartRef(timerChart);
    });
    await waitFor(() => expect(result.current.flowsBoardHeight).toBe(492));

    const painel = sizedElement(700);
    act(() => {
      result.current.flowsSectionRef(null);
      result.current.timerChartRef(null);
      result.current.painelSectionRef(painel);
    });
    await waitFor(() => expect(result.current.painelBoardHeight).toBe(978));
  });
});