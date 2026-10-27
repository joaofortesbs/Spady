# Listas — persistência no Supabase externo

## Destino e escopo

Listas usa o **mesmo projeto Supabase externo e a mesma autenticação da plataforma**. Não usa o PostgreSQL do Replit. A identidade sempre vem da sessão autenticada, nunca de um proprietário arbitrário recebido da interface. As outras seções e os registros dos usuários existentes não foram migrados.

O localStorage deixou de ser a fonte de gravação de Listas. Ele é lido somente para importar a versão antiga, e a cópia original é preservada. Criação de lista, confirmação de item, edição, remoção de imagem no editor e reordenação passam pelo Supabase antes da confirmação na interface.

## Mapeamento completo

| Tabela/campo | Origem e finalidade |
|---|---|
| `listas_lists.user_id` | Proprietário da sessão; chave estrangeira para `auth.users`. |
| `listas_lists.id` | Identidade estável da lista, preservada na importação. |
| `listas_lists.name`, `description` | Nome e descrição, limites 240 e 10.000 caracteres. |
| `listas_lists.position` | Ordem no carrossel, iniciando em zero. |
| `listas_lists.created_at`, `updated_at` | Datas geradas pelo banco; criação preservada em edições. |
| `listas_items.user_id`, `list_id`, `id` | Identidade do item e vínculo obrigatório com a lista da mesma conta. |
| `listas_items.title`, `description` | Textos do item, limites 240 e 10.000 caracteres. |
| `listas_items.position` | Ordem vertical canônica. O número exibido é posição + 1. |
| `listas_items.created_at`, `updated_at` | Criação e última alteração dos campos persistidos do item. |
| `listas_images.user_id`, `item_id`, `id` | Identidade da imagem e vínculo com o item da mesma conta. |
| `listas_images.name` | Nome original, até 500 caracteres. |
| `listas_images.position` | Ordem na galeria, de 0 a 4. Posição zero é a capa. |
| `listas_images.object_path` | Caminho privado imutável: conta/hash da identidade e conteúdo. |
| `listas_images.mime_type`, `byte_size` | Tipo JPEG/PNG/WebP e tamanho, máximo 10 MB por imagem. |
| `listas_images.created_at` | Registro de criação da referência. |
| `listas_accounts.revision`, `updated_at` | Revisão atômica por conta e data da última confirmação. |
| `listas_imports.import_key`, `created_at` | Identificação idempotente do snapshot antigo importado. |
| Bucket `listas-images` | Binário real das imagens; privado, com limite e tipos permitidos. |

Seleção de lista, miniatura em inspeção, modal aberto e rascunhos não confirmados são estado de interface, não dados de domínio gravados no banco. Selecionar uma miniatura não muda a capa. Imagens continuam sendo reduzidas para até 1.000 pixels no navegador antes do envio; não existe upload do arquivo original em paralelo.

## Organização do código

- `src/lib/listas/model.ts`: contrato validado, imagens locais novas e referências remotas.
- `src/lib/listas/remoteRepository.ts`: sessão, leitura, gravação transacional e importação idempotente.
- `src/lib/listas/remoteImages.ts`: upload imutável, verificação de tamanho e limpeza de objetos sem referência.
- `src/lib/listas/localRepository.ts`: compatibilidade somente para ler/importar o legado; não é mais o repositório usado para criar ou editar.
- `src/hooks/useListasData.ts`: carregamento, importação, estado confirmado e isolamento de respostas antigas ao trocar de conta.
- `src/app/api/listas/images/route.ts`: entrega autenticada de imagens confirmadas, sem cache compartilhado.
- `src/components/listas/`: UI preservada, sem uma segunda navegação ou aplicação.

## Fluxo de leitura e importação

1. Validar a sessão existente e carregar um snapshot consistente usando `listas_read_v1`.
2. Ler somente a chave local da conta atual. Se não houver listas locais, usar diretamente o snapshot remoto.
3. Calcular uma chave a partir da revisão local e consultar o registro de importação.
4. Se já foi importado, não reenviar imagens nem substituir alterações remotas posteriores.
5. Se ainda não foi importado, enviar as imagens e chamar `listas_commit_v1` no modo de importação.
6. A transação anexa as listas locais às remotas e registra a chave de importação. Repetir a mesma solicitação retorna o estado confirmado sem duplicação.
7. Não apagar o snapshot local, inclusive após sucesso.

O servidor não pode ler o localStorage de outros navegadores ou domínios. A importação acontece quando cada usuário acessar Listas no navegador/origem que guarda os dados antigos. Não se pode afirmar que todas as listas antigas de todos os usuários já foram importadas sem que eles façam esse acesso.

Uma cópia local divergente cujos IDs já existem remotamente, mas sem a mesma chave de importação, é recusada: não sobrescrever nem duplicar silenciosamente. O dado local permanece preservado para reconciliação. Erros de leitura local também são explícitos; uma conta que possui dados remotos continua vendo sua cópia remota confirmada.

## Gravação e falhas

1. Preparar uma cópia destacada do estado confirmado.
2. Enviar somente imagens novas. O nome do objeto é determinístico; repetir um upload cujo retorno se perdeu não substitui arquivos.
3. Enviar os metadados, a ordem completa e a revisão esperada para a RPC.
4. A RPC compara o proprietário com `auth.uid()`, serializa por conta, valida os vínculos e arquivos existentes e confirma tudo em uma transação.
5. A UI só adota a resposta após sucesso. Conflitos retornam HTTP 409/`PT409`, mantêm o formulário e pedem atualização explícita.
6. Após a confirmação, tentar remover imagens que perderam sua referência. A regra de Storage impede apagar qualquer imagem ainda confirmada.

Não há confirmação offline ou fallback silencioso para o localStorage. Uma falha de conexão pode ter resultado ambíguo; a revisão e a chave de importação permitem reler sem sobrescrever versões mais novas. Não atualizar automaticamente os dados sob um editor aberto.

Uploads interrompidos sem referência por mais de 24 horas são limpos oportunisticamente no próximo carregamento da seção. A limpeza é paginada e não apaga referências confirmadas. Não há um job agendado global; arquivos de contas que não voltarem a acessar a seção podem permanecer sem referência. Falhas de limpeza são avisadas no console, sem invalidar dados já confirmados.

## Segurança

As cinco tabelas têm RLS e acesso de leitura limitado ao proprietário. A role autenticada não pode gravar diretamente nelas; a mutação passa pela RPC para não contornar a revisão, os limites ou a ordenação. Relações compostas impedem vínculos entre contas. As RPCs usam `search_path` restrito, sessão obrigatória e checagem explícita de proprietário.

O bucket é privado e não permite sobrescrita por usuários. Políticas de Storage limitam caminhos à conta autenticada. A exclusão compartilha a trava usada na gravação e nega objetos referenciados. Nenhuma chave de serviço chega ao navegador. A rota de imagem exige sessão, caminho válido e referência confirmada; usa `private, no-store` e `nosniff`.

## Aplicação das migrations

Foram aplicados e verificados no Supabase externo:

- `supabase/migrations/006_listas_remote.sql`: estrutura, regras de acesso, RPCs e bucket.
- `supabase/migrations/007_listas_conflict_http.sql`: retorno de conflitos de negócio como HTTP 409.

O executor `node scripts/apply-listas-migration.cjs` confere o destino e checksums, usa TLS com certificado validado e registra somente este módulo em `listas_internal.migrations`. Ele **não** inicializa nem altera o histórico legado do Supabase e **não** reaplica migrations antigas. Não modificar arquivos já aplicados; criar uma nova migration.

O certificado público oficial pode ser obtido do link de CA do painel Supabase. O executor aceita seu caminho em `SUPABASE_CA_FILE`, com padrão `/tmp/supabase-ca.crt`; credenciais continuam exclusivamente nos Secrets.

## Verificação

- `node scripts/test-listas-sql.cjs`: PostgreSQL temporário local, sem segredos; aplica as migrations e testa isolamento, limites, rollback, ordem, concorrência, importação e proteção de arquivos.
- `npx vitest run src/lib/listas src/hooks/useListasData.test.tsx src/components/listas/ListasPage.test.tsx src/lib/types/navigation.test.tsx src/app/api/listas`: contrato remoto, UI, importação, falhas e rota privada, sem rede real.
- `node scripts/smoke-listas-remote.cjs --allow-temporary-users`: teste integrado explicitamente remoto; cria duas contas temporárias e remove contas e objetos em `finally`. Não usa dados de contas existentes.

O teste remoto confirmou upload, leitura posterior, edição, ordem, conflito HTTP 409, isolamento entre contas, bloqueio anônimo, importação idempotente, entrega de imagem autenticada e remoção de imagem sem referência. Respostas de download do Storage podem permanecer em cache após exclusão; conferir também a ausência do objeto nos metadados/listagem, não apenas repetir a mesma URL de download.
