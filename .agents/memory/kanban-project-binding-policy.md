---
name: Desvinculação e filtros de projetos
description: Dependência integral do projeto da tarefa em relação à coluna, inclusive ausência de projeto e filtros.
---

Desvincular explicitamente uma coluna remove o projeto da coluna e de todas as
suas tarefas, sem excluir registros. Mover uma tarefa para uma coluna sem
projeto também deixa essa tarefa sem projeto. Não há atribuição individual
independente da coluna, mesmo quando ela estiver sem vínculo.

**Why:** o usuário corrigiu explicitamente: “Se uma tarefa é movida para uma
coluna sem projeto, a respectiva tarefa também vai ficar sem projeto, a tarefa
sempre é dependente da coluna e segue o respectivo status dela!”

**How to apply:** explicar o efeito antes de confirmar a edição. Alterar apenas
nome ou cor não deve regravar associações de colunas não alteradas. A regra
inclui tarefas existentes, ocultas, criadas, editadas e movidas. A correção não
autoriza excluir registros nem aplicar SQL sem aprovação específica.

O filtro de um projeto mostra somente suas colunas vinculadas. Colunas sem
projeto aparecem em “Todos os projetos”, não no filtro de um projeto.

**Why:** o usuário aprovou restringir o filtro e depois esclareceu que as tarefas
sempre seguem a associação da coluna, inclusive ausência de projeto; assim,
não existe exceção de tarefa de um projeto em coluna sem vínculo.

**How to apply:** filtrar pela associação da coluna, independentemente da
visibilidade de suas tarefas por data ou conclusão. “Todos os projetos” continua
mostrando todas as colunas. Não inferir mudança da regra de check manual a partir
da palavra “status” nessa correção sobre projetos.