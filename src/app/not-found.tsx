"use client";

import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#010516] px-6 text-center text-white">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-300/70">Spady</p>
        <h1 className="mt-4 text-4xl font-semibold">Página não encontrada</h1>
        <p className="mt-3 text-sm text-white/45">O caminho solicitado não existe ou foi movido.</p>
        <Link href="/" className="mt-7 inline-flex rounded-xl bg-cyan-300 px-4 py-2.5 text-sm font-semibold text-[#06101c] transition hover:bg-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-100/80">Voltar ao início</Link>
      </div>
    </main>
  );
}
