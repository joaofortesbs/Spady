---
name: Concorrência na herança de projeto
description: Restrição de ordem de locks para garantir a associação entre tarefa e coluna no banco.
---

A serialização das alterações de vínculo deve começar antes de qualquer lock de linha, tanto nos caminhos RPC quanto no DML autorizado. Não trate um trigger BEFORE ROW que bloqueia a coluna como solução suficiente.

**Why:** Mover uma tarefa pode bloquear a tarefa antes de consultar ou bloquear sua coluna. Uma transferência coletiva pode bloquear a coluna e depois suas tarefas. Acrescentar um lock da coluna no trigger da tarefa conserva essa inversão e pode provocar deadlock. Um guard de statement também não cobre locks que uma RPC já adquiriu em um SELECT anterior.

**How to apply:** Inspecione as definições e permissões reais antes de preparar a migration. Inclua os pontos de entrada antigos na estratégia de serialização e teste duas sessões concorrentes em ambas as ordens. Não declare a invariável garantida só porque a interface, uma RPC nova ou um trigger isolado passou nos testes.