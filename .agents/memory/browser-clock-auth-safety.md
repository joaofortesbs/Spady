---
name: Relógio em testes autenticados
description: Evitar falsos erros de autenticação e de visibilidade ao simular virada do dia no navegador.
---

Não manter o relógio global do navegador avançado durante operações assíncronas
de uma página autenticada. Preferir simular o relógio específico da lógica de
dia civil, mantendo o relógio da autenticação real.

**Why:** SDKs de autenticação consultam o tempo global para expiração e renovação
de sessão. Avançar um dia pode iniciar renovações repetidas e terminar na tela de
login, confundindo uma falha do teste com uma falha do Kanban.

**How to apply:** testar regras de dia civil com um relógio separado do usado
pela autenticação. O relógio externo e o dia armazenado na interface têm ciclos
de vida independentes: restaurar um não restaura automaticamente o outro.