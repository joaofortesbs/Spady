"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NewListForm } from "./NewListForm";
import { useState } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

export function NewListDialog({ open, onOpenChange, onCreate, saving, onReturnFocus }: {
  open: boolean; onOpenChange: (open: boolean) => void; onCreate: (name: string, description: string) => Promise<void>; saving: boolean; onReturnFocus: () => void;
}) {
  const [dirty, setDirty] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const requestClose = () => {
    if (saving) return;
    if (dirty) setDiscardOpen(true);
    else onOpenChange(false);
  };
  return (
    <>
    <Dialog open={open} onOpenChange={next => next ? onOpenChange(true) : requestClose()}>
      <DialogContent className="listas-dialog listas-new-list-dialog" onCloseAutoFocus={event => { event.preventDefault(); onReturnFocus(); }} onEscapeKeyDown={event => { event.preventDefault(); requestClose(); }}>
        <DialogHeader className="listas-dialog-header">
          <span className="listas-dialog-eyebrow">OUTRA IDEIA, OUTRO LUGAR</span>
          <DialogTitle className="listas-dialog-title">Nova lista</DialogTitle>
          <DialogDescription className="listas-dialog-subtitle">Uma coleção para organizar do seu jeito.</DialogDescription>
        </DialogHeader>
        <NewListForm onCreate={onCreate} saving={saving} onDirtyChange={setDirty} />
      </DialogContent>
    </Dialog>
    <AlertDialog open={discardOpen} onOpenChange={setDiscardOpen}>
      <AlertDialogContent className="listas-discard-dialog">
        <AlertDialogHeader><AlertDialogTitle>Descartar nova lista?</AlertDialogTitle><AlertDialogDescription>O nome e a descrição ainda não foram salvos.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Continuar editando</AlertDialogCancel>
          <AlertDialogAction onClick={() => { setDiscardOpen(false); setDirty(false); onOpenChange(false); }}>Descartar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
