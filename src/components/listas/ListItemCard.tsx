"use client";

import { DndContext, DragOverlay, closestCenter, type DragCancelEvent, type DragEndEvent, type DragStartEvent, type SensorDescriptor, type SensorOptions } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useRef } from "react";
import { GripVertical, Image as ImageIcon, ArrowDown, ArrowUp } from "lucide-react";
import type { ListItem } from "@/lib/listas/model";

export function ListItemCard({ items, sensors, onDragEnd, onDragStart, onDragCancel, activeDragId, onOpen, onMove, saving }: {
  items: ListItem[];
  sensors: SensorDescriptor<SensorOptions>[];
  onDragEnd: (event: DragEndEvent) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragCancel: (event: DragCancelEvent) => void;
  activeDragId: string | null;
  onOpen: (item: ListItem) => void;
  onMove: (index: number, direction: -1 | 1) => void;
  saving: boolean;
}) {
  const active = items.find(item => item.id === activeDragId);
  const suppressClickUntil = useRef(0);
  return (
    <div onClickCapture={event => {
      if (activeDragId || Date.now() < suppressClickUntil.current) {
        event.preventDefault(); event.stopPropagation();
      }
    }}>
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={event => {
      suppressClickUntil.current = Number.POSITIVE_INFINITY;
      onDragStart(event);
    }} onDragEnd={event => {
      suppressClickUntil.current = Date.now() + 300;
      onDragEnd(event);
    }} onDragCancel={event => {
      suppressClickUntil.current = Date.now() + 300;
      onDragCancel(event);
    }}>
      <SortableContext items={items.map(item => item.id)} strategy={verticalListSortingStrategy}>
        {items.map((item, index) => <SortableItem key={item.id} item={item} index={index} total={items.length} onOpen={onOpen} onMove={onMove} saving={saving} />)}
      </SortableContext>
      <DragOverlay dropAnimation={null}>{active ? <div className="listas-item-card listas-drag-preview"><CardContents item={active} index={items.findIndex(item => item.id === active.id)} /></div> : null}</DragOverlay>
    </DndContext>
    </div>
  );
}

function SortableItem({ item, index, total, onOpen, onMove, saving }: {
  item: ListItem; index: number; total: number; onOpen: (item: ListItem) => void; onMove: (index: number, direction: -1 | 1) => void; saving: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging, isOver } = useSortable({ id: item.id, disabled: saving });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <article
      ref={setNodeRef}
      style={style}
      className={`listas-item-card${isDragging ? " is-dragging" : ""}${isOver && !isDragging ? " is-over" : ""}`}
      role="listitem"
      onMouseDown={event => listeners?.onMouseDown?.(event)}
      onTouchStart={event => listeners?.onTouchStart?.(event)}
      onClick={event => { if (!(event.target as HTMLElement).closest("button")) onOpen(item); }}
    >
      <button
        type="button"
        className="listas-drag-handle"
        aria-label={`Reordenar ${item.title}. Use as setas para mover entre itens.`}
        {...attributes}
        onKeyDown={event => listeners?.onKeyDown?.(event)}
        disabled={saving}
      ><GripVertical size={17} /></button>
      <CardContents item={item} index={index} onOpen={onOpen} />
      <div className="listas-item-actions" aria-label={`Posição ${index + 1}`} onMouseDown={event => event.stopPropagation()} onTouchStart={event => event.stopPropagation()}>
        <button type="button" aria-label={`Mover ${item.title} para cima`} disabled={saving || index === 0} onClick={() => onMove(index, -1)}><ArrowUp size={15} /></button>
        <button type="button" aria-label={`Mover ${item.title} para baixo`} disabled={saving || index === total - 1} onClick={() => onMove(index, 1)}><ArrowDown size={15} /></button>
      </div>
    </article>
  );
}

function CardContents({ item, index, onOpen }: {
  item: ListItem; index: number; onOpen?: (item: ListItem) => void;
}) {
  const cover = item.images[0];
  return (
    <>
      <div className="listas-thumb-wrap" aria-hidden="true">
        {cover ? <img className="listas-thumb" src={cover.dataUrl} alt="" /> : <span className="listas-thumb-placeholder"><ImageIcon size={21} /></span>}
        <span className="listas-order-badge">{index + 1}</span>
      </div>
      {onOpen ? (
        <button type="button" className="listas-item-open" onClick={() => onOpen(item)}>
          <strong>{item.title}</strong>
          <span>{item.description || "Sem descrição"}</span>
        </button>
      ) : <div className="listas-item-open"><strong>{item.title}</strong><span>{item.description || "Sem descrição"}</span></div>}
    </>
  );
}
