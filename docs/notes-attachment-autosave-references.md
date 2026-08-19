# Referências de autosave, fixação e anexos

## Decisões aplicadas

A organização da sidebar segue o padrão documentado do Apple Notes: notas fixadas ficam no topo, notas recentes seguem ordenadas por edição, e a fixação é uma ação contextual na lista. A documentação oficial também descreve anexos de imagens e outros arquivos diretamente no corpo da nota.

Para imagens, a referência do Notion orienta inserção como bloco no corpo, redimensionamento por controles laterais e persistência do bloco com dimensões; nesta implementação, o Spady usa uma sintaxe Markdown interna própria (`![alt](src){width=NN}`), renderizada visualmente como imagem e controlada por um slider de largura, sem expor os marcadores ao usuário.

## Fontes

1. Apple Support — Sort and pin notes on Mac: https://support.apple.com/guide/notes/sort-and-pin-notes-apdb54e469b6/mac
2. Apple Support — Add photos, videos, and more to notes on Mac: https://support.apple.com/guide/notes/add-photos-videos-and-more-apd7e1c7c2b/mac
3. Notion Help — Images, files & media: https://www.notion.com/help/images-files-and-media
