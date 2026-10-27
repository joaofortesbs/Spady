# Listas — persistência no Supabase externo

Desenho aprovado pelo usuário: tabelas relacionadas, imagens em Storage privado e importação automática do armazenamento local.

## Mapeamento

- Conta: usuário da sessão Supabase existente; nenhuma conta anônima ou seleção de organização.
- Lista: id estável, user_id, name (240), description (10.000), position, created_at, updated_at.
- Item: id estável, user_id, list_id, title (240), description (10.000), position, created_at, updated_at.
- Imagem: id estável, user_id, item_id, name (500), position (0–4), object_path, mime_type, byte_size, created_at.
- Revisão: registro por conta, alterado somente numa transação confirmada.
- Importações: chave estável por snapshot local, registrada na mesma transação da importação.
- Imagem principal: posição zero. Selecionar uma miniatura para inspeção não altera a capa.

## Arquitetura e segurança

O repositório remoto substitui o repositório local no hook, preservando a interface e os formulários atuais. O modelo distingue imagens novas em data URL de referências remotas. O navegador usa a sessão já existente, nunca uma chave de serviço.

RPCs autenticadas leem um snapshot consistente e gravam os metadados de forma atômica, com trava por conta e revisão esperada. Tabelas têm RLS; gravações diretas são vedadas para impedir bypass da revisão e do limite de imagens. Vínculos compostos impedem relacionamentos entre contas diferentes.

O bucket é privado, limitado a JPEG/PNG/WebP. Objetos imutáveis são endereçados por hash e conta. URLs temporárias não são persistidas: a interface acessa uma rota autenticada que entrega a imagem, sem cache compartilhado. Referências do banco somente são confirmadas após os uploads; objetos ainda referenciados não podem ser apagados pelo usuário. Remoções e uploads interrompidos são tratados sem apagar imagens confirmadas.

## Migração e importação

Inspecionar o schema real e confirmar o projeto da conexão administrativa. Aplicar somente a nova migration, numa transação; não inicializar o histórico legado nem reaplicar arquivos anteriores.

Ao acessar Listas, ler o snapshot local da conta e importar automaticamente. Preservar IDs quando possível; importar sem substituir listas remotas existentes. Uma chave idempotente impede duplicação após timeout, recarga ou abas concorrentes. Cópia local permanece preservada. Dados locais inacessíveis ou inválidos geram erro explícito e não são substituídos por estado vazio.

## Falhas e concorrência

Nenhuma confirmação somente local. Conflitos rejeitam alterações sem sobrescrever o banco e mantêm o formulário. Falhas de rede, upload ou banco preservam a última versão confirmada e os rascunhos. Troca de conta cancela a aplicação de respostas antigas à interface. Atualização explícita relê o banco; foco/janela não pode substituir silenciosamente um editor aberto.

## Verificação

Testar validação, permissões, ordem completa, limite de imagens, rollback atômico, concorrência, importação idempotente, falhas de upload e restauração após remontagem. Validar SQL primeiro em PostgreSQL temporário isolado e depois verificar a migration no destino real. Testes remotos não devem modificar dados de usuários existentes.
