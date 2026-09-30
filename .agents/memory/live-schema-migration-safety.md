---
name: Segurança em migrations de schema ativo
description: Histórico legado e conferência de integridade quando usuários continuam operando o banco durante uma migration.
---

Não inicialize automaticamente o histórico de migrations de um schema legado registrando apenas um novo forward-fix.

**Why:** Sem uma baseline validada, arquivos históricos podem aparecer como pendentes e ser reaplicados contra um banco parcialmente migrado. Uma correção pontual não autoriza esse conjunto mais amplo de alterações.

**How to apply:** Inspecione o schema e o histórico remoto antes de usar uma sequência integral de migrations. Preserve o forward-fix versionado e trate a criação de uma baseline como trabalho separado; não marque migrations antigas como aplicadas sem conferir seus efeitos.

Verifique a preservação dos registros atomicamente durante a migration; não restaure um backup apenas porque um fingerprint mudou em uma conferência posterior.

**Why:** Durante uma verificação de navegador isolada, uma sessão real reordenou cards no mesmo banco. Os fingerprints eram idênticos imediatamente após a migration, mas posições e timestamps mudaram depois por uma operação autenticada legítima.

**How to apply:** Diferencie alterações de schema de gravações concorrentes, compare os campos que mudaram e confirme a operação nos logs sem expor identificadores ou conteúdo. Preserve as alterações legítimas dos usuários; limpe somente os dados de teste criados pela própria verificação.