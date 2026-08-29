# Refeição Livre

Cardápio das redes de fast food com a tabela nutricional oficial de cada uma, organizado por
rede → tipo de alimento. Estático: `index.html` + `tokens.css` + `styles.css` + `app.js`, sem
build e sem dependências em runtime. Os cardápios são JSON em `data/`, lidos por `fetch`.

Deploy: Vercel, projeto estático, root = `index.html`. Sem variáveis de ambiente.
Dev: `npx serve . -l 8082` (porta fixa — ver a tabela no `README.md`).

## O dado é o produto

Este app é uma casca fina em volta de `data/`. O trabalho difícil está lá, e o
**[ATUALIZAR-CARDAPIO.md](ATUALIZAR-CARDAPIO.md)** é a referência para mexer nele — leia antes
de tocar em qualquer JSON. Três regras que não se negociam:

- **Campo que a fonte não publica é `null`, nunca `0`.** Um zero entra na soma da refeição e
  produz um total errado com cara de certo. Com `null` a UI mostra `—` e marca o total como parcial.
- **Nada de valor estimado.** Onde o PDF oficial imprime um número impossível, o campo fica
  `null` e o motivo vai para `observacoes` da rede. O app promete "número oficial"; um número
  derivado por nós quebra essa promessa mesmo quando está certo.
- **`node scripts/validar-dados.mjs` antes de cada commit.** Ele já pegou um erro sistemático
  de extração que passaria por qualquer conferência visual (ver abaixo).

## O validador não é burocracia

Foi ele que revelou que a tabela do Madero imprime os pares "por 100 g" e "por unidade de
consumo" em **ordem trocada** em parte dos pratos — as calorias numa ordem, os macros na outra.
A primeira extração pegou o número errado em dezenas de itens e *parecia* perfeita: nomes
certos, categorias certas, valores plausíveis. O que denunciou foi a conta de Atwater
(`4·carb + 4·prot + 9·gord` contra as kcal declaradas) estourando 20% em vários itens.

A lição para a próxima rede: **a plausibilidade de um número não é evidência de que ele é o
número certo.** O que amarra um valor à sua coluna é o `%VD` impresso ao lado dele — proteína
32 g com "63%" só fecha contra o VD de 50 g da RDC 429/2020. É a conferência mais barata que
existe num PDF nutricional, e é a única que pegou os dois erros desta série.

Cuidado com tabelas que misturam duas bases de VD: o PDF do BK tem linhas na RDC 429/2020
(proteína 50 g, sódio 2.000 mg) e linhas herdadas da RDC 360/2003 (proteína 75 g, sódio
2.400 mg). Só os percentuais mudam; os absolutos, que são os usados aqui, não. Um verificador
que assuma uma base só produz uma enxurrada de falsos positivos — foram 15, dos quais 11 eram
ruído.

## McDonald's: Cloudflare e o payload do Nuxt

O site do McDonald's devolve **403** para `curl`, `WebFetch` e Chrome **headless** — o headless
é detectado e fica parado na tela de verificação do Cloudflare, mesmo depois de 15 s. O que
passa é Chrome com janela: `HEADFUL=1 node .claude/skills/run-refeicao-livre/driver.mjs repl`,
com uns 20 s de espera depois do `goto`.

Uma vez dentro, o caminho barato não é navegar 165 páginas de produto: o site é Nuxt e **cada
página de categoria já traz a tabela nutricional completa de todos os seus produtos** no
`__NUXT_DATA__`. Um `fetch` de mesma origem a partir da aba liberada varre as 14 categorias sem
novo desafio. O payload é o formato achatado do devalue (os valores de um objeto são índices
para outras posições do array), então precisa de resolvedor recursivo — regex não lê.

E a armadilha que o validador pegou: **o site alterna ponto e vírgula como separador decimal no
mesmo campo** (`1767.93` e `1441,0`, ambos mg de sódio), e nunca usa separador de milhar. O
parser do BK, que trata ponto como milhar, aplicado aqui multiplica o sódio por 100 — sem isso
o app publicaria uma casquinha com 6.241 mg de sódio.

## Defeitos conhecidos das fontes

Estão registrados em `observacoes` de cada rede, mas vale saber que existem antes de "corrigir"
o extrator achando que o erro é nosso:

- **BK**: três células não fecham com o próprio `%VD` impresso. Em duas o valor absoluto
  confere com a conta de calorias e foi mantido; em duas o número é impossível (sódio de 3 mg
  marcado como 6% do VD; 45 g de gordura saturada num sanduíche com 21 g de gordura total) e o
  campo ficou `null`.
- **McDonald's**: três células impossíveis — gordura saturada acima da gordura total em dois
  itens (27 g num prato com 23 g; 31 g num com 9 g) e açúcares acima dos carboidratos noutro.
  Nos dois de gordura, a conta de calorias fecha com a gordura **total** publicada, o que aponta
  a saturada como o campo furado; mesmo assim ficou `null`, não estimado. A rede também não
  publica o peso da porção — daí `"1 porção"` no lugar dos gramas.
- **Madero**: o PDF repete o **mesmo bloco nutricional** em pratos diferentes — o trio
  `154 / 416 kcal / 20%` serve o Penne, o Ravioli e a salada de acompanhamento. E traz uma
  anotação interna, "Rever calculo", ao lado do Mini Pastel de Queijo. Os itens em que as
  calorias não fecham com os próprios macros levam o campo `alerta`, que a UI mostra no detalhe.

Não silencie esses avisos. Eles são informação sobre a fonte, não sujeira do nosso lado.

## Sistema de design

`tokens.css` é **cópia byte-idêntica** da do `Apps-Hub`; a spec canônica é o
`DESIGN-SYSTEM.md` de lá. Ao mudar um token, mude na spec e em todos os repos.

As cores de marca das redes (`#d62300` do BK, `#8b1a1a` do Madero) vivem em
`data/index.json` como **dado**, não em CSS — é o que permite acrescentar uma rede sem tocar
no stylesheet. Fora isso, nenhum hex solto além dos tokens locais no topo do `styles.css`.

Duas regras do sistema que este app tem mais chance de furar, porque ambas caem no número em
destaque:

- **Texto sobre preenchimento laranja é `--on-accent`**, nunca branco (chip ativo, barra da refeição).
- **Laranja como texto é `--accent-text`**, nunca `--accent` — no tema claro ele escurece para
  `#c2410c`, porque `#f97316` sobre `#fafafa` dá 2,7:1 e reprova AA. É o caso do `.item-kcal`.

Medido nos dois temas com as transições desativadas: tudo entre 4,68:1 e 17,72:1.

### Ao medir contraste, componha o alfa

`--accent-tint` é `rgba(249, 115, 22, 0.12)`. Ler o `backgroundColor` computado e comparar
direto com a cor do texto dá **1,00:1** no `.eyebrow` — texto laranja contra "fundo laranja" —
e parece uma reprovação catastrófica. Não é: falta compor o rgba sobre o fundo de baixo. O
valor real é 6,24:1 no escuro e 4,68:1 no claro.

Isso soma-se às quatro armadilhas já registradas no `CLAUDE.md` do WeightChartS (esperar a
transição de 0,2 s acabar, filtrar elementos ocluídos, resolver `:hover` por token-sonda, não
confiar em `shotfull` com `<canvas>`). A regra é a mesma: **meça, e depois confira a medição.**

## `file://` não serve este app

Diferente da Calculadora TMB, aqui há `fetch` de JSON — abrir o `index.html` do disco dá erro
de CORS. O `app.js` detecta `location.protocol === 'file:'` e mostra a instrução em vez de uma
tela vazia e silenciosa. Se um dia isso incomodar, a saída **não** é embutir os dados no HTML:
é o servidor local, que já é o fluxo dos outros apps do workspace.

## Pitfall herdado: o h1 some se transbordar

`.intro h1` usa `background-clip: text` com `color: transparent`. Se o texto passar da largura
da caixa, o excedente fica invisível — sem scrollbar, sem erro. "Refeição Livre" precisa de
~8,5× o font-size; há um `@media (max-width: 360px)` reduzindo o h1. Se mexer no título ou em
`--step-4`, meça de novo. (Aconteceu no Apps-Hub, está registrado lá.)

## Deploy

`vercel.json` é cópia do hub: `cleanUrls: true` e cabeçalhos de segurança. Duas conferências
depois de qualquer deploy que acrescente arquivo:

- **`data/*.json` são muitos e nascem não rastreados.** Se o `index.json` subir citando uma
  rede cujo arquivo ficou fora do `git add`, o build fica verde e a rede some sem erro. O
  `for` com `curl` está no `ATUALIZAR-CARDAPIO.md`.
- **Case sensitivity.** NTFS ignora, o Linux da Vercel não. Confira letra por letra.

Com `cleanUrls: true`, `.html` responde **308** e não 404 — sem `curl -L` parece que o arquivo
existe.

## Idioma

UI, mensagens e documentação em **português do Brasil**.
