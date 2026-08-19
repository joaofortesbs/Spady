import { describe, expect, it } from "vitest";
import { getDraggedModalPosition } from "./modalDrag";

describe("modal drag positioning", () => {
  it("translates the modal by the pointer delta", () => {
    expect(getDraggedModalPosition({ x: 0, y: 0 }, { x: 400, y: 300 }, { x: 470, y: 340 }, 1280, 720)).toEqual({ x: 70, y: 40 });
  });

  it("clamps the modal inside a usable viewport range", () => {
    expect(getDraggedModalPosition({ x: 0, y: 0 }, { x: 400, y: 300 }, { x: 3000, y: -3000 }, 1280, 720)).toEqual({ x: 480, y: -250 });
  });
});
