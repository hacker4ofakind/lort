'use client';

import type { ReactNode } from 'react';
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

/** Rows reordered by dragging the grip, or with Space and the arrow keys on it. */
export function SortableRows<T extends { id: string }>({
  items,
  label,
  onReorder,
  children,
}: {
  items: T[];
  label: (item: T) => string;
  onReorder: (items: T[]) => void;
  children: (item: T, grip: ReactNode, index: number) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const end = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    onReorder(arrayMove(items, from, to));
  };
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={end}>
      <SortableContext items={items.map((i) => i.id)} strategy={verticalListSortingStrategy}>
        {items.map((item, i) => (
          <Row key={item.id} id={item.id} label={label(item)}>
            {(grip) => children(item, grip, i)}
          </Row>
        ))}
      </SortableContext>
    </DndContext>
  );
}

function Row({ id, label, children }: { id: string; label: string; children: (grip: ReactNode) => ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const grip = (
    <button
      ref={setActivatorNodeRef}
      type="button"
      className="grip"
      aria-label={`Move ${label}`}
      {...attributes}
      {...listeners}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        {[6, 12, 18].flatMap((y) => [9, 15].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.6" />))}
      </svg>
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        position: 'relative',
        zIndex: isDragging ? 2 : undefined,
        background: isDragging ? 'var(--surface)' : undefined,
        boxShadow: isDragging ? 'var(--shadow-card-float)' : undefined,
        borderRadius: isDragging ? 12 : undefined,
      }}
    >
      {children(grip)}
    </div>
  );
}

/** The order values to save after a reorder: only rows whose position changed. */
export function orderChanges<T extends { id: string; order?: number }>(items: T[]): { id: string; order: number }[] {
  return items.flatMap((item, i) => (item.order === i ? [] : [{ id: item.id, order: i }]));
}
