---
name: Conflitos de negócio no Supabase REST
description: Diferenças observadas entre SQL local e o REST real em conflitos de revisão e downloads do Storage.
---

Conflitos esperados de revisão devem usar um erro de negócio explícito HTTP 409 (`PT409` no PostgREST), não simular uma falha transitória de serialização PostgreSQL.

**Why:** No Supabase externo deste projeto, o conflito emitido como SQLSTATE `40001` passou nos testes SQL diretos, mas repetidamente terminou em HTTP 504 pelo REST. O retorno `PT409` foi confirmado como HTTP 409 no teste integrado, preservando a rejeição atômica.

**How to apply:** Verificar o comportamento tanto no PostgreSQL quanto no endpoint REST real ao introduzir novas RPCs com controle de revisão. Não presumir que passar no teste SQL confirma o contrato HTTP.

Não usar somente um novo download da mesma URL como prova de exclusão física de uma imagem do Storage.

**Why:** Um download autenticado repetido ainda retornou conteúdo depois da exclusão; a listagem confirmou o objeto removido. Cache de entrega e presença nos metadados são verificações distintas.

**How to apply:** Validar também o resultado da remoção e a ausência na listagem. Entrega privada da aplicação deve verificar a referência confirmada antes de baixar e não usar cache compartilhado.
