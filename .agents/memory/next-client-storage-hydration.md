---
name: Hidratação com armazenamento local
description: Regra para usar preferências e caches do navegador em componentes client do Next.js.
---

O primeiro render de um componente client precisa usar valores determinísticos compartilhados pelo servidor e pelo navegador; leia localStorage/sessionStorage somente depois da montagem e aplique o valor em um efeito.

**Why:** o servidor não possui armazenamento do navegador. Ler o valor durante um inicializador lazy pode produzir HTML diferente no cliente, causando falha de hidratação e erros secundários durante o Fast Refresh.

**How to apply:** inicialize com defaults estáveis, restaure cache/preferências em um efeito e só persista mudanças depois que a restauração inicial estiver concluída.