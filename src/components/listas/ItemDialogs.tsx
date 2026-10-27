"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prepareLocalImage } from "@/lib/listas/images";
import { DESCRIPTION_LIMIT, MAX_IMAGES, TITLE_LIMIT, type ItemDraft, type ListImage, type ListItem } from "@/lib/listas/model";
import { AlertCircle, ImagePlus, LoaderCircle, Pencil, Plus, Trash2 } from "lucide-react";

type Mode = "view" | "edit" | "create" | null;

export function ItemDialogs({ mode, onModeChange, item, stale, saving, listName, onEdit, onSave, onReturnFocus }: {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  item: ListItem | null;
  stale: boolean;
  saving: boolean;
  listName: string;
  onEdit: () => void;
  onSave: (draft: ItemDraft, itemId?: string) => Promise<void>;
  onReturnFocus: () => void;
}) {
  const latestMode = useRef(mode);
  latestMode.current = mode;
  const returnFocus = (event: Event) => {
    event.preventDefault();
    if (latestMode.current === null) onReturnFocus();
  };
  return (
    <>
      <ItemViewer mode={mode} onModeChange={onModeChange} item={item} stale={stale} onEdit={onEdit} onReturnFocus={returnFocus} />
      <ItemEditor mode={mode} onModeChange={onModeChange} item={item} stale={stale} saving={saving} listName={listName} onSave={onSave} onReturnFocus={returnFocus} />
    </>
  );
}

function ItemViewer({ mode, onModeChange, item, stale, onEdit, onReturnFocus }: {
  mode: Mode; onModeChange: (mode: Mode) => void; item: ListItem | null; stale: boolean; onEdit: () => void; onReturnFocus: (event: Event) => void;
}) {
  const [activeImage, setActiveImage] = useState(0);
  useEffect(() => setActiveImage(0), [item?.id, mode]);
  if (mode !== "view") return null;
  const selected = item?.images[activeImage] ?? item?.images[0];
  return (
    <Dialog open={mode === "view"} onOpenChange={open => { if (!open) onModeChange(null); }}>
      <DialogContent className="listas-dialog listas-view-dialog" onCloseAutoFocus={onReturnFocus}>
        <DialogHeader className="listas-dialog-header">
          <span className="listas-dialog-eyebrow">INSPEÇÃO DO ITEM</span>
          <DialogTitle className="listas-dialog-title">{item?.title ?? "Item"}</DialogTitle>
          <DialogDescription className="listas-dialog-subtitle">Na lista selecionada</DialogDescription>
        </DialogHeader>
        {stale && <div className="listas-dialog-warning" role="alert"><AlertCircle size={16} />Este item mudou em outra aba. Feche e abra novamente para confirmar a versão atual antes de editar.</div>}
        <div className="listas-view-body">
          {selected ? (
            <div className="listas-view-gallery">
              <div className="listas-view-main"><img src={selected.dataUrl} alt={selected.name} /></div>
              {item && item.images.length > 1 && <div className="listas-view-thumbs" aria-label="Imagens do item">
                {item.images.map((image, index) => <button key={image.id} type="button" aria-label={`Ver imagem ${index + 1}`} aria-pressed={activeImage === index} onClick={() => setActiveImage(index)}><img src={image.dataUrl} alt="" /></button>)}
              </div>}
            </div>
          ) : <div className="listas-view-no-image"><ImagePlus size={27} /><span>Este item ainda não tem imagem.</span></div>}
          {item?.description ? <p className="listas-view-description">{item.description}</p> : <p className="listas-view-description is-empty">Sem descrição.</p>}
          <div className="listas-dialog-footer">
            <span className="listas-image-count">{item?.images.length ?? 0} de {MAX_IMAGES} imagens</span>
            <Button className="listas-primary" onClick={onEdit} disabled={stale}><Pencil size={15} /> Editar item</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ItemEditor({ mode, onModeChange, item, stale, saving, listName, onSave, onReturnFocus }: {
  mode: Mode; onModeChange: (mode: Mode) => void; item: ListItem | null; stale: boolean; saving: boolean; listName: string; onSave: (draft: ItemDraft, itemId?: string) => Promise<void>; onReturnFocus: (event: Event) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [images, setImages] = useState<ListImage[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [pending, setPending] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const pendingRef = useRef(false);
  const initialRef = useRef("");
  const isOpen = mode === "edit" || mode === "create";
  const isCreate = mode === "create";

  useEffect(() => () => { generation.current += 1; }, []);

  useEffect(() => {
    if (isOpen) {
      generation.current += 1;
      const initial = item && !isCreate ? { title: item.title, description: item.description, images: item.images } : { title: "", description: "", images: [] as ListImage[] };
      setTitle(initial.title);
      setDescription(initial.description);
      setImages(initial.images);
      setActiveIndex(0);
      setError("");
      setPending(false);
      pendingRef.current = false;
      setDirty(false);
      initialRef.current = JSON.stringify(initial);
    } else {
      generation.current += 1;
    }
  }, [isOpen, item?.id, isCreate]);

  useEffect(() => {
    setDirty(JSON.stringify({ title, description, images }) !== initialRef.current);
  }, [title, description, images]);

  const requestClose = () => {
    if (pending || saving) return;
    if (dirty) setDiscardOpen(true);
    else onModeChange(null);
  };
  const addFiles = async (fileList: FileList | null) => {
    if (!fileList || pendingRef.current) return;
    const batch = Array.from(fileList);
    const capacity = MAX_IMAGES - images.length;
    if (capacity === 0) { setError("O limite de cinco imagens foi atingido."); return; }
    if (batch.length > capacity) { setError(`Você pode adicionar mais ${capacity} ${capacity === 1 ? "imagem" : "imagens"} nesta seleção.`); return; }
    const chosen = batch.slice(0, capacity);
    if (!chosen.length) return;
    const token = generation.current;
    pendingRef.current = true;
    setPending(true);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
    try {
      const prepared = await Promise.all(chosen.map(file => prepareLocalImage(file)));
      if (generation.current !== token) return;
      setImages(current => [...current, ...prepared].slice(0, MAX_IMAGES));
      setActiveIndex(current => current < images.length ? current : images.length);
    } catch (err) {
      if (generation.current === token) setError(err instanceof Error ? err.message : "Não foi possível preparar esta imagem.");
    } finally {
      if (generation.current === token) {
        pendingRef.current = false;
        setPending(false);
      }
    }
  };
  const removeImage = (index: number) => {
    setImages(current => current.filter((_, currentIndex) => currentIndex !== index));
    setActiveIndex(current => {
      if (current > index) return current - 1;
      if (current === index) return Math.max(0, Math.min(index, images.length - 2));
      return current;
    });
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || pendingRef.current) return;
    if (!title.trim()) { setError("Preencha o título do item."); return; }
    if (stale && !isCreate) { setError("Este item mudou em outra aba. Feche e abra novamente para editar a versão atual."); return; }
    setError("");
    try { await onSave({ title, description, images }, isCreate ? undefined : item?.id); }
    catch (err) { setError(err instanceof Error ? err.message : "Não foi possível salvar. Seu formulário continua aberto."); }
  };
  const activeImage = images[activeIndex];
  if (!isOpen) return null;

  return (
    <>
      <Dialog open={isOpen} onOpenChange={open => { if (!open) requestClose(); }}>
        <DialogContent className="listas-dialog listas-editor-dialog" onCloseAutoFocus={onReturnFocus} onEscapeKeyDown={event => { event.preventDefault(); requestClose(); }}>
          <DialogHeader className="listas-dialog-header">
            <DialogTitle className="listas-dialog-title">{isCreate ? "Adicionar item" : "Editar item"}</DialogTitle>
            <DialogDescription className="listas-dialog-subtitle">Em {listName || "sua lista"} · até cinco imagens, armazenadas neste navegador.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="listas-editor-form">
            <div className="listas-editor-fields">
              <label className="listas-field">Título
                <input value={title} maxLength={TITLE_LIMIT} autoFocus aria-required="true" onChange={event => setTitle(event.target.value)} placeholder="Dê um nome ao item" />
              </label>
              <label className="listas-field">Descrição
                <textarea value={description} maxLength={DESCRIPTION_LIMIT} onChange={event => setDescription(event.target.value)} placeholder="Anote o que faz este item valer a pena." rows={4} />
              </label>
            </div>
            <div className="listas-gallery-editor">
              <div className={`listas-editor-main${!activeImage ? " is-empty" : ""}`}>
                {activeImage ? <img src={activeImage.dataUrl} alt={activeImage.name} /> : (
                  <button type="button" className="listas-image-empty" onClick={() => inputRef.current?.click()} disabled={pending || saving}>
                    {pending ? <LoaderCircle size={25} className="listas-spin" /> : <ImagePlus size={26} />}
                    <strong>{pending ? "Preparando imagem" : "Escolha a imagem principal"}</strong>
                    <small>JPG, PNG ou WebP · processamento local</small>
                  </button>
                )}
              </div>
              <div className="listas-gallery-side">
                <div className="listas-gallery-thumb-list">
                  {images.map((image, index) => <div className={`listas-gallery-thumb${activeIndex === index ? " is-active" : ""}`} key={image.id}>
                    <button type="button" className="listas-gallery-select" aria-label={`Selecionar imagem ${index + 1}`} aria-pressed={activeIndex === index} onClick={() => setActiveIndex(index)}><img src={image.dataUrl} alt="" /></button>
                    <button type="button" className="listas-image-remove" aria-label={`Remover ${image.name}`} onClick={() => removeImage(index)} disabled={pending || saving}><Trash2 size={12} /></button>
                  </div>)}
                  {images.length < MAX_IMAGES && <button type="button" className="listas-image-add" onClick={() => inputRef.current?.click()} disabled={pending || saving} aria-label={`Adicionar imagem, ${MAX_IMAGES - images.length} vagas disponíveis`}>
                    {pending ? <LoaderCircle size={16} className="listas-spin" /> : <Plus size={16} />}
                  </button>}
                </div>
                <span className="listas-gallery-limit">{images.length} / {MAX_IMAGES} IMAGENS{images.length === MAX_IMAGES ? " · LIMITE ATINGIDO" : ""}</span>
                <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={event => void addFiles(event.target.files)} />
              </div>
            </div>
            {error && <div className="listas-editor-error" role="alert"><AlertCircle size={15} />{error}</div>}
            {stale && !isCreate && <div className="listas-dialog-warning" role="alert"><AlertCircle size={16} />O item mudou em outra aba. Recarregue a lista e reabra este item antes de salvar.</div>}
            <div className="listas-editor-footer">
              <span className="listas-editor-local">As alterações só ficam salvas após confirmar.</span>
              <div className="listas-editor-buttons">
                <Button type="button" variant="outline" className="listas-cancel" onClick={requestClose} disabled={saving || pending}>Cancelar</Button>
                <Button type="submit" className="listas-primary" disabled={saving || pending || !title.trim() || (stale && !isCreate)}>
                  {saving || pending ? <LoaderCircle size={15} className="listas-spin" /> : null}
                  {saving ? "Salvando" : pending ? "Preparando" : "Salvar item"}
                </Button>
              </div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <AlertDialogContent className="listas-discard-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>O que você alterou neste formulário ainda não foi salvo.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="listas-cancel">Continuar editando</AlertDialogCancel>
            <AlertDialogAction className="listas-discard-action" onClick={() => { setDiscardOpen(false); onModeChange(null); }}>Descartar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
