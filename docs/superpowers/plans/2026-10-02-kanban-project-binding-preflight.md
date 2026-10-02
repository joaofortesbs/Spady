# Inspeção somente leitura: vínculo de projetos do Kanban

## Resultado

A conexão PostgreSQL autenticou com a secret atualizada. O destino foi
comparado ao projeto usado pelo app. A verificação de certificado TLS
permaneceu habilitada, com a CA oficial do Supabase.

Todas as consultas remotas foram executadas em transações somente leitura.
Nenhuma migration, correção de dados ou alteração de permissões foi aplicada.

## Contagens observadas

| Categoria | Quantidade |
| --- | ---: |
| Projetos | 1 |
| Colunas | 14 |
| Tarefas | 21 |
| Tarefas com projeto diferente do projeto da coluna | 4 |
| Tarefas com projeto em coluna sem projeto | 0 |
| Tarefas sem coluna correspondente | 0 |
| Tarefas e colunas com proprietários diferentes | 0 |
| Projetos de colunas ausentes ou de outro proprietário | 0 |
| Projetos de tarefas ausentes ou de outro proprietário | 0 |

As contagens de tarefas foram obtidas juntas em uma consulta SQL. As verificações
complementares foram realizadas em outra transação; não se deve interpretar
o conjunto como um snapshot único imutável. Antes de qualquer aplicação,
revalidar as condições e o impacto sob os bloqueios da operação.

## Compatibilidade do schema

- `kanban_projects` não possui `updated_at`. A nova operação não deve exigir esse campo.
- `edit_kanban_column_v1` está instalada e sua execução é limitada a
  `postgres` e `service_role`.
- `edit_kanban_project_v1` não está instalada.
- Os únicos triggers observados em cards e colunas atualizam timestamps.
  Não há trigger observado que imponha a herança de projeto.
- Não existe a relação `supabase_migrations.schema_migrations`.
  Não criar histórico nem reaplicar migrations antigas automaticamente.
- A exclusão de uma coluna apaga seus cards por chave estrangeira.
  A exclusão de um projeto remove seu vínculo em cards e colunas.
  A nova proteção deve preservar esses comportamentos.
- RLS está habilitado nas três tabelas.

## Risco de acesso identificado

As funções `get_kanban_data`, `move_card`, `update_card_positions` e
`update_column_positions` são `SECURITY DEFINER`, pertencem a um papel
que ignora RLS e possuem execução concedida a `PUBLIC`, `anon` e
`authenticated`. Suas definições usam o `p_user_id` recebido sem verificar
se ele corresponde à identidade autenticada.

Isso permite contornar a proteção de propriedade das tabelas por essas funções.
Não foi necessário executar chamadas como outro usuário para identificar o risco;
foram examinadas somente as definições e permissões.

`get_user_kanban`, por contraste, verifica `auth.uid()` na definição observada.
Não generalizar o problema para todas as funções.

## Requisitos da proposta SQL

1. Criar a operação transacional de edição de projetos e a proteção de
   herança em todos os caminhos de escrita autorizados, incluindo nulos.
2. Incluir as RPCs antigas na serialização antes de qualquer lock de linha.
3. Preservar metadados e bindings não alterados; conferir os valores esperados.
4. Preparar a correção das quatro divergências, sem excluir tarefas ou colunas,
   com preservação recuperável dos vínculos anteriores fora do repositório.
5. Tratar as permissões das funções antigas como uma mudança explícita de
   acesso e verificar os consumidores antes de restringi-las.
6. Testar a proposta em PostgreSQL local isolado, sem usar dados reais, incluindo
   concorrência, exclusões por chave estrangeira e isolamento entre proprietários.

Este documento não é uma migration executável nem uma autorização de aplicação.
O script exato, seus testes, impacto e plano de recuperação ainda precisam
ser preparados e apresentados antes da aprovação de qualquer gravação remota.