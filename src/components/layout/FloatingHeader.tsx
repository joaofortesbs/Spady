"use client";

import React from "react";
import { FileText, Settings2 } from "lucide-react";
import { motion } from "framer-motion";

interface FloatingHeaderProps {
  userName: string;
  avatarUrl?: string | null;
  onOpenCapture: () => void;
  onOpenProfile: () => void;
}

export function FloatingHeader({ userName, avatarUrl, onOpenCapture, onOpenProfile }: FloatingHeaderProps) {
  const initials = userName.trim().slice(0, 1).toUpperCase() || "S";

  return (
    <header className="sticky top-4 z-40 mx-4 mb-2 flex min-h-[64px] items-center justify-between rounded-2xl border border-cyan-300/15 bg-[#070d1d]/90 px-3 shadow-[0_18px_55px_rgba(0,0,0,0.28)] backdrop-blur-xl sm:mx-6 sm:px-4">
      <div className="flex items-center gap-2 text-white/40">
        <span className="hidden pl-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-white/35 sm:inline">Workspace</span>
        <span className="h-5 w-px bg-white/10" aria-hidden="true" />
        <motion.button
          type="button"
          onClick={onOpenCapture}
          whileTap={{ scale: 0.96 }}
          className="group flex h-10 items-center gap-2 rounded-xl border border-cyan-300/15 bg-cyan-300/[0.06] px-3 text-cyan-100 transition-colors hover:border-cyan-300/35 hover:bg-cyan-300/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70"
          aria-label="Abrir captura rápida"
          title="Captura rápida"
        >
          <FileText className="h-4 w-4 text-cyan-300 transition-transform group-hover:-rotate-3" />
          <span className="hidden text-xs font-medium sm:inline">Capturar</span>
          <kbd className="hidden rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-white/35 lg:inline">N</kbd>
        </motion.button>
      </div>

      <motion.button
        type="button"
        onClick={onOpenProfile}
        whileTap={{ scale: 0.98 }}
        className="group flex min-w-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-2 py-1.5 text-left transition-colors hover:border-cyan-300/30 hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/70 sm:gap-3 sm:px-3"
        aria-label="Abrir perfil e configurações"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-cyan-300/35 bg-gradient-to-br from-cyan-300/80 to-violet-500/80 text-sm font-semibold text-[#07101f]">
          {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
        </span>
        <span className="hidden min-w-0 sm:block">
          <span className="block max-w-[150px] truncate text-sm font-medium text-white">{userName}</span>
          <span className="block text-[10px] uppercase tracking-[0.18em] text-white/35">Perfil pessoal</span>
        </span>
        <Settings2 className="hidden h-4 w-4 text-white/35 transition-colors group-hover:text-cyan-200 sm:block" />
      </motion.button>
    </header>
  );
}
