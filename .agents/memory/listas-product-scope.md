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

Listas deve passar a persistir completamente no Supabase externo atual, incluindo listas, itens, ordenação e imagens, com as migrations e configurações necessárias.

**Why:** O usuário substituiu expressamente a restrição temporária de localStorage por persistência remota completa no Supabase já configurado.

**How to apply:** Usar o projeto Supabase externo existente, sem substituí-lo pelo banco Replit. Incluir os dados locais existentes no desenho da migração e não confundir a presença de arquivos SQL com aplicação confirmada no banco.

O armazenamento de Listas deve sobreviver à saída da conta, sem expor a conta anterior na interface da próxima sessão.

**Why:** Limpar a única cópia local antes de uma importação remota confirmada seria perda permanente dos dados, e não apenas limpeza de cache descartável.

**How to apply:** Preservar a cópia local enquanto não houver importação remota confirmada. Desmontar o estado em memória ao trocar de usuário e exibir apenas os dados da conta atual.

A interface padrão de Listas deve manter baixo ruído visual: sem faixa persistente de aviso de armazenamento local e sem controles visuais separados para mover itens.

**Why:** O usuário pediu explicitamente a retirada desses elementos para tornar a interface mais minimalista, sem pedir mudança da persistência ou remoção do arraste pelo card.

**How to apply:** Manter os erros reais de salvamento na interface. Preservar o arraste pelo próprio card e o acesso por teclado sem reintroduzir alça ou setas laterais.
