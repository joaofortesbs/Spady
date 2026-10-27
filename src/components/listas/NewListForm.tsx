"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { LoaderCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DESCRIPTION_LIMIT, TITLE_LIMIT } from "@/lib/listas/model";

export function NewListForm({ onCreate, saving, onDirtyChange }: { onCreate: (name: string, description: string) => Promise<void>; saving: boolean; onDirtyChange?: (dirty: boolean) => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const submitting = useRef(false);
  useEffect(() => { onDirtyChange?.(Boolean(name || description)); }, [name, description, onDirtyChange]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving || submitting.current) return;
    if (!name.trim()) { setError("Escreva um nome para a lista."); return; }
    setError("");
    submitting.current = true;
    try { await onCreate(name, description); setName(""); setDescription(""); } catch (err) { setError(err instanceof Error ? err.message : "Não foi possível criar a lista."); }
    finally { submitting.current = false; }
  };
  return (
    <form className="listas-list-form" onSubmit={submit}>
      <label>Nome da lista<input value={name} maxLength={TITLE_LIMIT} onChange={event => setName(event.target.value)} placeholder="Por exemplo: lugares para conhecer" autoComplete="off" /></label>
      <label>Descrição <span>opcional</span><textarea value={description} maxLength={DESCRIPTION_LIMIT} onChange={event => setDescription(event.target.value)} placeholder="O que você quer reunir nesta lista?" rows={2} /></label>
      {error && <p className="listas-form-error" role="alert">{error}</p>}
      <Button className="listas-primary" type="submit" disabled={saving || !name.trim()}>{saving ? <LoaderCircle size={15} className="listas-spin" /> : <Plus size={15} />} Criar lista</Button>
    </form>
  );
}
