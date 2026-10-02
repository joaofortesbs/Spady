---
name: Desvinculação e filtros de projetos
description: Semântica aprovada para remover colunas de projetos e sua presença nos filtros do Kanban.
---

Desvincular explicitamente uma coluna remove o projeto da coluna e de todas as
suas tarefas, sem excluir registros. Isso não é o mesmo que mover uma tarefa
para uma coluna sem projeto: nesse movimento, preserva-se seu projeto individual.

**Why:** o usuário aprovou o desenho recomendado que mantém a remoção coletiva
das associações ao desmarcar uma coluna no editor de projeto; não aprovou
exclusão de dados nem aplicação automática de SQL.

**How to apply:** explicar o efeito antes de confirmar a edição. Alterar apenas
nome ou cor não deve regravar associações de colunas não alteradas.

O filtro de um projeto mostra suas colunas vinculadas e colunas sem vínculo
que contenham tarefas dele; não mostra todas as colunas vazias sem vínculo.

**Why:** o usuário aprovou restringir esse filtro para que uma coluna desmarcada
sem tarefas do projeto deixe de aparecer visualmente.

**How to apply:** avaliar pertencimento sobre todas as tarefas da coluna, não
apenas as visíveis pelo filtro de data ou conclusão. “Todos os projetos” continua
mostrando todas as colunas.