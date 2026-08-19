export interface ModalPosition {
  x: number;
  y: number;
}

export function clampModalPosition(position: ModalPosition, viewportWidth: number, viewportHeight: number): ModalPosition {
  const maxX = Math.max(140, viewportWidth / 2 - 160);
  const maxY = Math.max(120, viewportHeight / 2 - 110);

  return {
    x: Math.min(Math.max(position.x, -maxX), maxX),
    y: Math.min(Math.max(position.y, -maxY), maxY),
  };
}

export function getDraggedModalPosition(
  origin: ModalPosition,
  start: ModalPosition,
  current: ModalPosition,
  viewportWidth: number,
  viewportHeight: number,
): ModalPosition {
  return clampModalPosition(
    {
      x: origin.x + current.x - start.x,
      y: origin.y + current.y - start.y,
    },
    viewportWidth,
    viewportHeight,
  );
}
