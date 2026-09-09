# Correção do comportamento Progressivo no Kanban

## Objetivo

Garantir que a opção `Progressivo` possa ser selecionada pelo menu de uma coluna existente, seja persistida no Supabase e permaneça correta após confirmação assíncrona, sincronização, remount, troca entre Flows/Painel e recarga.

A semântica atual não será alterada: colunas progressivas continuam numerando os cards na ordem de execução. As opções `Ativada` e `Conclusão` também devem continuar funcionando.

## Evidências e diagnóstico inicial

- O item visual `Progressivo` já existe e dispara `onChangeBehavior('progressive')`.
- O payload sobe para `onUpdateColumn(columnId, { behavior: 'progressive' })`.
- O erro observado aparece depois do clique, quando o serviço recebe uma confirmação falsa e o hook executa rollback.
- A confirmação atual verifica sucesso HTTP, `success` e `column.id`, mas não exige que `column.behavior` seja igual ao valor solicitado.
- Algumas normalizações usam `active` como fallback. Isso é aceitável para leituras legadas, mas pode mascarar uma gravação de `progressive` que não foi confirmada.
- Os testes atuais cobrem a criação de uma coluna progressiva, mas não o caminho menu de coluna existente → PATCH → confirmação/rollback.
- Migrations históricas têm mais de uma cadeia para `behavior`; instalações externas podem conservar uma constraint antiga ou usar um tipo incompatível.

## Solução escolhida

### 1. Contrato autoritativo de atualização

Manter a rota autenticada como único caminho de escrita. Para PATCH com `behavior`, a rota deverá:

1. validar autenticação, UUID, ownership e os três valores exatos;
2. atualizar a linha usando a projeção mínima compatível com instalações legadas;
3. verificar que a linha retornada contém o mesmo `id` e o mesmo `behavior` solicitado;
4. responder conflito/erro se o banco não confirmar o comportamento;
5. não transformar uma resposta incompleta em `active` durante uma gravação.

O serviço deverá considerar sucesso somente quando a resposta tiver `success: true`, o mesmo ID e o comportamento confirmado exatamente. O contrato de criação receberá a mesma proteção quando o usuário escolher `progressive`.

### 2. Reconciliação do estado otimista

O hook continuará mostrando a alteração otimista enquanto a operação estiver pendente, mas:

- substituirá a coluna temporária/antiga somente pelo registro confirmado;
- manterá o comportamento devolvido pelo servidor;
- restaurará estado e cache anteriores em erro, resposta incompleta ou divergente;
- não deixará uma resposta antiga de sincronização sobrescrever uma confirmação mais nova.

O feedback de erro permanecerá acionável e não deverá sugerir sucesso quando a persistência não foi confirmada.

### 3. Diagnóstico e forward-fix do schema

Antes de qualquer migration, executar consultas somente leitura para verificar:

- tipo (`TEXT` ou enum), default, `NOT NULL`;
- constraints que mencionam `behavior`;
- distribuição dos valores existentes.

Se houver uma lacuna, aplicar somente um forward-fix idempotente e direcionado:

- normalizar apenas valores `NULL` para `active`;
- remover somente a constraint antiga identificada;
- adicionar a constraint canônica com `active`, `completion` e `progressive`;
- ou adicionar o literal `progressive` ao enum, caso esse seja o tipo real.

Não serão removidas constraints desconhecidas, não haverá limpeza automática de dados e não serão reaplicadas migrations históricas concorrentes como substituição de diagnóstico.

## Cobertura de regressão

### Componente

- coluna inicialmente `active` → menu → `Progressivo`;
- coluna inicialmente `completion` → menu → `Progressivo`;
- confirmação do callback com ID correto e payload exato;
- rerender com `progressive`, check visual, badge e ordinal;
- seleção por teclado, foco e fechamento;
- erro de persistência com rollback visual.

### Serviço e rota

- PATCH para os três comportamentos;
- resposta confirmada com comportamento divergente ou ausente deve falhar;
- resposta sem linha deve falhar;
- comportamento inválido, casing incorreto, espaços e `null` devem ser rejeitados;
- ownership e autenticação continuam obrigatórios;
- POST progressivo exige confirmação progressiva.

### Hook e sincronização

- estado otimista e cache durante pendência;
- confirmação substitui o valor anterior;
- erro restaura `active` ou `completion`;
- remount, reload, troca de seção e projeto preservam o valor confirmado.

## Validação final

Executar:

1. testes direcionados de componente, hook, serviço e rota;
2. suíte completa Vitest;
3. `npm run typecheck`;
4. `npm run lint`;
5. `npm run build` com Turbopack;
6. workflow reiniciado e logs verificados;
7. preview autenticado nas larguras 320, 768, 1024 e 1440px.

O preview sem sessão será registrado como limitação, não como validação visual completa.

## Fora de escopo

- Alterar a semântica de numeração do Progressivo;
- reescrever drag-and-drop;
- mudar filtragem de cards por projeto/data;
- adicionar colaboração em tempo real;
- remover ou converter dados sem diagnóstico;
- criar fallback de gravação direta no cliente.

## Rollback

As alterações de aplicação serão pequenas e reversíveis por checkpoint. Qualquer forward-fix de schema deverá ser idempotente, limitado ao objeto diagnosticado e acompanhado de verificação da definição antes e depois.