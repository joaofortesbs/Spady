import { KanbanCard, KanbanColumn } from '@/lib/types/blindados';

export function inheritColumnProjects(columns: KanbanColumn[], columnIds?: string[]): KanbanColumn[] {
  return columns.map(column => columnIds && !columnIds.includes(column.id) ? column : ({
    ...column,
    cards: column.cards.map(card => (card.projectId ?? null) === (column.projectId ?? null)
      ? card
      : { ...card, projectId: column.projectId ?? null }),
  }));
}

export function normalizeCardField<K extends keyof KanbanCard>(
  key: K,
  value: KanbanCard[K],
): KanbanCard[K] {
  if (key === 'completedAt' && value === null) return undefined as KanbanCard[K];
  return value;
}

export function mergeRequestedCardFields(
  target: KanbanCard,
  source: Partial<KanbanCard>,
  requestedKeys: (keyof KanbanCard)[],
  fallback?: Partial<KanbanCard>,
): KanbanCard {
  const merged = { ...target };
  for (const key of requestedKeys) {
    const sourceValue = source[key];
    const hasSourceValue = Object.prototype.hasOwnProperty.call(source, key) && sourceValue !== undefined;
    const hasFallbackValue = fallback != null && Object.prototype.hasOwnProperty.call(fallback, key);
    const value = hasSourceValue ? sourceValue : fallback?.[key];
    if (hasSourceValue || hasFallbackValue) {
      Object.assign(merged, { [key]: normalizeCardField(key, value as KanbanCard[typeof key]) });
    }
  }
  if (source.updatedAt) merged.updatedAt = source.updatedAt;
  return merged;
}

export function mergeDraftCardStructure(
  latest: KanbanColumn[],
  draft: KanbanColumn[],
): KanbanColumn[] {
  const latestById = new Map(latest.map(column => [column.id, column]));
  const cardsById = new Map<string, KanbanCard>();
  latest.forEach(column => column.cards.forEach(card => cardsById.set(card.id, card)));
  const draftCardIds = new Set(draft.flatMap(column => column.cards.map(card => card.id)));

  const columns = draft.flatMap(draftColumn => {
    const current = latestById.get(draftColumn.id);
    if (!current) {
      // Temporary columns may be created locally before persistence.
      return draftColumn.id.startsWith('temp-') ? [draftColumn] : [];
    }
    const cards = draftColumn.cards.flatMap(draftCard => {
      const currentCard = cardsById.get(draftCard.id);
      return currentCard ? [currentCard] : draftCard.id.startsWith('temp-') ? [draftCard] : [];
    });
    const omittedCurrentCards = current.cards.filter(card => !draftCardIds.has(card.id));
    return [{ ...current, cards: [...cards, ...omittedCurrentCards] }];
  });
  const includedIds = new Set(columns.map(column => column.id));
  return inheritColumnProjects([...columns, ...latest.filter(column => !includedIds.has(column.id))]);
}

export function sameCardStructure(left: KanbanColumn[], right: KanbanColumn[]): boolean {
  return left.length === right.length && left.every((column, index) =>
    column.id === right[index]?.id
    && column.cards.length === right[index]?.cards.length
    && column.cards.every((card, cardIndex) => card.id === right[index]?.cards[cardIndex]?.id));
}

export function restoreColumnOrderByIds(current: KanbanColumn[], confirmedIds: string[]): KanbanColumn[] {
  const currentById = new Map(current.map(column => [column.id, column]));
  const restored = confirmedIds.flatMap(id => {
    const existing = currentById.get(id);
    return existing ? [existing] : [];
  });
  const restoredIds = new Set(restored.map(column => column.id));
  return [...restored, ...current.filter(column => !restoredIds.has(column.id))];
}

export function reorderConfirmedCards(
  columns: KanbanColumn[],
  columnId: string,
  orderedCardIds: string[],
): KanbanColumn[] {
  const column = columns.find(candidate => candidate.id === columnId);
  if (!column) return columns;
  const knownIds = new Set(column.cards.map(card => card.id));
  return applyCardOrder(columns, columnId, orderedCardIds.filter(id => knownIds.has(id)));
}

export function rebaseCardOrder(
  confirmedCardIds: string[],
  requestedCardIds: string[],
  allConfirmedCardOwners: ReadonlyMap<string, string> =
    new Map(confirmedCardIds.map(id => [id, ''] as const)),
): string[] {
  const confirmedIds = new Set(confirmedCardIds);
  const requestedIds = [...new Set(requestedCardIds.filter(id =>
    confirmedIds.has(id) || !allConfirmedCardOwners.has(id)))];
  const requestedConfirmedIds = requestedIds.filter(id => confirmedIds.has(id));
  const requestedSet = new Set(requestedConfirmedIds);
  let requestedIndex = 0;
  const rebased = confirmedCardIds.map(id =>
    requestedSet.has(id) ? requestedConfirmedIds[requestedIndex++] : id);
  const newIds = requestedIds.filter(id => !confirmedIds.has(id));
  return [...rebased, ...newIds];
}

export function removeCardFromStructure(columns: KanbanColumn[], cardId: string): KanbanColumn[] {
  return columns.map(column => ({
    ...column,
    cards: column.cards.filter(card => card.id !== cardId),
  }));
}

export function removeColumnFromStructure(columns: KanbanColumn[], columnId: string): KanbanColumn[] {
  return columns.filter(column => column.id !== columnId);
}

export function replaceCardInStructure(
  columns: KanbanColumn[],
  columnId: string,
  cardId: string,
  card: KanbanCard,
): KanbanColumn[] {
  return columns.map(column => {
    if (column.id !== columnId) return column;
    const existingIndex = column.cards.findIndex(candidate => candidate.id === cardId);
    const cards = [...column.cards];
    if (existingIndex >= 0) cards[existingIndex] = card;
    else cards.push(card);
    return { ...column, cards };
  });
}

export function restoreCardStructure(
  current: KanbanColumn[],
  previous: KanbanColumn[],
  affectedColumnIds: string[],
): KanbanColumn[] {
  const affected = new Set(affectedColumnIds);
  const currentById = new Map(current.map(column => [column.id, column]));
  const latestCards = new Map<string, KanbanCard>();
  current.forEach(column => column.cards.forEach(card => latestCards.set(card.id, card)));

  const previousColumnByCard = new Map<string, string>();
  previous.filter(column => affected.has(column.id)).forEach(column =>
    column.cards.forEach(card => previousColumnByCard.set(card.id, column.id)));
  const assigned = new Set<string>();

  const restored = current.map(column => {
    if (!affected.has(column.id)) return column;
    const previousColumn = previous.find(candidate => candidate.id === column.id);
    const ordered = (previousColumn?.cards ?? []).flatMap(card => {
      const latestCard = latestCards.get(card.id);
      if (!latestCard || assigned.has(card.id)) return [];
      assigned.add(card.id);
      return [latestCard];
    });
    const extras = column.cards.filter(card =>
      !assigned.has(card.id) && previousColumnByCard.get(card.id) === undefined);
    extras.forEach(card => assigned.add(card.id));
    return { ...column, cards: [...ordered, ...extras] };
  });

  // A previous card may now be in a different affected column (for example,
  // a failed transfer). Rehome it according to the structural snapshot, but
  // only when it still exists in current state so deletes are never undone.
  previous.filter(column => affected.has(column.id)).forEach(previousColumn => {
    for (const previousCard of previousColumn.cards) {
      const card = latestCards.get(previousCard.id);
      if (!card) continue;
      const destination = currentById.get(previousColumn.id);
      if (!destination) continue;
      const destinationState = restored.find(column => column.id === previousColumn.id);
      if (!destinationState || destinationState.cards.some(candidate => candidate.id === card.id)) continue;
      destinationState.cards.push(card);
      assigned.add(card.id);
    }
  });

  return inheritColumnProjects(restored, affectedColumnIds);
}

export function applyCardOrder(
  columns: KanbanColumn[],
  columnId: string,
  orderedCardIds: string[],
): KanbanColumn[] {
  const column = columns.find(candidate => candidate.id === columnId);
  if (!column) return columns;
  const cardsById = new Map(column.cards.map(card => [card.id, card] as const));
  const ordered = orderedCardIds.flatMap(id => {
    const card = cardsById.get(id);
    return card ? [card] : [];
  });
  const included = new Set(ordered.map(card => card.id));
  return columns.map(item => item.id === columnId
    ? { ...item, cards: [...ordered, ...item.cards.filter(card => !included.has(card.id))] }
    : item);
}

export function moveCardInColumns(
  columns: KanbanColumn[],
  cardId: string,
  sourceColumnId: string,
  targetColumnId: string,
  targetIndex: number,
): KanbanColumn[] {
  const targetColumn = columns.find(column => column.id === targetColumnId);
  if (sourceColumnId === targetColumnId && targetColumn?.cards.some(card => card.id === cardId)) {
    const remainingIds = targetColumn.cards.map(card => card.id).filter(id => id !== cardId);
    return inheritColumnProjects(applyCardOrder(columns, targetColumnId, [
      ...remainingIds.slice(0, targetIndex),
      cardId,
      ...remainingIds.slice(targetIndex),
    ]), [targetColumnId]);
  }
  const card = columns.flatMap(column => column.cards).find(candidate => candidate.id === cardId);
  if (!card) return columns;
  const withoutCard = columns.map(column => ({
    ...column,
    cards: column.cards.filter(candidate => candidate.id !== cardId),
  }));
  const target = withoutCard.find(column => column.id === targetColumnId);
  if (!target) return columns;
  const cards = [...target.cards];
  const index = Math.max(0, Math.min(targetIndex, cards.length));
  cards.splice(index, 0, card);
  return inheritColumnProjects(withoutCard.map(column =>
    column.id === targetColumnId ? { ...column, cards } : column),
  [sourceColumnId, targetColumnId]);
}