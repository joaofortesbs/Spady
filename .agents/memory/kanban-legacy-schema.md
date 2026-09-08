---
name: Schema legado de projetos Kanban
description: Compatibilidade entre a API de projetos e instalações Supabase anteriores à migration de hardening.
---

A API de projetos deve tratar `updated_at` como opcional ao ler ou confirmar uma criação, porque instalações existentes podem ter apenas o schema base de `kanban_projects`.

**Why:** A migration base cria `created_at`, enquanto `updated_at` só é adicionado posteriormente; exigir a coluna na seleção faz o insert parecer falhar mesmo quando nome e cor são válidos.

**How to apply:** Prefira campos garantidos pela migration base nas rotas de projetos e mantenha o fallback `updatedAt = createdAt` até a migration de hardening ser aplicada em todas as instalações.