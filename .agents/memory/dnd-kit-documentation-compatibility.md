---
name: Compatibilidade da documentação do dnd-kit
description: Evitar misturar a documentação do novo motor dnd-kit com a linha core/sortable já utilizada.
---

A documentação principal do dndkit.com apresenta um motor novo; a documentação da linha `@dnd-kit/core` e `@dnd-kit/sortable` está sob `/legacy/`. O rótulo “legacy” da documentação não comprova que as versões instaladas desses pacotes estejam desatualizadas.

**Why:** A consulta oficial em 2026-09-30 mostrou que as versões publicadas mais recentes de core/sortable ainda correspondiam à linha instalada, enquanto a pesquisa já retornava APIs distintas, como DragDropManager e plugins.

**How to apply:** Conferir os pacotes efetivamente utilizados antes de escolher exemplos. Para DndContext, useSortable e DragOverlay, usar a documentação `/legacy/` e os exemplos compatíveis do repositório clauderic/dnd-kit. Não introduzir o motor novo como se fosse apenas uma atualização de versão.