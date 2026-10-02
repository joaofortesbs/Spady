# Vínculo obrigatório e editor de projetos do Kanban

## Aprovação e limites

O desenho apresentado em conversa foi aprovado pelo usuário. Este documento
formaliza esse desenho para revisão antes do plano de implementação.

A aprovação do desenho não autoriza executar migrations, corrigir dados remotos,
excluir registros, publicar o aplicativo ou atualizar bibliotecas de forma ampla.
Alterações SQL e correção dos vínculos existentes terão aprovação separada,
após inspeção somente leitura, apresentação do impacto e revisão do script.

## Objetivo

Garantir que toda tarefa ou compromisso em uma coluna vinculada a um projeto
pertença a esse projeto. Permitir editar nome, cor e colunas de um projeto pelo
menu “Todos os projetos”, com o mesmo comportamento em Flows e Painel.

## Contrato de associação

1. Uma coluna vinculada determina obrigatoriamente o projeto de todos os seus
   cards. A regra inclui cards ocultos, concluídos, futuros, existentes, criados,
   editados e recebidos por movimentação.
2. Em uma coluna vinculada, o editor do card mostra “Herdado da coluna” e não
   permite escolher outro projeto nem remover a associação individualmente.
3. Em uma coluna sem vínculo, permanece a escolha individual do projeto.
4. Mover um card para uma coluna vinculada atribui o projeto de destino.
   Mover para uma coluna sem vínculo preserva o projeto individual que o card
   tinha antes do movimento; não equivale a desvincular a coluna.
5. Vincular ou transferir uma coluna atribui o projeto escolhido a todos os seus
   cards, independentemente de filtros ou visibilidade.
6. Desvincular explicitamente uma coluna remove o projeto da coluna e de todos
   os seus cards. Nenhuma coluna ou tarefa é excluída.
7. Uma edição apenas de nome ou cor não transfere cards nem regrava associações
   de colunas não alteradas. Não elimina escolhas individuais em outras colunas.
8. Transferências preservam IDs, posições, datas, texto, prioridades, etiquetas,
   subtarefas, conclusão e histórico. Somente os vínculos necessários mudam;
   timestamps técnicos de atualização podem acompanhar a gravação.

No filtro do projeto Y, aparecem colunas vinculadas a Y e colunas sem vínculo
que contenham cards de Y. Uma coluna vazia e sem vínculo não aparece. A opção
“Todos os projetos” continua exibindo todas as colunas. A presença de uma coluna
no filtro não depende de os seus cards estarem visíveis pelo filtro de data.

## Editor de projeto

Cada linha do seletor mantém sua ação de selecionar o projeto e ganha um botão
de edição no extremo direito. Os dois botões são irmãos: nenhum botão fica
dentro de outro. Editar não muda o projeto selecionado no filtro.

O editor abre à direita da linha, com reposicionamento quando não houver espaço
e largura limitada à tela em dispositivos pequenos. Seu conteúdo contém:

- Nome, com as validações existentes de tamanho e conteúdo.
- Cor, reutilizando a paleta de projetos existente.
- Seleção múltipla compacta das colunas existentes, com nome, indicação de
  seleção e projeto atual quando houver.
- Salvar, Cancelar, estado de processamento e mensagem de erro.

As colunas já vinculadas ao projeto iniciam selecionadas. Marcar uma coluna de
outro projeto informa que ela e suas tarefas serão transferidas; a confirmação
deve acontecer antes de enviar a gravação. A interface também informa que
desmarcar remove as associações dos cards sem apagá-los.

Salvar envia somente as diferenças em relação ao estado inicial, juntamente
com os valores anteriores necessários para detectar conflitos. Cancelar descarta
o rascunho sem gravar. Um erro preserva o preenchimento. Durante o envio, não
permitir um segundo envio nem apresentar Cancelar como reversão de uma operação
já recebida pelo servidor.

A cor do projeto não substitui a cor personalizada das colunas nem a dos cards.
Reutilizar os componentes de popover, controles e estilos do aplicativo.
Eliminar somente os handlers antigos que conflitem com o novo seletor.

### Acessibilidade e interação

- Botões de edição têm rótulo acessível com o nome do projeto.
- O painel tem identificação acessível, foco inicial no campo de nome e
  navegação por teclado pelos campos e ações.
- Escape fecha primeiro o editor; o seletor pai não fecha no mesmo evento.
- Fechar devolve o foco ao botão de edição, quando ele ainda estiver presente.
- Interagir com o painel renderizado em portal não é um clique externo do pai.
- Fechar o seletor fecha o editor. Remoção do projeto ou troca de conta encerra
  o rascunho antigo; respostas atrasadas não alteram o novo contexto.
- Não anunciar o seletor como um menu ARIA sem implementar seu contrato de
  teclado. Usar a semântica apropriada ao conteúdo interativo escolhido.

## Arquitetura e fluxo

Fluxo compartilhado:

`KanbanBoard / KanbanWorkspace → hook de dados → API → operação transacional
no Supabase → estado confirmado e cache`.

Separar o editor em um componente focado, evitando aumentar desnecessariamente
o componente principal. Estender os tipos, callbacks e serviço já existentes,
sem criar um segundo estado de projetos independente.

### Persistência

A regra deve existir no banco, não apenas no editor ou nas rotas Next.js.
Criação, atualização, movimentação e alterações de vínculo devem respeitá-la,
inclusive operações vindas de outra aba ou de um cliente anterior.

A atualização de projeto confirma nome, cor e diferenças de colunas numa única
transação. A API autentica o usuário, valida os dados e verifica propriedade de
todos os registros envolvidos. O banco também rejeita relações entre donos.
Funções novas não recebem permissão pública de execução por conveniência.

Comparar valores anteriores de nome, cor e vínculos alterados dentro da transação.
Caso uma associação ou metadado relevante tenha mudado, retornar conflito 409
sem confirmar parte da operação. Não depender de `kanban_projects.updated_at`,
que pode estar ausente no schema legado. Não usar `Promise.all` de gravações
independentes para simular uma transação.

A estratégia de concorrência deve obter sua serialização antes dos bloqueios
de linhas e manter uma ordem consistente em todos os caminhos envolvidos,
incluindo DML direto autorizado e RPCs de movimentação existentes. Um trigger
de linha que tenta bloquear a coluna depois de bloquear o card não basta:
pode inverter a ordem usada pela transferência. Validar a solução com duas
sessões reais de banco antes de considerar a regra comprovada.

A inspeção remota determinará as funções e permissões a alterar. O script final
deve apresentar explicitamente seu mecanismo de serialização, alcance e impacto
de contenção para revisão antes de aplicação. Exclusão de projeto já existente
no aplicativo também precisa continuar funcionando com suas relações,
sem introduzir conflito entre triggers e ações das chaves estrangeiras.

### Estado do cliente

Reutilizar as filas estruturais, baselines confirmados e proteções de dono e
geração existentes. Criações e movimentos pendentes devem resolver o projeto
confirmado da coluna ao executar, e não um snapshot otimista obsoleto.

Após salvar, atualizar projetos, colunas e cards afetados com a resposta
confirmada; invalidar ou reconciliar o cache correspondente. Não atualizar
somente os cards visíveis. Rollback reconcilia associação, localização e ordem
sem desfazer campos mais recentes ou ressuscitar registros excluídos.

Não repetir automaticamente um INSERT cuja confirmação se perdeu sem garantia
de idempotência. Respostas atrasadas de outra conta não confirmam o estado atual.
Erros de permissão, conflito, transporte ou operação não instalada devem ser
explícitos; não executar um fallback com gravações parciais.

## Banco existente e implantação

Antes de preparar o SQL final:

1. Inspecionar em modo somente leitura o schema remoto, funções, triggers,
   constraints, grants e histórico de migrations.
2. Contar inconsistências e classificar seu impacto sem expor conteúdo ou
   identificadores pessoais no relatório.
3. Confirmar acesso administrativo ao Supabase usado pelo app, sem substituir
   esse banco por outro serviço.
4. Preparar alteração incremental e prévia das associações que serão corrigidas.
   Preservar as associações anteriores de modo recuperável, sem adicioná-las ao
   repositório nem publicá-las como relatório.
5. Apresentar script, pré-condições, impacto e mecanismo de recuperação.
   Aguardar autorização específica antes de executar.

Não reaplicar a migration 005, presumir a instalação da 003, inicializar um
histórico legado sem baseline ou registrar migrations antigas como aplicadas
sem conferir seus efeitos. Verificar preservação dos registros atomicamente:
gravações legítimas concorrentes posteriores não justificam restaurar dados.

O aplicativo não é considerado pronto enquanto a migration necessária não
estiver instalada e validada. Código local e testes com banco simulado não
comprovam a garantia no Supabase remoto.

## Critérios de aceitação e verificação

| Área | Casos necessários |
| --- | --- |
| Regra de projeto | Criar e editar em coluna vinculada; rejeitar ou canonicalizar escolhas conflitantes; preservar escolha em coluna sem vínculo. |
| Movimentação | Entre projetos diferentes, para coluna sem vínculo, arraste dentro da coluna e reordenação sem transferência indevida. |
| Abrangência | Cards ocultos, concluídos e futuros recebem o mesmo vínculo da coluna. |
| Edição de projeto | Renomear, trocar cor, marcar e desmarcar colunas; editar apenas metadados não regrava vínculos inalterados. |
| Atomicidade | Um conflito ou erro em qualquer diferença não deixa nome, cor ou colunas parcialmente salvos. |
| Concorrência | Criar durante transferência; mover durante transferência; editar vínculos em duas sessões; falhas consecutivas e resposta atrasada. |
| Segurança | Sem acesso cruzado entre contas; permissões mínimas; troca de conta descarta rascunho e resposta antiga; segredo de serviço nunca chega ao navegador. |
| Interface | Seleção e edição separadas, cancelamento, erro recuperável, foco, Escape em camadas, portal, toque e tela pequena. |
| Filtros | Coluna desmarcada desaparece do projeto se não houver cards dele; colunas sem vínculo com cards do projeto continuam acessíveis. |
| Preservação | Datas, textos, subtarefas, etiquetas, cores próprias, posições, conclusão e histórico não são sobrescritos pela associação. |
| Regressão | Flows e Painel; timer, gráfico, comportamento por data e check manual; criação/exclusão existentes. |

Executar testes direcionados e regressão, TypeScript, lint e build de produção.
Testar transações em duas sessões do banco de teste e realizar validação
autenticada dos fluxos alterados após a aplicação autorizada.

Capturas públicas não autenticam no aplicativo; caso só seja possível conferir
rotas públicas, declarar que a interface autenticada não foi verificada.
O endpoint de saúde comprova apenas liveness, não a conectividade do Supabase.

## Fora do escopo

- Exclusão de dados ou migração para outro provedor.
- Novas regras de conclusão, datas, timer ou gráfico.
- Refatoração geral do Kanban ou troca de biblioteca de drag-and-drop.
- Upgrades amplos de Next, React e Supabase junto desta correção.
- Publicação automática.

O aviso de origem do servidor de desenvolvimento será investigado pela
requisição efetiva; não ampliar permissões sem diagnóstico. Atualizações de
dependências exigem avaliação separada de compatibilidade.

## Ordem de entrega

Revisão desta especificação → plano de implementação → inspeção remota somente
leitura → SQL e testes locais → revisão e autorização do script → aplicação
autorizada → integração de API, estado e interface → regressão e entrega.

Implementação e testes locais podem avançar antes da aplicação autorizada,
mas nenhuma gravação remota de schema ou correção de dados ocorre sem essa
aprovação. Dependências não verificadas serão comunicadas, não ocultadas.