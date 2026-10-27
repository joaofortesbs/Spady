---
name: Compilador de produção no Replit
description: Decisão sobre o compilador do build Next.js para evitar uma falha intermitente específica do publish.
---

Use o build de produção com Turbopack neste app enquanto ele permanecer no Next.js 15.5.

**Why:** O publish apresentou uma falha interna e intermitente do webpack em `WasmHash._updateWithBuffer`, mesmo após instalação, segurança e configuração terem passado. O mesmo código concluiu builds limpos repetidos, e o Turbopack oficial da mesma versão eliminou esse caminho e reduziu bastante o artefato.

**How to apply:** Preserve a limpeza de `.next` e a flag `next build --turbopack`. Antes de voltar ao webpack ou atualizar o major do Next, valide builds repetidos no ambiente de publish e o startup Autoscale.

Não valide builds de produção simultaneamente ao servidor de desenvolvimento neste app.

**Why:** Ambos escrevem no mesmo `.next`; a concorrência produziu um erro interno sobre a entrada `/_not-found`, embora a compilação estivesse correta. Com o servidor parado, o mesmo código concluiu o build.

**How to apply:** Pare o workflow de desenvolvimento para a validação do build e reinicie-o depois; não interprete artefatos concorrentes como falha do código ou motivo para trocar o compilador.