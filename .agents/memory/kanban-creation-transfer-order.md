---
name: Criação e transferência coletiva
description: Ordenação necessária para que uma tarefa criada durante uma transferência não permaneça associada ao projeto antigo.
---

Criação pendente também é uma mutação da estrutura da coluna. Uma transferência
coletiva precisa compartilhar sua serialização com a criação completa, incluindo
reconciliação da resposta e atualização do estado confirmado.

**Why:** a transação que transfere todos os cards existentes não alcança um INSERT
posterior. Além disso, uma resposta de criação atrasada pode conter o projeto
antigo mesmo quando o estado visível já apresenta uma transferência mais recente.

**How to apply:** criações que aguardam uma transferência devem resolver a
associação confirmada ao executar, incluindo remoção explícita do projeto e
falha da transferência. Manter separados o projeto otimista visível e a associação
realmente confirmada. Sem transferência pendente, preservar a escolha manual do
usuário.

Não repetir uma criação após falha ambígua sem proteção de idempotência.

**Why:** o INSERT pode ter sido confirmado apesar de a resposta ter se perdido;
uma repetição automática pode criar outra tarefa.

**How to apply:** informar a falha de confirmação e reconciliar com o banco,
em vez de interpretar toda falha de transporte como ausência de gravação.