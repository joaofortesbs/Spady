---
name: Lockfiles alternativos no publish
description: Como evitar bloqueios de segurança causados por lockfiles obsoletos de gerenciadores que o projeto não usa.
---

Mantenha apenas o lockfile do gerenciador canônico do projeto, ou atualize todos os lockfiles versionados em conjunto.

**Why:** O scanner de segurança do publish pode analisar lockfiles alternativos e bloquear versões vulneráveis que não aparecem na árvore instalada pelo gerenciador usado no build.

**How to apply:** Quando o log de publish citar versões diferentes das resolvidas localmente, compare todos os lockfiles versionados e remova apenas os obsoletos que não pertencem ao fluxo oficial.