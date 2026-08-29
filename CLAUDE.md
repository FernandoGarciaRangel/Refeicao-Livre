# Refeição Livre

Cardápio das redes de fast food com a tabela nutricional **oficial** de cada uma,
organizado por rede → tipo de alimento. Estático: `index.html` + `tokens.css` +
`styles.css` + `app.js`, sem build e sem dependências em runtime.

Deploy: Vercel, projeto estático, root = `index.html`. Sem variáveis de ambiente.
Dev: `npx serve . -l 8082` (porta fixa — ver `README.md`).
Repo: `FernandoGarciaRangel/Refeicao-Livre`.

---

## O requisito que manda em tudo: atualizar cardápio tem que ser barato

**Os restaurantes mudam o cardápio o tempo todo.** Item novo, item que sai, preço
e receita que mudam, produto sazonal que volta. Se atualizar aqui custar mais que
editar uma linha, o app envelhece e passa a mentir — e um guia nutricional
desatualizado é pior que nenhum.

Toda decisão de arquitetura deste repo sai daí:

- **O dado não está no código.** Os cardápios são JSON em `data/`, um arquivo por
  rede. Acrescentar um item é acrescentar um objeto; corrigir uma caloria é
  trocar um número. Não se toca em HTML, CSS ou JS para isso.
- **Não há build.** Nada compila, nada gera bundle, não existe passo entre editar
  o JSON e ver na tela. Salvou, recarregou, está lá.
- **Acrescentar uma rede inteira é criar um arquivo.** `data/<slug>.json` mais uma
  linha em `data/index.json`. A cor da marca, a logo e a inicial do badge vêm do
  dado, não do CSS — por isso não existe stylesheet a editar quando entra uma
  rede.
- **O vocabulário de categorias é compartilhado.** `data/categorias.json` define
  os tipos de alimento; as redes só referenciam slugs. "Bebidas" é a mesma coisa
  nas três, e uma categoria nova entra num lugar só.
- **O validador é a rede de proteção.** `node scripts/validar-dados.mjs` roda sem
  dependência nenhuma e recusa o commit se o schema, as faixas, as duplicatas ou
  a coerência entre calorias e macros não fecharem. É o que permite editar com
  confiança em vez de conferir na mão.

O procedimento completo — de onde baixar cada fonte, o formato do item, o que o
validador cobra — está em **[ATUALIZAR-CARDAPIO.md](ATUALIZAR-CARDAPIO.md)**.
**Leia antes de tocar em qualquer JSON.**

**Ao mexer neste app, não introduza nada que quebre isso.** Concretamente: nada
de mover cardápio para dentro do HTML, nada de etapa de build, nada de banco de
dados, nada de campo que exija editar código para aparecer na tela. Se uma
funcionalidade nova só funcionar com dado no código, ela está errada para este
repo.

### As três regras do dado

1. **Campo que a fonte não publica é `null`, nunca `0`.** Um zero mentiroso entra
   na soma da refeição e produz um total errado com cara de certo. Com `null` a
   UI mostra `—` e marca o total como parcial.
2. **Nada de valor estimado.** Onde a fonte oficial imprime um número impossível,
   o campo fica `null` e o motivo vai para `observacoes` da rede. O app promete
   "número oficial"; um número derivado por nós quebra a promessa mesmo quando
   está certo.
3. **`fonte` e `verificadoEm` são obrigatórios por rede.** É o que deixa o rodapé
   dizer de onde veio o número e quando foi conferido — e o que torna auditável
   um dado que vai envelhecer.

---

## O validador não é burocracia

Foi ele que revelou que a tabela do Madero imprime os pares "por 100 g" e "por
unidade de consumo" em **ordem trocada** em parte dos pratos — as calorias numa
ordem, os macros na outra. A primeira extração pegou o número errado em dezenas
de itens e *parecia* perfeita: nomes certos, categorias certas, valores
plausíveis. O que denunciou foi a conta de Atwater
(`4·carb + 4·prot + 9·gord` contra as kcal declaradas) estourando 20%.

E foi ele de novo que pegou o sódio do McDonald's multiplicado por 100, quando
reaproveitei no site o parser de números escrito para o PDF do BK.

A lição para a próxima rede: **a plausibilidade de um número não é evidência de
que ele é o número certo.** O que amarra um valor à sua coluna é o `%VD` impresso
ao lado dele — proteína 32 g com "63%" só fecha contra o VD de 50 g da RDC
429/2020. É a conferência mais barata que existe num PDF nutricional, e é a única
que pegou os dois erros desta série.

Cuidado com tabelas que misturam duas bases de VD: o PDF do BK tem linhas na RDC
429/2020 (proteína 50 g, sódio 2.000 mg) e linhas herdadas da RDC 360/2003
(proteína 75 g, sódio 2.400 mg). Só os percentuais mudam; os absolutos, que são
os usados aqui, não. Um verificador que assuma uma base só produz enxurrada de
falso positivo — foram 15, dos quais 11 eram ruído.

## McDonald's: Cloudflare e o payload do Nuxt

O site devolve **403** para `curl`, `WebFetch` e Chrome **headless** — o headless
é detectado e fica parado na verificação, mesmo depois de 15 s. O que passa é
Chrome com janela: `HEADFUL=1 node .claude/skills/run-refeicao-livre/driver.mjs repl`,
com uns 20 s de espera depois do `goto`.

Uma vez dentro, o caminho barato não é navegar 165 páginas de produto: o site é
Nuxt e **cada página de categoria já traz a tabela nutricional completa de todos
os seus produtos** no `__NUXT_DATA__`. Um `fetch` de mesma origem a partir da aba
liberada varre as 14 categorias sem novo desafio. O payload é o formato achatado
do devalue (os valores de um objeto são índices para outras posições do array),
então precisa de resolvedor recursivo — regex não lê.

E a armadilha que o validador pegou: **o site alterna ponto e vírgula como
separador decimal no mesmo campo** (`1767.93` e `1441,0`, ambos mg de sódio), e
nunca usa separador de milhar.

## Defeitos conhecidos das fontes

Estão em `observacoes` de cada rede, mas vale saber que existem antes de
"corrigir" o extrator achando que o erro é nosso:

- **McDonald's**: três células impossíveis — gordura saturada acima da gordura
  total em dois itens (27 g num prato com 23 g; 31 g num com 9 g) e açúcares
  acima dos carboidratos noutro. Nos dois de gordura a conta de calorias fecha
  com a gordura **total** publicada, o que aponta a saturada como o campo furado;
  mesmo assim ficou `null`, não estimado. A rede também não publica o peso da
  porção — daí `"1 porção"` no lugar dos gramas.
- **BK**: três células não fecham com o próprio `%VD` impresso. Em duas o valor
  absoluto confere com a conta de calorias e foi mantido; em duas o número é
  impossível (sódio de 3 mg marcado como 6% do VD; 45 g de saturada num sanduíche
  com 21 g de gordura total) e o campo ficou `null`.
- **Madero**: o PDF repete o **mesmo bloco nutricional** em pratos diferentes — o
  trio `154 / 416 kcal / 20%` serve o Penne, o Ravioli e a salada de
  acompanhamento. E traz uma anotação interna, "Rever calculo", ao lado do Mini
  Pastel de Queijo. Os itens em que as calorias não fecham com os próprios macros
  levam o campo `alerta`, que a UI mostra no detalhe.

Não silencie esses avisos. São informação sobre a fonte, não sujeira nossa.

## Bob's: avaliado e recusado

Não foi falta de fonte — foi incompatibilidade de base. O Bob's publica **por
100 g**, não por porção (`Porção: 100 g (3/7 unidade)`, `258 kcal` no Big Bob).
Lado a lado com um Whopper de 717 kcal por unidade, e somado no mesmo prato,
apareceria com pouco mais de um terço; a unidade inteira dá ~602 kcal. Converter
pela fração daria número calculado por nós; publicar como está tornaria a
comparação enganosa. Some-se que a tabela sai só como **imagem PNG por produto**.
Detalhe em `ATUALIZAR-CARDAPIO.md`.

## Sistema de design

`tokens.css` é **cópia byte-idêntica** da do `Apps-Hub`; a spec canônica é o
`DESIGN-SYSTEM.md` de lá. Ao mudar um token, mude na spec e em todos os repos.

As cores de marca das redes vivem em `data/index.json` como **dado**, não em CSS
— é o que permite acrescentar uma rede sem tocar no stylesheet. Fora isso, nenhum
hex solto além dos tokens locais no topo do `styles.css`.

O mesmo vale para a logo do badge: o campo `logo` aponta para
`assets/logos/<slug>.svg`, e quando ele não existe o badge cai na `inicial`.
Manter os dois caminhos é o que impede que entrar uma rede passe a depender de
ter arte pronta. As artes são **brancas por dentro do arquivo** — via `<img>` o
SVG não herda o `color` da página, então `currentColor` ali não pinta nada. O
formato exigido está em `ATUALIZAR-CARDAPIO.md`.

Num badge de 46 px, **símbolo funciona e wordmark não**. O Madero é só a palavra
em serifa: o badge dele usa o **M** recortado do wordmark oficial e vetorizado,
não uma letra redesenhada — mesma razão que vale para os números, de não
inventar o que a fonte não deu.

Duas regras do sistema que este app tem mais chance de furar, porque ambas caem
no número em destaque:

- **Texto sobre preenchimento laranja é `--on-accent`**, nunca branco (chip
  ativo, barra da refeição).
- **Laranja como texto é `--accent-text`**, nunca `--accent` — no tema claro ele
  escurece para `#c2410c`, porque `#f97316` sobre `#fafafa` dá 2,7:1 e reprova
  AA. É o caso do `.item-kcal`.

Medido nos dois temas com as transições desativadas: tudo entre 4,68:1 e 17,72:1.

### Ao medir contraste, componha o alfa

`--accent-tint` é `rgba(249, 115, 22, 0.12)`. Ler o `backgroundColor` computado e
comparar direto com a cor do texto dá **1,00:1** no `.eyebrow` — texto laranja
contra "fundo laranja" — e parece reprovação catastrófica. Não é: falta compor o
rgba sobre o fundo de baixo. O valor real é 6,24:1 no escuro e 4,68:1 no claro.

Isso soma-se às quatro armadilhas já registradas no `CLAUDE.md` do WeightChartS
(esperar a transição de 0,2 s, filtrar elementos ocluídos, resolver `:hover` por
token-sonda, não confiar em `shotfull` com `<canvas>`). A regra é a mesma:
**meça, e depois confira a medição.**

## Testar

```bash
node scripts/validar-dados.mjs                              # os JSON
node .claude/skills/run-refeicao-livre/driver.mjs smoke      # a tela (22 checagens)
```

As duas suítes cobrem coisas diferentes e as duas importam: o validador olha o
dado sem abrir browser, o smoke olha o que chega na tela. O `SKILL.md` ao lado do
driver tem as pegadinhas de pilotar este app — em especial a **corrida do hash**
(navegar por `#/rede` não recarrega a página, então esperar por `.item-topo`
enxerga o DOM da rede anterior).

O smoke trava números de referência conferidos contra a fonte (107 itens no BK,
Big Mac + WHOPPER® Jr. = 912 kcal). Se um deles quebrar depois de atualizar
cardápio, confira o valor novo contra a fonte e **atualize o smoke** — não relaxe
a asserção.

## `file://` não serve este app

Diferente da Calculadora TMB, aqui há `fetch` de JSON — abrir o `index.html` do
disco dá erro de CORS. O `app.js` detecta `location.protocol === 'file:'` e mostra
a instrução em vez de uma tela vazia e silenciosa. Se um dia isso incomodar, a
saída **não** é embutir os dados no HTML (ver o requisito no topo): é o servidor
local, que já é o fluxo dos outros apps do workspace.

## Busca: os nomes oficiais têm símbolo que ninguém digita

`WHOPPER® Jr.`, `Big King™`. Uma busca literal por `whopper jr` não acha nada,
porque o `®` fica no meio. `app.js` tem `normaliza()`, que tira acentos, `®™©` e
pontuação dos **dois** lados da comparação. Foi o smoke que expôs isso.

Trocar de rede zera a busca; trocar de categoria não. É intencional — um termo da
rede anterior deixaria o cardápio novo vazio sem nada explicando por quê.

## Pitfall herdado: o h1 some se transbordar

`.intro h1` usa `background-clip: text` com `color: transparent`. Se o texto
passar da largura da caixa, o excedente fica invisível — sem scrollbar, sem erro
— e **`scrollWidth === clientWidth` não detecta**. Meça com `fit .intro h1`, que
usa um `Range`; é o que o passo 3 do smoke faz, em 320, 360 e 430 px.

## Deploy

`vercel.json` é cópia do hub: `cleanUrls: true` e cabeçalhos de segurança. Duas
conferências depois de qualquer deploy que acrescente arquivo:

- **`data/*.json` e `assets/logos/*` são muitos e nascem não rastreados.** Se o
  `index.json` subir citando uma rede cujo arquivo ficou fora do `git add`, o
  build fica verde e a rede some sem erro; se for a logo que ficou de fora, o
  badge cai calado na inicial. O `for` com `curl` está no
  `ATUALIZAR-CARDAPIO.md`.
- **Case sensitivity.** NTFS ignora, o Linux da Vercel não. Confira letra por
  letra.

Com `cleanUrls: true`, `.html` responde **308** e não 404 — sem `curl -L` parece
que o arquivo existe.

## Idioma

UI, mensagens, comentários e documentação em **português do Brasil**.
