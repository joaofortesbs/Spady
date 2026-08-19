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
- [x] Manter o erro de `ErrorReporter.tsx` sem alteração, pois o usuário solicitou preservação precisa do repositório
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
