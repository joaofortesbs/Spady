---
name: Segredos no servidor de desenvolvimento
description: Diagnóstico de variáveis públicas Supabase ausentes em um processo Next.js já iniciado.
---

Se o cliente Supabase reclamar que faltam URL ou chave pública, confirme apenas a existência dos segredos no ambiente de desenvolvimento e reinicie o workflow antes de mudar a integração.

**Why:** O processo de desenvolvimento exibiu erro de configuração mesmo com os segredos cadastrados e presentes no terminal; após o reinício, a página respondeu normalmente sem mudança no código.

**How to apply:** Quando o erro surgir depois de configurar ou alterar segredos, verifique a presença (sem imprimir valores) e reinicie o servidor para que o Next.js receba as variáveis públicas na compilação.