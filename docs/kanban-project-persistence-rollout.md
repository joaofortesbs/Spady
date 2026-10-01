# Persistência de projetos do Kanban

## Ordem canônica

1. Aplicar a migration base de Kanban (`migrations/003_kanban_tables.sql`).
2. Aplicar `supabase/migrations/001_add_projects_and_fields.sql`.
3. Aplicar `supabase/migrations/002_progressive_kanban_behavior.sql`.
4. Aplicar `supabase/migrations/003_harden_kanban_projects.sql`.
5. Somente para habilitar a edição ampliada de colunas, revisar o schema externo
   e aplicar `supabase/migrations/005_kanban_column_editing.sql` como forward-fix.

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
remove constraints desconhecidas. Ela aborta se a coluna não for `TEXT`, se a
constraint canônica não existir, se outra CHECK usar `behavior`, ou se houver
valores nulos/desconhecidos. Antes de aplicá-la, confirme os metadados e faça
um backup; depois, repita a consulta de constraints e um PATCH autenticado de
teste. Não execute as migrations históricas `migrations/011` ou
`supabase/migrations/002` como tentativa alternativa em uma instalação já
parcialmente migrada.

## Edição de colunas e transferência atômica

O endpoint de edição precisa de `supabase/migrations/005_kanban_column_editing.sql`
para persistir `kanban_columns.background_color` e para transferir projeto. Antes
de aplicá-la, confirme o projeto/schema de destino, autorização explícita e um
backup protegido. A migration é aditiva e aborta se as tabelas ou colunas
canônicas de ownership/projeto estiverem ausentes, se uma coluna tiver tipo
inesperado, se uma cor existente não for `TEXT` anulável/hexadecimal ou se
houver uma constraint não reconhecida que a envolva. Ela não atualiza defaults,
linhas existentes, timestamps de cards ou projetos, e não exige
`kanban_projects.updated_at` (compatível com tabelas antigas de projetos).

O contrato SQL é
`public.edit_kanban_column_v1(p_user_id uuid, p_column_id uuid, p_updates jsonb)`.
`p_updates` aceita somente `title`, `behavior`, `position`, `project_id` e
`background_color` (chaves snake_case); `project_id: null` desassocia e
`background_color: null` restaura o fundo padrão. A função bloqueia a coluna e
todos os cards associados, valida ownership e destino, e efetua as alterações
numa única transação. Seu resultado contém a coluna persistida,
`cards_project_updated` e `cards_updated_count`. A execução é revogada de
`PUBLIC`, `anon` e `authenticated` e concedida somente a `service_role`; a API
autentica o usuário e envia explicitamente seu ID.

Depois de confirmar a pré-condição e aplicar somente essa migration forward,
verifique o resultado sem imprimir segredos:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'kanban_columns'
  AND column_name = 'background_color';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conrelid = 'public.kanban_columns'::regclass
  AND conname = 'kanban_columns_background_color_check';

SELECT
  has_function_privilege('service_role',
    'public.edit_kanban_column_v1(uuid,uuid,jsonb)', 'EXECUTE') AS service_can_execute,
  has_function_privilege('authenticated',
    'public.edit_kanban_column_v1(uuid,uuid,jsonb)', 'EXECUTE') AS authenticated_cannot_execute;
```

Não reaplique migrations históricas, não inicialize um histórico incompleto e
não execute a migration contra outro destino sem confirmação. Se a API informar
que a edição ainda não está disponível, aplique apenas a migration 005 depois
das verificações acima; não há fallback de transferência com updates separados.

## Cards, arraste e conclusão diária

- Flows e Painel continuam consumindo o mesmo Kanban. A personalização deve ser
  consistente entre cards, colunas e prévias de arraste, sem mudar o tema global.
- Indicadores de comportamento e o check de conclusão são neutros. As cores de
  prioridade mantêm seu significado independente da cor da coluna.
- O corpo não interativo do card e a área livre do cabeçalho da coluna permitem
  arraste. Menus, check e outros controles não iniciam esse gesto; as alças
  continuam oferecendo acesso por teclado.
- A prévia de arraste não deve persistir mudanças a cada movimento. Somente
  a confirmação altera a estrutura; cancelamento não modifica o banco.
- Reordenar uma visualização filtrada preserva os cards e colunas ocultos.
  Falhas estruturais não devem desfazer edições confirmadas de conteúdo ou cor.
- Apenas cards marcados no check em colunas “Conclusão” ficam ocultos no dia
  seguinte. Cards pendentes permanecem visíveis, independentemente de sua idade.
- A conclusão utiliza `completed_at`; desmarcar limpa esse campo. Mover um card
  não o conclui automaticamente. A virada do dia usa o dia civil local e deve
  atualizar a aba aberta e a aba retomada após suspensão.
- Ocultar não é excluir: registros, subtarefas, conteúdo e associações são
  preservados. Uma data explicitamente selecionada permanece a referência da
  visualização histórica.
- Esses ajustes utilizam os campos e APIs existentes, sem reaplicar migrations
  históricas nem exigir uma nova mudança remota de schema.
- Validar mouse, toque e teclado, movimento reduzido, filtros, reload, erros de
  salvamento e a transição 23:59 → 00:00; incluir o fuso `America/Sao_Paulo`.

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