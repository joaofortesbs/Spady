---
name: Schema legado de projetos Kanban
description: Compatibilidade entre a API de projetos e instalações Supabase anteriores à migration de hardening.
---

A API de projetos deve tratar `updated_at` como opcional ao ler ou confirmar uma criação, porque instalações existentes podem ter apenas o schema base de `kanban_projects`.

**Why:** A migration base cria `created_at`, enquanto `updated_at` só é adicionado posteriormente; exigir a coluna na seleção faz o insert parecer falhar mesmo quando nome e cor são válidos.

**How to apply:** Prefira campos garantidos pela migration base nas rotas de projetos e mantenha o fallback `updatedAt = createdAt` até a migration de hardening ser aplicada em todas as instalações.

Ao atualizar apenas o comportamento de uma coluna, a confirmação da linha deve selecionar somente `id`, `title`, `position` e `behavior`; `project_id` é uma relação opcional em instalações antigas e não pode bloquear um PATCH que não a altera.

**Why:** O menu de comportamento pode falhar com rollback mesmo quando a coluna e o campo `behavior` existem, caso a projeção da resposta exija uma coluna de projeto ainda não criada no Supabase externo.

**How to apply:** Use a projeção mínima em PATCH de comportamento/posição e inclua `project_id` apenas na criação explicitamente vinculada a projeto ou após confirmar a migration de projetos.

Confirmações de mutação devem validar o valor solicitado, não apenas `success` e o ID da linha; normalizadores de leitura que usam `active` como fallback não podem mascarar uma gravação divergente.

**Why:** Uma instalação com constraint antiga pode aceitar a requisição HTTP, devolver a linha com outro valor ou rejeitar `progressive`; considerar apenas o ID como sucesso faz o estado otimista parecer persistido até a próxima recarga.

**How to apply:** Compare o campo persistido com o valor enviado em POST/PATCH antes de reconciliar estado ou cache, mantendo normalização permissiva somente para leituras legadas.

Erros PostgreSQL `23514` nomeando `kanban_columns_behavior_check` são evidência suficiente de que a instalação externa ainda rejeita `progressive`; o OpenAPI REST expõe o tipo/default, mas não substitui a inspeção da constraint.

**Why:** A interface e o contrato HTTP podem estar corretos enquanto uma constraint legada causa rollback determinístico; alterar o dropdown não corrige essa fronteira.

**How to apply:** Diagnostique com logs seguros, aplique somente o forward-fix da constraint identificada e valide um PATCH autenticado depois da migration.

Mutações otimistas do mesmo registro precisam serializar a gravação ou usar controle de versão; a ordem de confirmação da interface não garante a ordem final dos commits no banco.

**Why:** Duas escolhas rápidas de comportamento podem chegar ao servidor em ordem inversa e deixar banco, cache e UI divergentes mesmo quando ambas as respostas HTTP são válidas.

**How to apply:** Ao alterar behavior ou campos de um mesmo card/coluna, preserve o preview otimista, mas enfileire a persistência por registro e ignore confirmações/rollbacks obsoletos.