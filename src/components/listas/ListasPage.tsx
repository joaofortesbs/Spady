"use client";

import "./listas.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BookmarkPlus, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useListasData } from "@/hooks/useListasData";
import type { ItemDraft, ListItem } from "@/lib/listas/model";
import { ListCarousel } from "./ListCarousel";
import { ListItemCard } from "./ListItemCard";
import { ItemDialogs } from "./ItemDialogs";
import { NewListForm } from "./NewListForm";
import { NewListDialog } from "./NewListDialog";
import { useListOrder } from "./useListOrder";

export function ListasPage({ userId }: { userId: string }) {
  const { lists, loaded, error, saving, createList, saveItem, reorderItems, reload } = useListasData(userId);
  const [activeListId, setActiveListId] = useState("");
  const [newListOpen, setNewListOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"view" | "edit" | "create" | null>(null);
  const [selectedItem, setSelectedItem] = useState<ListItem | null>(null);
  const [activeListAtOpen, setActiveListAtOpen] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const itemOpener = useRef<HTMLElement | null>(null);
  const listOpener = useRef<HTMLElement | null>(null);
  const activeList = useMemo(() => lists.find(list => list.id === activeListId) ?? lists[0] ?? null, [lists, activeListId]);
  const items = activeList?.items ?? [];

  useEffect(() => {
    if (!lists.length) {
      setActiveListId("");
      return;
    }
    if (!lists.some(list => list.id === activeListId)) setActiveListId(lists[0].id);
  }, [lists, activeListId]);

  useEffect(() => {
    setDialogMode(null);
    setSelectedItem(null);
    setNewListOpen(false);
  }, [userId]);

  const openCreate = () => {
    itemOpener.current = document.activeElement as HTMLElement;
    setActiveListAtOpen(activeList?.id ?? "");
    setSelectedItem(null);
    setDialogMode("create");
  };
  const openItem = (item: ListItem) => {
    itemOpener.current = document.activeElement as HTMLElement;
    setActiveListAtOpen(activeList?.id ?? "");
    setSelectedItem(item);
    setDialogMode("view");
  };
  const openEdit = () => setDialogMode("edit");

  const currentItem = selectedItem ? activeList?.items.find(item => item.id === selectedItem.id) ?? null : null;
  const isStale = Boolean(selectedItem && activeList && (
    activeList.id !== activeListAtOpen ||
    !currentItem ||
    JSON.stringify(currentItem) !== JSON.stringify(selectedItem)
  ));

  const handleCreateList = async (name: string, description: string) => {
    const id = await createList(name, description);
    setActiveListId(id);
    setNewListOpen(false);
  };
  const handleSaveItem = async (draft: ItemDraft, itemId?: string) => {
    if (!activeList || activeList.id !== activeListAtOpen) throw new Error("A lista selecionada mudou. Reabra o formulário para continuar.");
    if (itemId && isStale) throw new Error("Este item mudou desde que você o abriu. Feche e abra novamente antes de salvar.");
    await saveItem(activeList.id, draft, itemId);
    setDialogMode(null);
    setSelectedItem(null);
  };

  const { sensors, onDragEnd, onDragStart, onDragCancel, activeDragId } = useListOrder({
    listId: activeList?.id ?? "",
    items,
    reorderItems,
    onError: setNotice,
  });

  const moveItem = async (index: number, direction: -1 | 1) => {
    if (!activeList || saving) return;
    const next = index + direction;
    if (next < 0 || next >= items.length) return;
    const ids = items.map(item => item.id);
    [ids[index], ids[next]] = [ids[next], ids[index]];
    try {
      await reorderItems(activeList.id, ids);
      setNotice(null);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Não foi possível salvar a nova ordem.");
    }
  };

  if (!userId) {
    return <div className="listas-page"><div className="listas-empty"><ShieldAlert /><h1>Entre na sua conta</h1><p>As listas ficam separadas por conta e não são salvas em um espaço anônimo.</p></div></div>;
  }

  return (
    <div className="listas-page" role="region" aria-label="Listas pessoais">
      <header className="listas-heading">
        <div>
          <p className="listas-kicker">SEU ESPAÇO PESSOAL <span>／</span> ORGANIZAÇÃO</p>
          <h1>Listas</h1>
          <p className="listas-lede">Guarde o que importa. Escolha a ordem.</p>
        </div>
        {lists.length > 0 && (
          <Button className="listas-primary" onClick={() => { listOpener.current = document.activeElement as HTMLElement; setNewListOpen(true); }}>
            <Plus size={16} /> Nova lista
          </Button>
        )}
      </header>

      <aside className="listas-local-note">
        <span className="listas-note-mark"><ShieldAlert size={15} /></span>
        <p><strong>Somente neste navegador.</strong> Suas listas não sincronizam entre dispositivos ou navegadores e podem ser perdidas ao limpar os dados deste site. O espaço disponível depende do navegador.</p>
      </aside>

      {error && (
        <div className="listas-alert" role="alert">
          <AlertCircle size={17} />
          <p>{error}</p>
          <Button variant="outline" size="sm" onClick={reload}><RefreshCw size={14} /> Atualizar listas</Button>
        </div>
      )}
      {notice && <div className="listas-inline-error" role="status">{notice}</div>}

      {!loaded ? (
        <section className="listas-skeleton" aria-label="Carregando listas">
          <div className="listas-skeleton-row"><i /><i /><i /></div>
          <div className="listas-skeleton-large" />
        </section>
      ) : lists.length === 0 && error ? (
        <section className="listas-first listas-recovery">
          <div className="listas-first-mark"><AlertCircle size={24} /></div>
          <p className="listas-kicker">ARMAZENAMENTO NÃO DISPONÍVEL</p>
          <h2>Suas listas continuam preservadas.</h2>
          <p className="listas-first-copy">Não foi possível ler os dados locais. Atualize para tentar novamente; não vamos substituir o conteúdo existente.</p>
          <Button className="listas-secondary" onClick={reload}><RefreshCw size={15} /> Tentar novamente</Button>
        </section>
      ) : lists.length === 0 ? (
        <section className="listas-first">
          <div className="listas-first-mark"><BookmarkPlus size={25} /></div>
          <p className="listas-kicker">COMECE POR UMA IDEIA</p>
          <h2>Uma lista para o que merece lugar.</h2>
          <p className="listas-first-copy">Pode ser uma leitura, um roteiro ou qualquer coleção que você queira manter em uma ordem própria.</p>
          <NewListForm onCreate={handleCreateList} saving={saving} />
        </section>
      ) : (
        <>
          <section className="listas-collections" aria-label="Suas listas">
            <div className="listas-section-label"><span>COLEÇÕES</span><span className="listas-count">{String(lists.length).padStart(2, "0")}</span></div>
            <ListCarousel lists={lists} activeListId={activeList?.id ?? ""} onSelect={setActiveListId} />
          </section>

          {activeList && (
            <section className="listas-workspace" aria-labelledby="active-list-title">
              <div className="listas-list-heading">
                <div className="listas-list-title-wrap">
                  <span className="listas-list-index">{String(lists.findIndex(list => list.id === activeList.id) + 1).padStart(2, "0")}</span>
                  <div>
                    <h2 id="active-list-title">{activeList.name}</h2>
                    {activeList.description && <p>{activeList.description}</p>}
                  </div>
                </div>
                <Button className="listas-secondary" onClick={openCreate} disabled={saving}>
                  <Plus size={16} /> Adicionar item
                </Button>
              </div>
              {activeList.items.length === 0 ? (
                <button className="listas-item-empty" type="button" onClick={openCreate}>
                  <span className="listas-empty-plus"><Plus size={20} /></span>
                  <span><strong>A lista começa aqui.</strong><small>Adicione o primeiro item e organize o que vem antes.</small></span>
                  <span className="listas-empty-action">Adicionar item <span aria-hidden="true">→</span></span>
                </button>
              ) : (
                <div className="listas-items-frame">
                  <div className="listas-items-caption"><span>ORDEM DEFINIDA POR VOCÊ</span><span>{activeList.items.length} {activeList.items.length === 1 ? "item" : "itens"}</span></div>
                  <div className="listas-items" role="list" aria-label={`Itens em ${activeList.name}`}>
                    <ListItemCard
                      items={activeList.items}
                      sensors={sensors}
                      onDragEnd={onDragEnd}
                      onDragStart={onDragStart}
                      onDragCancel={onDragCancel}
                      activeDragId={activeDragId}
                      onOpen={openItem}
                      onMove={moveItem}
                      saving={saving}
                    />
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}

        <NewListDialog
        open={newListOpen}
        onOpenChange={setNewListOpen}
        onCreate={handleCreateList}
        saving={saving}
        onReturnFocus={() => listOpener.current?.focus()}
      />
      <ItemDialogs
        key={userId}
        mode={dialogMode}
        onModeChange={setDialogMode}
        item={currentItem}
        stale={isStale}
        saving={saving}
        listName={activeList?.name ?? ""}
        onEdit={openEdit}
        onSave={handleSaveItem}
        onReturnFocus={() => itemOpener.current?.focus()}
      />
    </div>
  );
}
