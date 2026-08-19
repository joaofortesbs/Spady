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
- [ ] Salvar checkpoint da versão Spady

## Correção dos gaps de qualidade antes do checkpoint

- [x] Implementar de fato as seções Aparência e Notificações do modal de perfil, sem placeholders
- [x] Adicionar testes automatizados para FloatingHeader, QuickCaptureModal e ProfileSettingsModal
- [x] Validar manualmente fluxos autenticados em desktop e mobile, incluindo teclado, Escape e reduced motion — desktop/mobile de preview e rotas autenticadas validados; interação completa de sessão depende do navegador conectado
- [x] Investigar e corrigir os erros recorrentes de `supabaseKey is required` no ambiente de desenvolvimento
- [x] Revisar todas as ocorrências visíveis de branding e garantir renomeação consistente para Spady
- [x] Confirmar build, testes e preview limpos antes de salvar o checkpoint
- [x] Validar manualmente no navegador conectado os fluxos autenticados do Spady em desktop, cobrindo Tab, Escape, foco visual no fechamento do modal e navegação por Perfil/Aparência/Notificações; viewport mobile validada por captura responsiva, com limitação de sessão autenticada móvel documentada em `spady_validation_notes.md`
