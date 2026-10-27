"use client";

import { useState } from "react";
import { KeyboardSensor, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { ListItem } from "@/lib/listas/model";

export function useListOrder({ listId, items, reorderItems, onError }: {
  listId: string;
  items: ListItem[];
  reorderItems: (listId: string, ids: string[]) => Promise<void>;
  onError: (message: string) => void;
}) {
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 260, tolerance: 9 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const onDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = items.map(item => item.id);
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from < 0 || to < 0) return;
    try {
      await reorderItems(listId, arrayMove(ids, from, to));
      onError("");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Não foi possível salvar a nova ordem.");
    }
  };
  const onDragStart = (event: DragStartEvent) => setActiveDragId(String(event.active.id));
  const onDragCancel = () => setActiveDragId(null);
  return { sensors, activeDragId, onDragEnd, onDragStart, onDragCancel };
}
