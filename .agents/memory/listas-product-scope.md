---
name: Escopo de Listas
description: Regras de produto declaradas para a nova seção Listas.
---

As listas pertencem à conta do usuário e devem integrar a sidebar atual, sem criar uma navegação ou aplicação independente.

**Why:** O usuário pediu uma nova seção dentro da plataforma existente, com as listas criadas na respectiva conta e preservação das outras seções.

**How to apply:** Manter a propriedade pessoal das listas mesmo quando o shell oferecer seleção de organizações; não presumir compartilhamento ou escopo organizacional.

Cada item aceita no máximo cinco imagens, com um modal de visualização e outro compartilhado entre criação e edição.

**Why:** O anexo do usuário completa a mensagem inicial interrompida e especifica expressamente o limite e a reutilização do segundo modal.

**How to apply:** Aplicar o limite ao conjunto final de imagens, não somente a cada seleção de arquivos, e preservar as imagens existentes quando apenas os textos forem editados.

No escopo atual de Listas, não executar absolutamente nada no banco de dados Supabase externo atual. As criações e alterações da seção devem ficar salvas completamente no localStorage por enquanto, inclusive imagens e ordenação.

**Why:** O usuário substituiu expressamente a persistência remota prevista na proposta por armazenamento local e proibiu operações no Supabase dentro desta tarefa.

**How to apply:** Não consultar nem alterar o banco, executar migrations/RPCs ou usar uploads remotos para desenvolver ou testar Listas. Manter a persistência local até nova orientação, sem mudar o comportamento remoto das seções existentes.
