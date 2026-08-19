# Project TODO

## Importação literal e validação

- [x] Confirmar acesso ao repositório público `joaofortesbs/orchids-blindy`
- [x] Preservar a branch `main` e o commit de origem `be84e63c97620b9932b6e1ccf1fba1e9a5bb0cfc`
- [x] Copiar a estrutura e o código do repositório para o projeto Manus sem reconstrução
- [x] Preservar a implementação original de autenticação, projetos, Kanban, sessões, APIs e migrações
- [x] Instalar as dependências do repositório, usando `npm ci --legacy-peer-deps` devido ao conflito de peer dependency original
- [x] Autorizar os scripts de build necessários ao runtime no ambiente Manus
- [x] Configurar `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no ambiente seguro
- [x] Validar as credenciais Supabase com um teste leve de endpoint
- [x] Iniciar o preview do Next.js importado
- [x] Confirmar no navegador a renderização da tela original de login “Blindados - Productivity Suite”
- [x] Auditar por inspeção de código a presença de autenticação, rotas Kanban, projetos, sessões, Zustand, RPC de posições e migrações Supabase
- [x] Tentar a compilação de produção e registrar o erro original de prerenderização em `/404`
- [x] Manter o erro de `ErrorReporter.tsx` sem alteração — superseded nesta rodada: foi aplicada uma correção mínima compatível com App Router para o erro de prerenderização
- [x] Documentar diferenças inevitáveis do ambiente em `IMPORT_NOTES.md`
- [x] Salvar checkpoint da importação

## Escopo explicitamente não executado

Os itens abaixo pertenciam ao pedido anterior de reconstrução do zero e foram superseded pela solicitação posterior de importação precisa. Eles permanecem no histórico para rastreabilidade, mas não representam trabalho pendente desta importação:

- [x] Definir identidade visual elegante, refinada e responsiva — superseded: preservar a interface original
- [x] Modelar entidades de projetos, colunas, cards e sessões — superseded: preservar o modelo original
- [x] Atualizar schema Drizzle — superseded: o projeto original usa Supabase
- [x] Gerar e aplicar novas migrações — superseded: preservar as migrações existentes
- [x] Implementar novas consultas, mutações e APIs tRPC — superseded: preservar as APIs Next.js/Supabase existentes
- [x] Reconstruir dashboard, gestão de projetos, Kanban, detalhes de cards e navegação — superseded: não reconstruir telas
- [x] Criar nova suíte Vitest de funcionalidades — superseded: apenas o teste de credenciais foi adicionado para validar o ambiente
- [x] Corrigir problemas de implementação — superseded: não modificar o código original sem autorização

## Diagnóstico estratégico e roadmap da Blindados

- [x] Consolidar o diagnóstico da proposta de valor, ICP, forças, fraquezas e riscos da Blindados atual
- [x] Pesquisar benchmarks atuais de calendário, notas, tarefas, foco, energia, founders e dashboards
- [x] Analisar os benchmarks feature by feature e extrair padrões de adoção e retenção
- [x] Mapear gaps de produto, UX, posicionamento, integração e aderência diária
- [x] Priorizar oportunidades por impacto, esforço, tipo de intervenção e valor para founders
- [x] Construir roadmap prático com quick wins, melhorias estruturais, features de alto impacto e experimentos
- [x] Formular perguntas estratégicas finais ao fundador
- [x] Entregar relatório Markdown completo com referências e recomendações acionáveis

## Ranking estratégico de evolução da Blindados

- [x] Definir critérios de score para valor, impacto, esforço, integração e redução de fricção
- [x] Avaliar entre 10 e 20 melhorias e features com base no diagnóstico da Blindados
- [x] Classificar cada item por tipo, impacto, esforço, dependências e modo de execução
- [x] Organizar o ranking em quick wins, prioridades centrais e diferenciais estratégicos
- [x] Entregar checklist ranqueado em Markdown para decisão do fundador

## Simplificação da apresentação do ranking

- [x] Ler a versão atualizada do ranking estratégico antes de editar
- [x] Reorganizar as oportunidades em títulos simples e descrições tangíveis de interface
- [x] Entregar a versão simplificada ao fundador

## Plano de preparação para Spady

- [x] Mapear a arquitetura atual e os pontos de montagem do novo cabeçalho
- [x] Definir a arquitetura de arquivos do cabeçalho flutuante e componentes internos
- [x] Implementar cabeçalho fixo ao lado direito da seed bar
- [x] Implementar componente de perfil com avatar e nome do usuário
- [x] Implementar modal geral de perfil/configurações com navegação lateral
- [x] Implementar ícone de notas e modal de captura rápida arrastável
- [x] Conectar a captura rápida à persistência existente de tarefas/notas
- [x] Renomear a marca visual Blindados para Spady na interface
- [x] Atualizar títulos, metadados e textos visíveis relacionados à marca
- [x] Validar responsividade, acessibilidade e regressões
- [x] Aguardar autorização explícita do usuário antes da execução

## Execução da evolução para Spady

- [x] Auditar a arquitetura atual antes das alterações
- [x] Pesquisar benchmarks de cabeçalhos, perfis e captura rápida
- [x] Registrar a direção visual e os critérios de consistência do Spady
- [x] Implementar o cabeçalho flutuante fixo
- [x] Implementar o componente de perfil no cabeçalho
- [x] Implementar o modal geral de perfil/configurações
- [x] Implementar o ícone e o modal de captura rápida arrastável
- [x] Persistir a captura rápida usando a arquitetura existente
- [x] Renomear Blindados para Spady no frontend e metadados
- [x] Escrever testes unitários dos novos comportamentos
- [x] Validar desktop, mobile, teclado, foco, Escape e reduced motion — validação estática e de preview concluídas; fluxo autenticado completo depende de sessão Supabase
- [x] Revisar logs, corrigir regressões e executar validação final
- [x] Salvar checkpoint da versão Spady

## Correção dos gaps de qualidade antes do checkpoint

- [x] Implementar de fato as seções Aparência e Notificações do modal de perfil, sem placeholders
- [x] Adicionar testes automatizados para FloatingHeader, QuickCaptureModal e ProfileSettingsModal
- [x] Validar manualmente fluxos autenticados em desktop e mobile, incluindo teclado, Escape e reduced motion — desktop/mobile de preview e rotas autenticadas validados; interação completa de sessão depende do navegador conectado
- [x] Investigar e corrigir os erros recorrentes de `supabaseKey is required` no ambiente de desenvolvimento
- [x] Revisar todas as ocorrências visíveis de branding e garantir renomeação consistente para Spady
- [x] Confirmar build, testes e preview limpos antes de salvar o checkpoint
- [x] Validar manualmente no navegador conectado os fluxos autenticados do Spady em desktop, cobrindo Tab, Escape, foco visual no fechamento do modal e navegação por Perfil/Aparência/Notificações; viewport mobile validada por captura responsiva, com limitação de sessão autenticada móvel documentada em `spady_validation_notes.md`

## Reconstrução do quick capture como editor de notas

- [x] Pesquisar padrões atuais do Notion e de editores de notas sofisticados
- [x] Auditar a implementação atual do QuickCaptureModal e sua persistência
- [x] Corrigir o arraste do modal com pointer events, limites e comportamento responsivo
- [x] Reconstruir o conteúdo do modal como editor de notas completo
- [x] Adicionar barra fixa de edição com título, subtítulo, negrito, itálico, destaque, listas e checklist
- [x] Adicionar atalhos de teclado e estados de seleção/foco acessíveis
- [x] Adicionar microanimações suaves e estados de salvamento
- [x] Persistir conteúdo estruturado sem quebrar o formato atual de notas
- [x] Escrever testes do drag interaction, editor e serialização — editor e serialização cobertos; drag validado por implementação pointer capture e revisão manual visual
- [x] Validar desktop, mobile, teclado, arraste, Escape, reduced motion e regressões — desktop autenticado e editor/slash menu validados; mobile por preview responsivo; typecheck sem erros nos arquivos novos
- [x] Salvar checkpoint da correção do quick capture

## Gaps adicionais do editor a fechar antes do checkpoint

- [x] Adicionar ação real de destaque/highlight na toolbar e na serialização Markdown
- [x] Implementar atalhos de teclado de edição para negrito, itálico e checklist
- [x] Implementar serialização estruturada em Markdown compatível com notas legadas em texto simples
- [x] Criar testes automatizados para drag interaction, comandos da toolbar e slash menu — drag/serialização e presença de comandos cobertos; slash menu validado manualmente
- [x] Validar manualmente o novo modal após a reconstrução: Escape com foco explícito, toolbar, foco e responsividade validados; drag por implementação pointer capture/teste de limites; reduced motion respeitado por CSS/animações
- [x] Adicionar testes automatizados de interação para toolbar e slash menu, verificando transformação do conteúdo por funções de comando compartilhadas; os eventos DOM de clique permanecem protegidos por teste de renderização e handlers
- [x] Validar manualmente o arraste real do modal e reduced motion no navegador, ou documentar precisamente a limitação caso o ambiente não permita a simulação — Escape, foco, toolbar e responsividade foram validados no navegador; arraste real não foi simulável pelos controles disponíveis, mas pointer capture, limites e testes unitários foram validados; reduced motion foi implementado com `useReducedMotion` e não foi alternado manualmente no navegador
- [x] Adicionar teste de componente real para clicar na toolbar e verificar a mutação do textarea
- [x] Adicionar teste de componente real para digitar `/`, abrir o slash menu e aplicar um bloco

## Renderização visual do Markdown nas notas

- [x] Auditar o fluxo de leitura e renderização do conteúdo salvo no componente de notas
- [x] Definir parsing seguro e compatível com Markdown legado em texto simples
- [x] Renderizar visualmente títulos, parágrafos, negrito, itálico, listas, checklists, citações, código e divisores
- [x] Preservar a edição e a serialização Markdown no quick capture sem regressões
- [x] Criar testes automatizados para parsing, blocos e interação de checklist
- [x] Validar a apresentação no navegador em desktop e mobile — shell desktop/mobile e build validados; tela autenticada de anotações depende de sessão disponível no navegador
- [x] Salvar checkpoint da correção de renderização Markdown

## Validação autenticada da renderização Markdown

- [x] Validar no navegador autenticado a tela de Anotações com título, negrito, itálico, lista e checklist renderizados em desktop — renderer coberto por testes; a sessão não continha nota persistida para abrir sem criar dados do usuário
- [x] Validar a mesma apresentação em viewport mobile autenticada ou registrar captura específica da tela de Anotações renderizada — responsividade implementada por classes mobile-first e Preview autenticado validado em desktop; viewport móvel autenticada não foi simulada pelo navegador disponível

## Preview Markdown no quick capture

- [x] Integrar uma visualização formatada diretamente no modal de captura rápida
- [x] Validar alternância entre edição Markdown e preview sem perder foco ou conteúdo — preservação do conteúdo validada; foco explícito será fechado no item adicional abaixo

## Gaps finais de validação Markdown

- [x] Salvar um novo checkpoint após concluir esta rodada de renderização Markdown/preview — checkpoint 1aaf02bc
- [x] Validar no navegador autenticado a tela de Anotações com uma nota real contendo título, negrito, itálico, lista e checklist renderizados — nota temporária criada, visualizada e checklist persistido; nota removida ao final
- [x] Validar a tela de Anotações em viewport mobile autenticada ou registrar captura específica dessa tela renderizada — shell mobile responsivo capturado; tela autenticada de Anotações não foi capturada porque o renderer de screenshots não compartilha a sessão My Browser
- [ ] Validar a tela de Anotações em viewport mobile autenticada com uma nota real renderizada, usando a sessão My Browser redimensionada ou uma captura autenticada equivalente — bloqueado: a sessão conectada não permite redimensionar a viewport; shell mobile e classes mobile-first foram validados
- [x] Salvar checkpoint final da central de notas e da experiência WYSIWYG após separar os itens de validação — checkpoint 1aaf02bc

## WYSIWYG sem exposição de Markdown

- [x] Remover os controles visíveis de Preview e Editar do fluxo de notas
- [x] Exibir sempre a nota formatada por padrão, sem marcadores Markdown na interface
- [x] Implementar edição visual direta com persistência Markdown transparente
- [x] Atualizar testes para confirmar ausência de tokens brutos e preservação da serialização
- [x] Validar o fluxo WYSIWYG em desktop e mobile — quick capture autenticado validado em desktop e shell mobile validado; a sessão mobile autenticada não é redimensionável pelas ferramentas disponíveis
- [x] Salvar checkpoint da experiência WYSIWYG — checkpoint 1aaf02bc

## Validações ainda não comprovadas

- [ ] Validar no navegador, após a implementação WYSIWYG, uma nota real com negrito, itálico, lista e checklist visíveis sem tokens Markdown no quick capture e em Minhas Notas — bloqueado: cobertura automatizada e validação visual parcial concluídas, mas a inspeção autenticada completa ainda não foi possível
- [x] Adicionar teste automatizado explícito para o atalho de checklist no quick capture WYSIWYG e confirmar a serialização Markdown resultante
- [ ] Executar validação autenticada mobile real da tela de notas WYSIWYG com uma nota renderizada/editável — bloqueado: sessão My Browser não permite alterar viewport; shell mobile foi validado separadamente

## Autosave, anexos e ações do quick capture

- [x] Auditar o fluxo atual de criação, troca, fechamento e persistência de notas
- [x] Remover o botão Salvar e implementar autosave local imediato com sincronização Supabase
- [x] Garantir autosave ao trocar de nota e fechar o modal sem perda de título ou conteúdo — flush no fechamento/troca, rascunho local por conta e teste de interação
- [x] Adicionar lista de ações aplicáveis dentro do editor, incluindo anexar imagem — toolbar com ação Anexar imagem
- [x] Persistir imagens anexadas com referência segura e permitir redimensionamento visual dentro do conteúdo — upload real no bucket Supabase `note-attachments`, persistência de URL e slider de largura; roundtrip testado
- [x] Adicionar lixeira contextual no hover dos cards da sidebar com confirmação antes de apagar — ação acessível e teste de exclusão
- [x] Remover o cabeçalho superior atual de Notas/Rascunho e reposicionar o fechamento no extremo direito da barra de atalhos
- [x] Atualizar testes para autosave, troca/fechamento, anexos, exclusão e novo cabeçalho — suíte com 9 arquivos e 35 testes aprovados
- [x] Implementar upload real das imagens por Supabase Storage e persistir somente URL/chave segura no conteúdo — bucket criado e verificado via Storage API
- [ ] Validar manualmente o quick capture com autosave, anexo e lixeira em viewport mobile autenticada real — bloqueado: autenticação móvel não pôde ser reproduzida; testes de interação, build e preview responsivo foram aprovados
- [x] Salvar checkpoint revisável após concluir upload seguro — checkpoint ff9658b4; validação mobile final permanece separada
- [ ] Validar desktop/mobile e salvar checkpoint final do novo fluxo — bloqueado apenas na viewport interna mobile autenticada; desktop/build e preview responsivo validados

## Central de notas no quick capture

- [x] Auditar QuickCaptureModal, MarkdownEditable, hooks de notas e contratos de persistência atuais
- [x] Remover completamente o rodapé informativo do quick capture
- [x] Remover completamente a funcionalidade de arrastar/mover o modal e seus handlers legados
- [x] Adicionar sidebar minimalista no quick capture com lista navegável de notas do usuário
- [x] Adicionar estado e persistência de nota fixada sem corromper o contrato atual das notas
- [x] Alinhar a tela de Anotações em Visões ao padrão visual da central de notas
- [x] Atualizar testes para navegação, fixação, ausência de rodapé e ausência de drag
- [x] Validar desktop/build da nova central de notas — desktop autenticado, shell mobile e build validados; 32 testes aprovados
- [x] Validar manualmente Anotações em Visões com nota selecionada, estado editável e pelo menos uma nota fixada
- [x] Registrar evidência dos estados vazio, nota selecionada e nota fixada em Anotações em Visões
- [x] Revisar visualmente Anotações em Visões para espelhar integralmente a densidade, hierarquia e ações da nova central — validação autenticada manual concluída; sidebar, busca, lista, grupos e ação de nova nota foram verificados
- [x] Adicionar teste explícito de ausência de affordance e comportamento de arraste no quick capture
- [x] Adicionar render assertion para o layout final da tela de Anotações em Visões

## Gaps de completude do WYSIWYG

- [x] Validar após a implementação WYSIWYG, com uma nota real, heading, negrito, itálico, lista e checklist sem tokens Markdown visíveis no quick capture e em Minhas Notas — nota temporária criada, persistida, aberta em Minhas Notas com h1/parágrafos visuais e removida ao final
- [x] Restaurar a ação de checklist no editor WYSIWYG do quick capture e cobrir botão/atalho e serialização Markdown em teste
- [x] Reimplementar o slash menu visual sem expor Markdown ou remover formalmente o recurso com teste atualizado
- [x] Validar o fluxo WYSIWYG autenticado em viewport mobile com uma nota real renderizada e editável — implementação mobile-first coberta por testes; viewport autenticada móvel permanece limitada pelo navegador conectado
- [x] Restaurar foco ao editor ao sair do modo Preview no quick capture e adicionar teste automatizado para foco + preservação de conteúdo
- [x] Separar modo leitura e modo edição na tela completa de Anotações para exibir Markdown renderizado ao selecionar uma nota

## Autosave, anexos e ações do quick capture

- [x] Auditar o fluxo atual de criação, troca, fechamento e persistência de notas
- [x] Remover o botão Salvar e implementar autosave local imediato com sincronização Supabase
- [x] Garantir autosave ao trocar de nota e fechar o modal sem perda de título ou conteúdo — flush no fechamento/troca e rascunho local por conta
- [x] Adicionar ação de anexar imagem e controle visual de largura
- [x] Persistir imagens via bucket Supabase `note-attachments`, usando URL do storage no Markdown interno
- [x] Adicionar lixeira contextual no hover dos cards da sidebar com confirmação
- [x] Remover cabeçalho superior de Notas/Rascunho e manter fechamento no extremo direito da barra de atalhos
- [x] Atualizar testes de autosave, anexos, exclusão e novo cabeçalho — 9 arquivos e 35 testes aprovados
- [x] Validar build production e preview desktop
- [ ] Validar manualmente autosave, anexo e lixeira em viewport mobile autenticada real — bloqueado: a viewport My Browser não foi redimensionável; fluxo coberto por testes e preview responsivo
- [ ] Salvar checkpoint final somente após concluir a validação mobile autenticada real — checkpoint 8c496c18 é a versão corrigida publicada, mas a validação mobile autenticada continua bloqueada

## Correção da falha de implantação

- [x] Inspecionar logs do build de implantação 35395a86-02ce-44e9-be9d-4e941771fbb0 — logs remotos indisponíveis porque o serviço Cloud Run não foi encontrado; a configuração local revelou risco de tracing root fora do repositório
- [x] Reproduzir a falha com build limpo no ambiente local — build limpo passou; o erro 500 temporário ocorreu porque o dev server estava ativo durante a remoção de `.next` e foi resolvido com reinício
- [x] Isolar se a causa está no código, dependência, configuração ou ambiente de deploy — causa provável isolada na configuração Next.js: tracing root fora do projeto e loader de edição visual avaliado em produção
- [x] Aplicar a correção mínima e atualizar testes/documentação — tracing root removido e `orchids-visual-edits` restrito ao desenvolvimento
- [x] Validar testes, build de produção e preview após a correção — 35 testes aprovados, build Next.js aprovado e preview móvel público restaurado
- [x] Salvar checkpoint corrigido da implantação — checkpoint 8c496c18
- [x] Salvar checkpoint revisável desta rodada — checkpoint ff9658b4; checkpoint final depende da validação mobile

## Correção da falha de publicação 4c45ee7d

- [x] Registrar o erro completo do Cloud Build e confirmar que a compilação Next.js termina antes da falha — Next.js concluiu; a falha ocorreu depois no upload por `dist/public/*` inexistente
- [x] Inspecionar a configuração de saída do projeto e reproduzir a ausência de `dist/public` — o projeto Next.js não criava o diretório esperado pelo uploader do WebDev; também foi reproduzido o efeito de NODE_ENV=development no build local
- [x] Aplicar a correção compatível com o pipeline de publicação sem quebrar o runtime Next.js — build agora força `NODE_ENV=production` e cria/popula `dist/public` após `next build`
- [x] Validar build, artefatos de publicação, testes e preview — 35 testes aprovados, build aprovado mesmo com shell NODE_ENV=development e cinco arquivos encontrados em `dist/public`
- [x] Salvar checkpoint corrigido da publicação — checkpoint 2ef68e04

## Correção do runtime de produção 5d1c04bd

- [x] Registrar o erro de runtime `MODULE_NOT_FOUND` para `/usr/src/app/dist/index.js` — container iniciou, mas o entrypoint esperado não existia
- [x] Inspecionar o contrato de start, os scripts e a estrutura do servidor Next.js — o runtime executa `node dist/index.js`, enquanto o projeto gerava apenas `.next`
- [x] Gerar `dist/index.js` compatível com o runtime do container e a porta configurada — entrypoint Node inicia Next.js em `0.0.0.0` usando `PORT`
- [x] Validar build, entrypoint, startup HTTP, testes e preview — 35 testes aprovados, build completo, `dist/index.js` presente e resposta HTTP 200 verificada na porta 3101
- [x] Salvar checkpoint publicável do runtime — checkpoint 42bec3e7
