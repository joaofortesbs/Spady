---
name: Criação e transferência coletiva
description: Ordenação necessária para que uma tarefa criada durante uma transferência não permaneça associada ao projeto antigo.
---

O projeto da coluna é obrigatório para todas as tarefas dentro dela, não apenas
um valor padrão. Isso inclui ausência de projeto: uma tarefa em coluna sem
vínculo também fica sem projeto. Não há escolha individual independente.

**Why:** o usuário determinou que a tarefa obrigatoriamente pertence ao projeto
da coluna e esclareceu depois que mover para uma coluna sem projeto também
deixa a tarefa sem projeto.

**How to apply:** considerar todas as tarefas da coluna, inclusive ocultas,
novas e movidas. Remover a liberdade de atribuição individual também em colunas
sem projeto, sem alterar campos não relacionados à associação.

Criação pendente também é uma mutação da estrutura da coluna. Uma transferência
coletiva precisa compartilhar sua serialização com a criação completa, incluindo
reconciliação da resposta e atualização do estado confirmado.

**Why:** a transação que transfere todos os cards existentes não alcança um INSERT
posterior. Além disso, uma resposta de criação atrasada pode conter o projeto
antigo mesmo quando o estado visível já apresenta uma transferência mais recente.

**How to apply:** criações que aguardam uma transferência devem resolver a
associação confirmada ao executar, incluindo remoção explícita do projeto e
falha da transferência. Manter separados o projeto otimista visível e a associação
realmente confirmada. Sem transferência pendente, resolver igualmente o projeto
da coluna confirmada, incluindo ausência de projeto, nunca uma escolha individual.

Não repetir uma criação após falha ambígua sem proteção de idempotência.

**Why:** o INSERT pode ter sido confirmado apesar de a resposta ter se perdido;
uma repetição automática pode criar outra tarefa.

**How to apply:** informar a falha de confirmação e reconciliar com o banco,
em vez de interpretar toda falha de transporte como ausência de gravação.