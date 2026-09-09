# Persistência de projetos do Kanban

## Ordem canônica

1. Aplicar a migration base de Kanban (`migrations/003_kanban_tables.sql`).
2. Aplicar `supabase/migrations/001_add_projects_and_fields.sql`.
3. Aplicar `supabase/migrations/002_progressive_kanban_behavior.sql`.
4. Aplicar `supabase/migrations/003_harden_kanban_projects.sql`.

As migrations antigas em `migrations/004` até `migrations/011` são compatibilidade
histórica para instalações que já as executaram. Não devem ser reaplicadas como
um caminho alternativo depois da migration canônica; as assinaturas RPC
autoritativas são as quatro funções documentadas no arquivo 003.

## Forward-fix do comportamento Progressivo

Se o endpoint retornar o erro PostgreSQL `23514` para a constraint
`kanban_columns_behavior_check`, a instalação externa ainda conserva a
constraint legada que rejeita `progressive`. Nesse caso, execute somente
`supabase/migrations/004_progressive_kanban_behavior_forward_fix.sql` depois de
confirmar que a coluna `behavior` é `TEXT` e que a constraint tem esse nome.

Essa migration é limitada à constraint canônica, não reescreve dados e não
remove constraints desconhecidas. Antes de aplicá-la, confirme os metadados com
as consultas abaixo e, depois, repita a consulta de constraints e um PATCH
autenticado de teste. Não execute as migrations históricas `migrations/011` ou
`supabase/migrations/002` como tentativa alternativa em uma instalação já
parcialmente migrada.

## Pré-condições e verificação

A migration canônica exige as tabelas `kanban_projects`, `kanban_columns` e
`kanban_cards`. Antes de executá-la, faça um backup e verifique as linhas que
seriam rejeitadas:

```sql
SELECT c.id AS column_id, c.user_id AS column_user, p.user_id AS project_user
FROM kanban_columns c
JOIN kanban_projects p ON p.id = c.project_id
WHERE c.project_id IS NOT NULL AND c.user_id <> p.user_id;

SELECT k.id AS card_id, k.user_id AS card_user, p.user_id AS project_user
FROM kanban_cards k
JOIN kanban_projects p ON p.id = k.project_id
WHERE k.project_id IS NOT NULL AND k.user_id <> p.user_id;

SELECT k.id AS card_id, k.user_id AS card_user, c.user_id AS column_user
FROM kanban_cards k
JOIN kanban_columns c ON c.id = k.column_id
WHERE k.user_id <> c.user_id;
```

Após a aplicação, confirme as constraints, policies, índices e as colunas
`created_at`/`updated_at` de projetos com as consultas no final da migration.
Uma execução repetida deve concluir sem recriar objetos nem modificar dados.

## Falha, rollback e forward-fix

As verificações de inconsistência ocorrem antes de constraints e policies; uma
falha aborta a transação da própria instrução e não move ou remove registros.
Não existe rollback destrutivo recomendado: preserve o backup, corrija
explicitamente as relações rejeitadas com uma estratégia aprovada e execute a
migration novamente. Se uma policy ou RPC precisar de ajuste, faça um
forward-fix versionado, mantendo as constraints de ownership. Remover uma
constraint para “destravar” o rollout não é um rollback seguro.