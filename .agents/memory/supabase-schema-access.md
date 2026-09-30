---
name: Acesso ao schema do Supabase externo
description: Limites de acesso ao schema do banco Supabase usado pela aplicação.
---

A chave de serviço usada pelo app autoriza operações no REST do Supabase e RPCs expostas, mas não concede por si só acesso a SQL administrativo nem à API de gerenciamento. Não use o banco PostgreSQL gerenciado pelo Replit como substituto do banco externo do app.

**Why:** A verificação do projeto externo autenticou no REST, mas não havia RPC SQL exposta e a mesma credencial recebeu 401 na API de gerenciamento do Supabase. A constraint que rejeita o comportamento Progressivo permanece no banco externo; editar migrations locais não a altera.

**How to apply:** Antes de prometer aplicar migrations nesse Supabase, confirme uma conexão PostgreSQL administrativa ou autorização da API de gerenciamento, inspecione o schema real e valide o destino. Se não houver acesso, explique a dependência sem criar uma rota ou RPC de execução SQL dentro do app.

A conexão PostgreSQL direta do Supabase pode estar disponível somente por IPv6, que não foi alcançável neste ambiente. Para migrations aqui, prefira a URI do shared **Session pooler**, com acesso IPv4, fornecida pelo próprio painel Connect; não invente a região ou o índice do host.

**Why:** A resolução do endpoint direto retornou apenas IPv6, e a conexão TCP não pôde ser estabelecida. A documentação do Supabase recomenda Session pooler para redes IPv4-only.

**How to apply:** Se a conexão direta falhar antes de autenticar, verifique as famílias de endereço sem imprimir detalhes da credencial e solicite a URI Session pooler do mesmo projeto. Autorização para migration não substitui conectividade.