# Plano de implementação: projetos do Kanban

## Contrato e autorização

Base: [especificação aprovada](../specs/2026-10-02-kanban-project-binding-editor-design.md).

Invariante: o projeto da tarefa é exatamente o projeto da sua coluna, inclusive
quando ambos estão sem projeto. A conclusão por check manual não muda.

Este plano não autoriza gravações no banco remoto, correção de associações,
exclusão de dados ou publicação. A etapa de aplicação SQL tem aprovação própria.
Não substituir o Supabase existente nem atualizar dependências amplamente.

## Estratégia

Executar as etapas na ordem abaixo. Em cada conjunto de mudanças, escrever
primeiro os testes do novo contrato, observar a falha pertinente e implementar
o suficiente para fazê-los passar. Depois verificar o conjunto integrado.

A inspeção remota é uma dependência da definição final do SQL, não motivo para
presumir que os arquivos de migrations refletem o banco. Se faltar conexão
administrativa, comunicar o bloqueio; testes e código locais podem avançar,
mas a garantia no banco e a entrega funcional permanecem pendentes.

## 1. Inspeção somente leitura do Supabase

**Ações**

- Confirmar o destino da conexão administrativa, sem revelar credenciais nem
  enviar seus valores para o chat.
- Em transação somente leitura, conferir tabelas, campos, constraints, triggers,
  RLS, grants e definições das RPCs de mover, reordenar e editar colunas.
- Conferir todas as variantes de RPC existentes e seus consumidores. Há SQL
  histórico em `migrations/` e incrementos em `supabase/migrations/`; não executar
  nenhuma dessas sequências automaticamente.
- Contar divergências usando comparação que inclua nulos: cards com projeto
  diferente da coluna e cards com projeto em coluna sem vínculo.
- Classificar associações entre donos, referências ausentes e pré-condições
  ausentes separadamente. Não “corrigir” esses casos silenciosamente.
- Conferir o histórico remoto sem criar baseline ou registrar migrations.

**Saída:** resumo agregado das divergências e requisitos reais do script.
Nenhum título, identificador pessoal ou conteúdo de tarefa entra no relatório.

## 2. Contratos compartilhados e testes da regra

**Arquivos existentes**

- `src/lib/types/blindados.ts`
- `src/hooks/useBlindadosData.helpers.ts`
- `src/hooks/useBlindadosData.helpers.test.ts`
- `src/components/blindados/kanbanBoard.helpers.ts`
- `src/components/blindados/kanbanBoard.helpers.test.ts`

**Ações**

- Definir tipos de edição de projeto, diferenças de vínculo e resposta confirmada.
- Normalizar ausência de projeto como `null` na fronteira de persistência.
- Fazer criação e movimentação locais resolverem o projeto da coluna de destino;
  nunca usar o filtro selecionado ou uma escolha antiga do card como autoridade.
- Filtrar projetos pela associação da coluna, não por cards com associação antiga.
- Preservar localização, ordem e todos os campos que não sejam o vínculo afetado.

**Testes:** destino com projeto, destino sem projeto, coluna inexistente, movimento
na própria coluna e reordenação. Atualizar casos antigos de escolha individual
para o novo contrato; não mantê-los como exceções ao comportamento aprovado.

**Saída:** regra única reutilizável, com testes que incluem ausência de projeto.

## 3. SQL incremental e testes transacionais

**Pontos de partida**

- `supabase/migrations/005_kanban_column_editing.sql`
- Definições remotas verificadas na etapa 1.

**Ações**

- Preparar uma nova migration pelo fluxo existente, sem reaplicar a 005,
  alterar o histórico ou exigir `kanban_projects.updated_at`.
- Implementar a igualdade de projeto na criação, edição e mudança de coluna,
  inclusive DML direto autorizado e payloads de clientes anteriores.
- Propagar alterações de projeto da coluna a todos os seus cards. Em uma mudança
  de vínculo, alcançar cards ocultos e concluídos sem depender da lista da UI.
- Criar uma operação transacional de edição de projeto com comparação dos
  valores anteriores dos metadados alterados e dos vínculos envolvidos.
- Ajustar entradas de RPC e proteção de DML para adquirir a serialização antes
  dos bloqueios de linha, com ordem consistente. Não instalar uma solução de
  trigger de linha que inverta os bloqueios de coluna e card.
- Descrever e medir a granularidade da serialização. Se a inspeção revelar que
  alguma via de escrita autorizada não consegue participar dela, resolver essa
  lacuna antes da aplicação; não declarar uma garantia apenas para a API nova.
- Preservar a exclusão já existente de projetos e colunas, verificando a interação
  entre triggers e ações de chaves estrangeiras.
- Restringir execução das funções e verificar propriedade no banco. Não conceder
  acesso público nem usar privilégio de definidor para contornar autorização.
- Preparar a correção das associações divergentes com prévia e mecanismo de
  preservação recuperável das associações anteriores, fora do repositório.

**Testes em banco de teste autorizado:** duas sessões concorrentes para criação
versus transferência, movimentação versus transferência, transferências
simultâneas e falha durante edição coletiva. Conferir igualdade incluindo nulos,
ausência de gravação parcial, preservação de campos e isolamento entre donos.

**Saída:** script revisável e resultados dos testes. Banco remoto permanece intacto.

## 4. API e serviço de projeto

**Arquivos existentes**

- `src/app/api/kanban/projects/route.ts`
- `src/app/api/kanban/add-card/route.ts`
- `src/app/api/kanban/update-card/route.ts`
- `src/app/api/kanban/move-card/route.ts`
- `src/app/api/kanban/reorder-cards/route.ts`
- `src/app/api/kanban/columns/route.ts`
- `src/lib/api/kanban.ts`
- `src/lib/services/kanbanService.ts`
- Testes de rotas e serviço nas mesmas áreas.

**Ações**

- Adicionar `PATCH` ao endpoint de projetos, com autenticação e validações de
  nome, cor, UUIDs, diferenças duplicadas e propriedade de todos os registros.
- Cada diferença informa coluna, vínculo anterior esperado e operação de
  vincular ao projeto editado ou remover. Não aceitar um terceiro projeto como
  destino arbitrário nessa edição.
- Comparar apenas os metadados modificados, com seus valores anteriores; preservar
  alterações concorrentes em campos não incluídos no envio.
- Chamar uma única RPC transacional. Um conflito devolve 409 sem confirmação parcial.
- Retornar projeto confirmado e alterações de vínculo dos cards e colunas,
  sem substituir campos de cards que não foram alterados pela operação.
- Trocar a atualização direta e booleana do serviço pelo contrato confirmado
  usado no hook; revisar os consumidores do método existente.
- Adaptar criação, edição e movimentação para refletirem o projeto realmente
  persistido. A proteção do banco resolve a corrida entre leitura e gravação.
- Não reintroduzir um caminho que atribua projeto individualmente, nem usar
  requisições independentes como fallback quando a RPC não estiver instalada.
- Tratar erros de operação ausente, permissão, conflito e transporte explicitamente,
  sem orientar o usuário a reaplicar migrations antigas.

**Testes:** entradas inválidas, acesso cruzado, conflito, função ausente, sucesso
com `null`, alterações apenas de nome/cor e resposta incompleta.

## 5. Hook, filas e cache

**Arquivos**

- `src/hooks/useBlindadosData.ts`
- `src/hooks/useBlindadosData.projects.test.tsx`
- Helpers e testes estruturais existentes.

**Ações**

- Expor uma atualização de projeto com resultado tipado e mensagem de erro.
- Fazer a edição coletiva participar da serialização estrutural de criações,
  movimentações e edição de colunas já existentes.
- Resolver o projeto confirmado da coluna ao executar cada criação ou movimento.
- Aplicar a resposta confirmada aos projetos e a todos os cards afetados,
  incluindo os não exibidos. Atualizar o cache junto do estado.
- Rebasear respostas e rollback sobre a estrutura confirmada e os campos atuais.
  Preservar proteções de dono e geração; não aceitar resposta de outra conta.
- Não transformar falha ambígua de criação em repetição de INSERT.

**Testes:** criação pendente, transferências sobrepostas, falhas consecutivas,
movimento rejeitado seguido de reorder confirmado, nome/cor sem mudanças de
vínculo, cards ocultos, troca de conta e resposta atrasada.

## 6. Editor lateral e integração compartilhada

**Arquivos existentes**

- `src/components/blindados/KanbanBoard.tsx`
- `src/components/blindados/KanbanWorkspace.tsx`
- `src/app/page.tsx`
- `src/components/blindados/KanbanBoard.projects.test.tsx`
- `src/components/blindados/KanbanWorkspace.layout.test.tsx`
- Componentes de popover, inputs e paleta já disponíveis.

**Novo componente previsto:** `src/components/blindados/ProjectEditorPopover.tsx`,
com testes próprios. A paleta pode ganhar um módulo pequeno compartilhado se
isso for necessário para reutilizá-la sem duplicação.

**Ações**

- Conectar o callback de edição do hook até o board nos dois pontos de entrada.
- Separar os botões de selecionar e editar em cada linha do seletor.
- Reutilizar popover para a composição pai/filho; remover somente handlers de
  clique externo e Escape que conflitem, preservando o seletor de datas.
- Implementar nome, cor e multisseleção de colunas existentes, rascunho local,
  indicação de vínculo atual, aviso de transferência e de remoção de associações.
- Enviar somente diferenças. Desabilitar envios repetidos; preservar o formulário
  em erro e restaurar o foco ao fechar.
- Abrir à direita com colisão e largura responsiva, incluindo teclado e toque.
- Ajustar o editor de cards, atualmente dentro do board, para mostrar projeto
  herdado e ausência de projeto sem oferecer atribuição individual.
- Ajustar visibilidade de colunas no filtro sem mudar filtros por data,
  comportamento de conclusão, timer ou gráfico.

**Testes:** botão de editar não seleciona o projeto, transferência confirmada,
desmarcação, Cancelar, erro, Escape em camadas, foco, interação em portal,
troca de conta, tela pequena e integração em Flows e Painel.

## 7. Aprovação específica e aplicação do banco

**Antes de qualquer gravação remota, apresentar ao usuário:**

- Script exato, pré-condições e conjunto de objetos que mudará.
- Quantidades agregadas de associações corrigidas por categoria.
- Confirmação de que nenhum card ou coluna será excluído.
- Plano de recuperação das associações e impacto de bloqueios.
- Resultados dos testes transacionais e verificação de permissões.

**Aguardar autorização explícita.** Se os pré-requisitos mudarem até a execução,
interromper e atualizar a prévia, em vez de aplicar um script incompatível.

Após autorização, aplicar somente o incremento revisado; conferir integridade
na mesma operação e depois fazer consultas de verificação. Não interpretar
alterações legítimas posteriores dos usuários como autorização para restaurar
um backup e sobrescrever seu trabalho.

## 8. Verificação integrada e entrega

Executar o conjunto completo após a implementação coerente:

```sh
npm test
npm run typecheck
npm run lint
npm run test:publish
```

O último comando inclui build com Turbopack e smoke de produção; não repetir
o build sem uma alteração que invalide seu resultado.

Reiniciar uma vez o workflow existente após o lote de código, conferir logs e
validar a interface nos tamanhos relevantes. Investigar o aviso de origem pela
requisição real, sem ampliar permissões por suposição.

Fazer verificação autenticada dos fluxos alterados, sem desabilitar autenticação.
Não avançar o relógio global do navegador de forma a expirar sessões; preservar
as regras de simulação de dia civil já documentadas.

**Concluir somente quando:** regra confirmada no banco, nenhum caminho de escrita
autorizado conhecido deixa divergência, edição transacional funcional na UI,
Flows e Painel consistentes, casos de concorrência e regressão aprovados.

Se a UI autenticada ou o banco não puderem ser verificados, declarar a limitação
e não apresentar a funcionalidade como concluída. Não publicar automaticamente.