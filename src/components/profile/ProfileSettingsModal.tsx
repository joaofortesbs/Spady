"use client";

import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Bell, Check, Palette, Settings2, UserRound, X } from "lucide-react";
import type { User } from "@supabase/supabase-js";

interface ProfileSettingsModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSaveProfile: (displayName: string) => Promise<void>;
}

type ProfileSection = "profile" | "appearance" | "notifications";

export function ProfileSettingsModal({ isOpen, user, onClose, onSaveProfile }: ProfileSettingsModalProps) {
  const [activeSection, setActiveSection] = useState<ProfileSection>("profile");
  const [saved, setSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [reducedMotion, setReducedMotion] = useState(false);
  const [compactMode, setCompactMode] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [dailyBriefEnabled, setDailyBriefEnabled] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    setActiveSection("profile");
    setSaved(false);
    setDisplayName(user?.user_metadata?.nickname || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "");
    setReducedMotion(localStorage.getItem("spady-reduced-motion") === "true");
    setCompactMode(localStorage.getItem("spady-compact-mode") === "true");
    setNotificationsEnabled(localStorage.getItem("spady-notifications") !== "false");
    setDailyBriefEnabled(localStorage.getItem("spady-daily-brief") !== "false");
  }, [isOpen, user]);

  const name = user?.user_metadata?.nickname || user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Usuário Spady";
  const email = user?.email || "";
  const avatarUrl = user?.user_metadata?.avatar_url as string | undefined;
  const initials = name.slice(0, 1).toUpperCase();

  const sections: Array<{ id: ProfileSection; label: string; description: string; icon: typeof UserRound }> = [
    { id: "profile", label: "Perfil", description: "Sua identidade no Spady", icon: UserRound },
    { id: "appearance", label: "Aparência", description: "Tema e preferências visuais", icon: Palette },
    { id: "notifications", label: "Notificações", description: "Como você recebe avisos", icon: Bell },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
          <motion.section role="dialog" aria-modal="true" aria-labelledby="profile-settings-title" className="flex max-h-[min(720px,90vh)] w-full max-w-3xl overflow-hidden rounded-3xl border border-cyan-300/15 bg-[#081020]/95 shadow-[0_24px_100px_rgba(0,0,0,0.55)] backdrop-blur-2xl" initial={{ opacity: 0, scale: 0.96, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 14 }} transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }} onKeyDown={(event) => { if (event.key === "Escape") onClose(); }} tabIndex={-1}>
            <aside className="hidden w-56 shrink-0 border-r border-white/10 bg-white/[0.025] p-4 sm:block">
              <div className="mb-7 px-2">
                <div className="mb-1 flex items-center gap-2 text-cyan-200"><Settings2 className="h-4 w-4" /><span className="text-[10px] font-semibold uppercase tracking-[0.22em]">Configurações</span></div>
                <p className="text-xs leading-5 text-white/35">Personalize sua experiência de execução.</p>
              </div>
              <nav className="space-y-1" aria-label="Seções de configurações">
                {sections.map(({ id, label, description, icon: Icon }) => (
                  <button key={id} type="button" onClick={() => setActiveSection(id)} className={`w-full rounded-xl p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 ${activeSection === id ? "bg-cyan-300/10 text-cyan-100" : "text-white/45 hover:bg-white/[0.05] hover:text-white"}`}>
                    <span className="flex items-center gap-3"><Icon className="h-4 w-4 shrink-0" /><span><span className="block text-sm font-medium">{label}</span><span className="mt-0.5 block text-[10px] text-current/50">{description}</span></span></span>
                  </button>
                ))}
              </nav>
            </aside>

            <div className="min-w-0 flex-1 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4 sm:px-7">
                <div><h2 id="profile-settings-title" className="text-lg font-semibold text-white">{sections.find((section) => section.id === activeSection)?.label}</h2><p className="mt-1 text-xs text-white/35">Configurações da sua conta Spady</p></div>
                <button type="button" onClick={onClose} className="rounded-xl p-2 text-white/40 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70" aria-label="Fechar configurações"><X className="h-5 w-5" /></button>
              </div>

              <div className="p-5 sm:p-7">
                {activeSection === "profile" && (
                  <div className="space-y-7">
                    <div className="flex flex-col gap-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.035] p-5 sm:flex-row sm:items-center">
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-300/40 bg-gradient-to-br from-cyan-300 to-violet-500 text-xl font-semibold text-[#07101f]">{avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}</span>
                      <div><p className="text-base font-semibold text-white">{name}</p><p className="mt-1 text-sm text-white/45">{email}</p><p className="mt-2 text-xs text-cyan-200/70">Sua sessão está ativa e sincronizada.</p></div>
                    </div>
                    <div className="grid gap-5 sm:grid-cols-2">
                      <label className="space-y-2"><span className="block text-xs font-medium uppercase tracking-[0.16em] text-white/40">Nome de exibição</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="w-full rounded-xl border border-white/10 bg-white/[0.045] px-4 py-3 text-sm text-white outline-none transition-colors focus:border-cyan-300/60" /></label>
                      <label className="space-y-2"><span className="block text-xs font-medium uppercase tracking-[0.16em] text-white/40">E-mail</span><input value={email} readOnly className="w-full cursor-not-allowed rounded-xl border border-white/10 bg-white/[0.02] px-4 py-3 text-sm text-white/45 outline-none" /></label>
                    </div>
                    <div className="flex justify-end border-t border-white/10 pt-5"><button type="button" disabled={isSaving || !displayName.trim()} onClick={async () => { setIsSaving(true); try { await onSaveProfile(displayName.trim()); setSaved(true); window.setTimeout(() => setSaved(false), 2200); } finally { setIsSaving(false); } }} className="inline-flex items-center gap-2 rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-[#06101c] transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80">{saved && <Check className="h-4 w-4" />}{isSaving ? "Salvando..." : saved ? "Alterações salvas" : "Salvar alterações"}</button></div>
                  </div>
                )}
                {activeSection === "appearance" && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.035] p-5"><p className="text-sm font-semibold text-white">Aparência do Spady</p><p className="mt-1 text-xs leading-5 text-white/40">Ajuste como o ambiente de foco se comporta no seu dispositivo.</p></div>
                    <div className="space-y-3">
                      <button type="button" onClick={() => { const next = !reducedMotion; setReducedMotion(next); localStorage.setItem("spady-reduced-motion", String(next)); document.documentElement.dataset.reducedMotion = String(next); }} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-cyan-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"><span><span className="block text-sm font-medium text-white">Reduzir movimento</span><span className="mt-1 block text-xs text-white/40">Desativa transições decorativas para uma experiência mais estável.</span></span><span className={`relative h-6 w-11 rounded-full transition-colors ${reducedMotion ? "bg-cyan-300" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${reducedMotion ? "translate-x-6" : "translate-x-1"}`} /></span></button>
                      <button type="button" onClick={() => { const next = !compactMode; setCompactMode(next); localStorage.setItem("spady-compact-mode", String(next)); }} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-cyan-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"><span><span className="block text-sm font-medium text-white">Modo compacto</span><span className="mt-1 block text-xs text-white/40">Reduz o espaçamento entre superfícies para exibir mais contexto.</span></span><span className={`relative h-6 w-11 rounded-full transition-colors ${compactMode ? "bg-cyan-300" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${compactMode ? "translate-x-6" : "translate-x-1"}`} /></span></button>
                    </div>
                  </div>
                )}
                {activeSection === "notifications" && (
                  <div className="space-y-5">
                    <div className="rounded-2xl border border-violet-300/10 bg-violet-300/[0.035] p-5"><p className="text-sm font-semibold text-white">Notificações de execução</p><p className="mt-1 text-xs leading-5 text-white/40">Escolha os lembretes que ajudam você a voltar ao que importa.</p></div>
                    <div className="space-y-3">
                      <button type="button" onClick={() => { const next = !notificationsEnabled; setNotificationsEnabled(next); localStorage.setItem("spady-notifications", String(next)); }} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-violet-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"><span><span className="block text-sm font-medium text-white">Lembretes do foco</span><span className="mt-1 block text-xs text-white/40">Avisos para iniciar, pausar ou concluir um bloco de concentração.</span></span><span className={`relative h-6 w-11 rounded-full transition-colors ${notificationsEnabled ? "bg-violet-300" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${notificationsEnabled ? "translate-x-6" : "translate-x-1"}`} /></span></button>
                      <button type="button" onClick={() => { const next = !dailyBriefEnabled; setDailyBriefEnabled(next); localStorage.setItem("spady-daily-brief", String(next)); }} className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/[0.035] p-4 text-left transition hover:border-violet-300/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"><span><span className="block text-sm font-medium text-white">Resumo diário</span><span className="mt-1 block text-xs text-white/40">Mostra um resumo das prioridades e sessões do dia.</span></span><span className={`relative h-6 w-11 rounded-full transition-colors ${dailyBriefEnabled ? "bg-violet-300" : "bg-white/15"}`}><span className={`absolute top-1 h-4 w-4 rounded-full bg-white transition-transform ${dailyBriefEnabled ? "translate-x-6" : "translate-x-1"}`} /></span></button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
