# Listas — armazenamento local

## Escopo e integração

Listas é uma seção pessoal do shell existente, não uma nova aplicação ou rota pública. A sidebar e a página usam o mesmo tipo de navegação. O identificador da conta vem do contexto já existente, sem novas consultas de autenticação.

**Proibição de acesso remoto:** o desenvolvimento e os testes deste módulo não consultam nem alteram o Supabase, não usam SQL, migrations, RPCs, buckets ou uploads. O módulo não possui rotas de API. As outras seções e seu funcionamento remoto não foram migrados nem substituídos.

## Responsabilidades

- `src/lib/types/navigation.ts`: contrato compartilhado das seções.
- `src/lib/listas/model.ts`: tipos, schema versionado, validação de integridade, limite de cinco imagens e ordem dos itens.
- `src/lib/listas/localRepository.ts`: leitura validada e gravação exclusiva no localStorage, com erro explícito, proteção por revisão e Web Locks.
- `src/lib/listas/images.ts`: decodificação e redução de imagens no navegador; nunca envia arquivos.
- `src/hooks/useListasData.ts`: ciclo de restauração e salvamento, operações do domínio e aviso de alterações entre abas.
- `src/components/listas/`: interface, formulários, galeria, modais e ordenação acessível.

Listas, itens e imagens ficam em um snapshot JSON versionado por conta. A sequência dos arrays é a ordem canônica; números visíveis são derivados da posição, evitando duas fontes concorrentes de numeração. A primeira imagem é a capa, mas escolher outra miniatura para inspeção não modifica sua ordem.

Não usar `safeStorage` para esconder falhas: ausência de dados, dados inválidos e armazenamento indisponível têm comportamentos diferentes. Não escrever valores iniciais durante a restauração. Nenhum fallback para memória, IndexedDB ou nuvem.

## Limitações que devem ficar visíveis

- Dados somente neste navegador, perfil e origem; não há sincronização, backup ou durabilidade equivalente a um banco.
- Limpar os dados do site pode apagar tudo. Mudar de domínio/origem cria outro espaço local.
- A separação por conta impede mistura acidental na interface; **não** oferece proteção contra alguém com acesso ao navegador ou ao JavaScript dessa origem.
- O localStorage tem quota compartilhada com o restante da plataforma. Cinco imagens é o limite por item, não uma promessa de capacidade total.
- Imagens JPG/PNG/WebP são reprocessadas localmente, com dimensão máxima de 1.000 pixels e compressão WebP, para reduzir espaço; isso pode remover metadados, animação e detalhes do original. Quando WebP não estiver disponível, o navegador pode produzir PNG.
- Navegadores sem Web Locks podem ler dados, mas não salvar: a interface informa a necessidade de um navegador atualizado, em vez de arriscar gravações simultâneas.
- Uma aba que encontra uma revisão antiga recusa o salvamento e mantém o formulário. Recarregar dados não deve autorizar sobrescrever um item que mudou enquanto era editado.

## Referências verificadas

Pesquisa em documentação pública dos produtos. As observações abaixo são evidências textuais de comportamento, não uma alegação de inspeção visual das áreas autenticadas.

| Fonte | Evidência observada | Aplicação / o que evitar |
| --- | --- | --- |
| [Raindrop — Collections](https://help.raindrop.io/collections) | Coleções agrupam conteúdo e são criadas no contexto da navegação; um item tem uma coleção. | Contexto de seleção explícito e vínculo inequívoco item/lista. Não importar compartilhamento, tags ou coleções aninhadas. |
| [Raindrop — Bookmarks](https://help.raindrop.io/bookmarks) | Prévia com título, descrição e miniatura; ação de adicionar dentro da coleção; ordenação manual por arraste. | Cards compactos e criação contextual, com ordem manual única. Não adicionar outros modos de ordenação ou filtros. |
| [Shopify — Adding product media](https://help.shopify.com/en/manual/products/product-media/add-media) | Seção de mídia com adição pelo dispositivo; primeiro arquivo define a mídia principal; alterações são salvas explicitamente. | Primeira imagem como capa, galeria selecionável e rascunho até salvar. Não copiar limites, uploads remotos ou funções de comércio. |

Cards 16:9, badge circular, dois containers e miniaturas aproximadamente 1:5 são requisitos do usuário, não conclusões atribuídas às referências. As cores, tipografia e raios vêm da plataforma atual. Uma URL consultada de Linear e uma página de exemplos de Embla retornaram página inexistente e não foram usadas como evidência. Não foi necessário depender de galerias com login para definir o fluxo.

## Verificação sem Supabase

Testes automatizados usam localStorage simulado e dados de contas fictícias; testes da integração do shell simulam seus hooks e cliente remoto. A revisão visual deve importar os componentes reais em um ambiente isolado e temporário, sem montar os providers e efeitos remotos da página principal. Não criar uma rota permanente que contorne autenticação para testes.

### Validação realizada

- 33 testes automatizados: repositório, preparação de imagens, ciclo do hook, navegação/sidebar, fluxos completos de criação/inspeção/edição/ordenação/restauração e regressões do shell. Cobrem quota excedida, corrupção, conta diferente, concorrência e preservação após o logout existente.
- TypeScript e ESLint dos arquivos alterados aprovados; build de produção com Turbopack concluído.
- Capturas dos componentes reais em desktop (1440×1000) e celular (402×874), em um harness temporário sem autenticação real nem providers remotos. A política desse harness bloqueou a fonte externa já usada pelo app; ele utiliza fonte de fallback.
- A interface autenticada da página principal não foi inspecionada para evitar acionar seus efeitos remotos preexistentes. Os testes DOM simulam processamento de arquivos, e a conversão de imagem tem teste próprio com canvas simulado; o arraste físico de mouse/toque não foi exercitado em navegador automatizado.
- Não executar `test:publish` nesta tarefa: seu smoke test não faz parte do ambiente isolado. Para verificar o build, parar o servidor de desenvolvimento durante `npm run build`, pois os dois compartilham `.next`, e reiniciá-lo em seguida.
