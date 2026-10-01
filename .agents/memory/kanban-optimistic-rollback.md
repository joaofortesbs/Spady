---
name: Rollback estrutural do Kanban
description: Por que operações enfileiradas precisam de estrutura confirmada e reconciliação de pertencimento, não apenas tokens de ordem.
---

Uma fila serializa requisições, mas não torna confirmado o rascunho otimista
capturado pela próxima interação. Recuperação de falhas deve usar a estrutura
confirmada, preservando os campos atuais dos cards e a personalização das colunas.

**Why:** duas movimentações rejeitadas podem deixar a segunda restaurando uma
localização que nunca existiu no banco. Além disso, uma reordenação bem-sucedida
de outros cards pode invalidar o token de um movimento rejeitado sem corrigir
seu pertencimento. Um baseline de ordem, isoladamente, não evita essa divergência.
Ausência no baseline da coluna de destino também não significa “card novo”:
depois de um movimento rejeitado, esse ID pode continuar confirmado na origem.

**How to apply:** ao alterar filas, drag-and-drop ou rollback, cobrir tanto
falhas consecutivas quanto movimento rejeitado seguido de reordenação confirmada.
Reconciliar ordem e pertencimento das colunas afetadas; rebasear a lista de
posições contra os IDs confirmados antes de persistir, sem duplicar cards,
ressuscitar exclusões ou desfazer título, conclusão, projeto ou cor mais recentes.
Não usar reordenação de colunas como confirmação de movimentação de cards.
Excluir de uma reordenação os IDs confirmados em outra coluna, distinguindo-os
dos cards realmente novos; uma operação de ordem não deve transferir ou duplicar.