# Importação do repositório orchids-blindy

## Origem preservada

O projeto foi importado do repositório público `https://github.com/joaofortesbs/orchids-blindy`, branch `main`, commit `be84e63c97620b9932b6e1ccf1fba1e9a5bb0cfc` (abreviado: `be84e63`). A estrutura original foi copiada para o projeto Manus sem reconstrução da aplicação e sem substituição do código-fonte.

## Alterações adicionadas pelo ambiente

Foram mantidos os metadados necessários do projeto Manus fora da aplicação original. Também foi criado `server/supabase.env.test.ts` exclusivamente para validar as variáveis públicas necessárias ao carregamento do cliente Supabase, além deste arquivo e do `todo.md` de acompanhamento.

Para instalar as dependências no sandbox foi necessário executar `npm ci --legacy-peer-deps`, pois o lockfile original apresenta uma incompatibilidade de peer dependency entre `autumn-js@0.1.69` e `better-auth@1.3.10`. O serviço gerenciado da Manus usa pnpm; por isso, os scripts de build das dependências foram autorizados com `pnpm approve-builds --all` para permitir a execução de `sharp`, `bcrypt`, `esbuild`, `@tsparticles/engine` e `unrs-resolver`.

## Variáveis necessárias

A aplicação original depende de `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Essas variáveis foram configuradas no ambiente seguro do projeto. O teste leve de autenticação Supabase passou, confirmando que a URL e a chave pública são aceitas pelo endpoint de configurações.

## Validação

O preview de desenvolvimento está disponível e a página inicial original renderiza a tela de login “Blindados - Productivity Suite”. Portanto, a importação e a inicialização em desenvolvimento foram concluídas.

A compilação de produção (`npm run build`) compila o bundle, mas falha durante o prerender de `/404` com o erro `Html should not be imported outside of pages/_document`. A origem observada está no componente original `src/components/ErrorReporter.tsx`, que retorna uma árvore `<html>` e `<body>` quando recebe um erro global. Esse arquivo não foi alterado para manter a importação fiel; a correção fica registrada como pendência separada caso o usuário autorize ajustes no código original.

## Escopo preservado

Nenhum recurso foi reconstruído do zero. O estado entregue corresponde ao repositório existente, com as únicas adições explicitamente descritas acima para integração operacional e rastreabilidade do ambiente Manus.
