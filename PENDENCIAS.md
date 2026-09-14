# Pendências

Cinco redes ficaram de fora, cada uma por um motivo diferente, e uma entrou com ressalva.
Este arquivo existe para que a próxima sessão **não refaça a investigação** — cada item diz
o que já foi testado, o que falhou e com que evidência, e qual é o próximo passo concreto.

No fim há a **varredura de candidatas**: as redes que publicam tabela oficial e ainda não
entraram, com a fonte conferida, e as que foram reprovadas, com o motivo.

Última revisão: 2026-09-13. Estado do app nessa data: 1.212 itens, 12 redes, validador exit 0
(29 avisos, 7 deles do Ragazzo e explicados nas `observacoes` dele), smoke 22/22.

---

## 1. Pizza Hut — fonte boa, extração não confiável

**A mais próxima de entrar.** A fonte passa o portão inteiro; o que falha é a atribuição
da massa às pizzas.

### O que já está resolvido

- **Fonte oficial encontrada:** `https://enterprise.hanzo.com.br/pizzahut/nutri/tabela_v1.pdf`,
  linkada no rodapé do `pizzahut.com.br` como "Tabela nutricional e alergênicos". Hospedada
  no domínio do parceiro de pedidos, não no da rede — mas é o link que a própria rede publica.
- **Valores por porção com o peso em gramas.** O PDF traz também uma coluna "por 100 g", que
  **não serve**: não fecha com a coluna por porção em vários itens (Hut Fries traz 23 g de
  carboidrato tanto na porção de 86 g quanto em 100 g).
- **PDF com texto de verdade**, extraível por `pdfjs-dist`. Nutrição nas páginas 1–5;
  páginas 6–9 são a tabela de alergênicos.
- **Âncoras de coluna medidas** (x, tolerância ±26):

  | campo | x | campo | x |
  |---|---|---|---|
  | nome | 216 | gord | 868 |
  | porção (texto) | 369 | gordSat | 963 |
  | peso | 457 | fibra | 1105 |
  | kcal | 577 | sódio | 1171 |
  | carb | 695 | | |
  | prot | 779 | | |

- **A hierarquia da coluna da esquerda é dada pelo x, não pelo texto:** `x≈51` é a massa,
  `x≈85` o sabor, `x≈98` a categoria (ENTRADA, MELTS, LASANHA, PENNE, SOBREMESA).
- **Os rótulos de massa são texto rotacionado 90°** (`transform=[0,20,-20,0,x,y]`), e a
  *largura* do texto é a extensão vertical dele.
- **Discriminador de pizza:** só linha de pizza tem `tamanho` (Individual/Média/Grande) no
  lugar do nome; as demais trazem nome de prato. Sem isso, a faixa de categoria (que vai até
  o fim da página) marcava pizzas como PENNE, e a de sabor marcava entradas como 4 QUEIJOS.
- **Agrupar células em linhas por proximidade de y (±4), nunca por arredondamento.**
  Com `Math.round(y/5)*5` duas células da mesma linha caem em baldes diferentes quando ficam
  nos dois lados de uma fronteira, e a linha sai partida — foi assim que uma pizza da pág. 4
  recebeu o peso e a gordura de outra.
- **O sabor quebra em duas linhas** e a segunda sempre começa com `&` ou `E `
  ("CALABRESA" + "E REQUEIJÃO"). Encadear por salto vertical dispara em cascata.
- **Cada massa recomeça a lista de sabores por "4 QUEIJOS"**, e cada página tem no máximo
  uma troca de massa.

### O que falha

A atribuição da **massa**. Nove abordagens foram tentadas (rótulo na hora, agrupamento por
repetição de sabor, herança entre blocos, fronteira no "4 QUEIJOS", faixa de Y pela geometria
do rótulo rotacionado). A melhor chegou a 45/47/46/19 linhas por massa — o esperado é 48 —
mas **não passou nas duas verificações independentes**:

1. **Peso fora de ordem:** no mesmo sabor e tamanho, a borda recheada tem de pesar mais que a
   massa fina. Deu 14 fora de ordem em 34 trios completos.
2. **Combinação repetida:** "Calabresa Grande" aparece **duas vezes** dentro da mesma massa,
   com 171 g e 114 g. Um sabor+tamanho não pode existir duas vezes na mesma massa.

Contra a página 1, que é inequivocamente MASSA PAN (é o único rótulo da página), a atribuição
bate 100%. O erro está nas fronteiras entre blocos.

### Próximo passo

**Reconstruir as linhas pelo x das colunas, não agrupando células em linhas.** Para cada
âncora de coluna, ler a sequência vertical de valores e casar por índice. Isso elimina de vez
o problema de decidir "que células formam uma linha", que é a origem de tudo.

Só publique depois que as duas verificações acima passarem. **Não publique com as
combinações ambíguas descartadas** — o descarte esconde que a massa pode estar errada nas
que sobraram.

### Logo, se entrar

`File:Pizza Hut 2025.svg` na Wikimedia Commons
(`https://upload.wikimedia.org/wikipedia/commons/c/c5/Pizza_Hut_2025.svg`). Testada no badge
a 46 px e a 120 px: **funciona**. Basta tirar os `fill` de cada path e pôr
`fill="#ffffff"` no `<svg>`. Cor da marca: `#c8102e`.

Também exige uma categoria `pizzas` nova em `data/categorias.json`.

---

## 2. Popeyes — sem fonte oficial

**Não é questão de esforço: a rede não publica.**

- `popeyesbrasil.com.br` responde, mas as únicas rotas são `/cardapio`, `/cupons`,
  `/fale-conosco`, `/politica-de-privacidades` e `/termos-de-uso`. Nenhuma menção a
  nutrição em lugar nenhum do HTML.
- O CMS é `plk-cms.popeyesbrasil.com.br`. Testei o padrão que funciona no Burger King
  (`TABELA_NUTRICIONAL_PLK.pdf`, `TABELA_NUTRICIONAL.pdf`, `Tabela-Nutricional-Geral.pdf`):
  todos 404.
- O que existe é cópia no Scribd e agregador (FatSecret, CalMind). **Terceiro não entra** —
  ver a regra em `.claude/skills/adicionar-rede/SKILL.md`.

**Vale reconferir de tempos em tempos**, porque o Popeyes é operado pela **Zamp**, a mesma do
Burger King e do Subway — e as duas publicam. Se publicarem a do Popeyes, provavelmente será
no mesmo padrão de CMS.

**Reconferido em 2026-08-29: continua sem publicar.** E não há atalho por enumeração — o
`plk-cms` é bucket S3 sem listagem (`api/upload/files` e `uploads` devolvem `NoSuchKey`).
O mesmo vale para o `sbux-cms.zamp.com.br`, do Starbucks Brasil, que a Zamp também opera.

---

## 2b. Johnny Joy — não existe dado, nem oficial nem de terceiro

Pedida junto com a Milky Moo em 2026-09-12. A Milky Moo entrou (com fonte de terceiro, ver o
item 2c); a Johnny Joy **não tem número nenhum em lugar nenhum**, então não entrou.

- `johnnyjoy.com.br` é WordPress e o `wp-sitemap-posts-page-1.xml` lista as **22 páginas do
  site inteiro**: home, cardápio, eventos, collabs, fidelidade, gift card, franqueado, abrinq,
  encontre-uma-loja e uma página por inauguração. Nenhuma de nutrição. `/tabela-nutricional`,
  `/nutricional` e `/informacoes-nutricionais`: 404. A busca interna (`/?s=nutricional`) não
  devolve nada.
- O `/cardapio/` publica só nome, descrição e o bloco de alergênicos ("GLÚTEN, LACTOSE,
  CASTANHAS, CORANTE, OVO, SOJA"). Zero valor nutricional.
- **Nem o agregador tem.** A página de marca do FatSecret existe e responde 200, mas o corpo é
  literalmente "Não foram encontrados resultados para 'Johnny Joy'". A busca por "Johnny Joy"
  devolve barra de proteína da Agtal e Kinder Joy — nada da rede.
- O que circula é TikTok/Kwai estimando de olho. Não serve nem sob a exceção do item 2c.

**Próximo passo:** só entra com tabela na mão — print do painel da loja, resposta do SAC ou PDF
que a rede venha a publicar. Não refaça a varredura acima; ela é de 2026-09-12 e foi exaustiva.

---

## 2c. Milky Moo — entrou com fonte de terceiro (a única do app)

**Não é pendência de entrada: é pendência de troca.** A rede está no ar desde 2026-09-12 com 16
sabores, marcada `fonte.oficial: false` — a primeira e única vez que o app publica número que a
rede não publicou. Foi decisão explícita de quem mantém o app, depois de o portão do
`.claude/skills/adicionar-rede/SKILL.md` reprovar a fonte.

- A rede **não publica tabela**. O cardápio diz "PARA MAIS INFORMAÇÕES CONSULTE NOSSA TABELA
  NUTRICIONAL" e não linka nenhuma; a home, os 37 sabores e o HTML renderizado não têm um `.pdf`
  sequer. `/tabela-nutricional`, `/tabelanutricional`, `/nutricional`,
  `/informacoes-nutricionais` e variantes: todas 404.
- Em **setembro de 2025**, depois de a polêmica do copo de ~3.000 kcal viralizar, a marca
  anunciou revisão da tabela "já disponível no site". **Um ano depois, não está.** É esse
  anúncio que faz valer a pena reconferir de tempos em tempos.
- Os valores vieram do FatSecret ("fatsecret Platform API"), 16 dos 37 sabores. Só kcal, gordura
  total, carboidrato e proteína — açúcar, gordura saturada, fibra e sódio ficaram `null`. Os 16
  fecham em Atwater dentro de 2%, o que mostra coerência interna do agregador, **não** acerto.
- As porções do FatSecret não são padronizadas (100 ml, 120 ml, 120 g, 300 ml) nem batem com os
  copos de loja. Cada item declara a sua; a soma da refeição respeita isso.
- **Não bate com o outro agregador:** o dieta.ai publica Malhada a 238 kcal/120 ml (≈595 por
  300 ml) contra os 802 por 300 ml do FatSecret. O artigo do dieta.ai é de março/2025, anterior
  à correção, sem citar fonte — por isso o FatSecret foi o escolhido, não porque esteja certo.

### A Platform API foi tentada e NÃO serve no plano gratuito (medido em 2026-09-13)

Não refaça este teste. Conta criada, IP na whitelist, token emitindo normalmente — e ainda
assim o caminho está fechado, por duas razões que não são de código:

- `foods/search/v3` responde `Missing scope: scope 'premier'`. A v1 responde, mas resume os
  nutrientes numa frase (`food_description`): os **mesmos quatro campos** que a raspagem já
  dava. Nenhum ganho de dado.
- **O índice do plano gratuito é só dos EUA, e a Milky Moo não está nele.** Busca por
  "Milky Moo": 1.000 resultados, **zero** com `brand_name` igual — vieram Milka, Friendly
  Farms, Nestlé, Mars, P.F. Chang's. Busca por sabores brasileiros: "Xonada" devolve Posada e
  Canada Dry; "Dengosa" devolve Casa Mendosa; "Milkymoo" devolve **0**.

E a armadilha: **`region=BR` não dá erro — é aceito e ignorado**, devolvendo o mesmo índice
dos EUA. A documentação diz que localização é premium ("Localization is a premium feature only
made available to select accounts"), mas a API não recusa; ela mente por omissão. Quem passar
esse parâmetro vai achar que buscou no Brasil. O `sincronizar-fatsecret.mjs` avisa disso.

**O script fica.** Está testado por fixture nos dois degraus e funciona no dia em que a conta
virar Premier — ou para outra rede que esteja no índice dos EUA. Hoje ele está dormente, e o
dado do app continua sendo o que foi raspado do site.

**Próximo passo:** quando a Milky Moo publicar a tabela, troque o arquivo inteiro pela oficial e
**remova o `fonte.oficial: false`** — o rótulo de aviso some junto. Enquanto isso, nenhuma outra
rede deve herdar esse campo por conveniência.

---

## 3. Bob's — entra pela metade, e sem logo

Já está no app, com **41 dos 91 produtos**. As duas limitações são da fonte, não nossas:

- **50 produtos não têm tabela publicada**, incluindo os sanduíches centrais: Bob's Classic,
  Double Cheese, Cheddar Australiano, Crispy Bacon. O que sobra pende para sobremesa
  (31 dos 41 itens).
- **Não use o resumo de três valores da página do produto para preencher os buracos.** Ele
  diverge da tabela oficial do mesmo produto: no Big Bob a página diz 253 kcal e 515 mg de
  sódio, a tabela diz 258 e 343. Os `%VD` da tabela conferem todos.
- **Logo:** `File:Logotipo do Bob's.svg` existe na Wikimedia, mas é wordmark 2:1 e vira
  borrão a 46 px. Testado e reprovado. Fica na inicial "B" até haver símbolo quadrado.

As 41 URLs de imagem estão em `fontes/bobs-imagens.json` — redescobri-las custa varrer
91 páginas de produto.

---

## 4. Cabana Burger — a rede não publica; a tabela vem por WhatsApp

**Pedida em 2026-08-29.** Existe unidade no Plaza Niterói. O bloqueio não é técnico: a rede
não publica tabela nutricional em canal nenhum, e o dono do repo ficou de pedi-la pelo
**WhatsApp do atendimento**. Nada foi criado em `data/` — nem arquivo, nem entrada no
`index.json`.

### O que já foi testado (não refaça)

- **Site oficial (`cabanaburger.com.br`): WordPress de três páginas.** O `wp-sitemap-posts-page-1.xml`
  lista só `/`, `/politica-de-privacidade/` e `/franquias/`. `wp-json/wp/v2/search?search=nutricional`
  devolve `[]`; `wp-json/wp/v2/media?search=nutri` devolve `[]`.
- **404 de verdade** (conferido o `content-type`, não só o status) em `/tabela-nutricional`,
  `/nutricional` e `/informacoes-nutricionais`.
- **O delivery é da Olga** (`delivery.cabanaburger.com.br`, assets em `assets-food.olga.tech`).
  A plataforma carrega nome, descrição e preço — **zero ocorrências** de `kcal`, `calor` ou
  `nutri` no payload. A unidade aparece lá como `plaza-niteroi801` / "Plaza Niterói".
- **A própria rede confirma**, na resposta do Reclame Aqui: alega não ser obrigada pela
  RDC 360/2003 (que vale para alimento embalado, não para restaurante) e manda pedir os
  valores pelo atendimento automatizado do WhatsApp.

Terceiro (FatSecret, Scribd e afins) **não entra** — passo 0, pergunta 1 da
`.claude/skills/adicionar-rede/SKILL.md`.

### Quando a tabela chegar

O WhatsApp do atendimento **é** fonte oficial — é a própria rede respondendo —, mas não é
pública nem versionável. Consequências a registrar no arquivo:

- `fonte.url` não existe como link estável. Use `fonte.tipo: "Atendimento oficial (WhatsApp)"`
  e diga em `observacoes` a data em que a tabela foi pedida e o que veio (texto, PDF, print).
- **Não dá para hashear**: `scripts/conferir-fontes.mjs` não tem o que rebaixar. A rede entra
  no mesmo balde do Bob's e do McDonald's — reconferir é pedir de novo, não comparar sha256.
- **Confira a base** antes de transcrever (porção ou 100 g) e declare em `base`. Se vier só
  kcal, sem os macros, os oito campos numéricos ainda têm de existir, com `null` nos que
  faltarem — nunca `0`.
- **Confira a cobertura**: se a rede mandar só parte do cardápio, isso vira observação no
  arquivo, como no Bob's.

### Logo e cor: nada decidido

`simple-icons@latest/icons/cabanaburger.svg` → **404**. Não procurei na Wikimedia nem na arte
do site. Sem `logo` o badge usa a `inicial` e está tudo certo — decida junto com a `cor` da
marca quando o arquivo for criado.

### Jerônimo Burger foi avaliado e está descartado

Apareceu como alternativa de hamburgueria de shopping, e a fonte dele é boa: PDF oficial de
9 páginas, vivo e com `content-type: application/pdf` de verdade, em
`https://jeronimoburger.com.br/img/TabelaNutricionalJeronimo_25.pdf` (o
`img/cardapio/tabela-nutricional-jeronimo.pdf` que o buscador indexa está morto — responde
200 com HTML, a armadilha de sempre). **Mas a rede fechou**, então não entra. Não reproponha.

---

## Candidatas: a varredura de 2026-08-29

Varredura de ~35 redes atrás de quem **publica tabela nutricional oficial no próprio
domínio**. Cada linha abaixo foi conferida com `curl -L`, olhando **status e
`content-type`** (o 200-com-HTML derrubou três candidatas que o buscador dava como boas),
e cada PDF foi passado por um farejador de camada de texto — inflar os streams e contar
os operadores `Tj`/`TJ` — para separar PDF extraível de imagem antes de prometer prazo.

### Aprovadas — fonte oficial, PDF de verdade, com camada de texto

Em ordem do que vale mais a pena atacar primeiro.

| Rede | Fonte | Tamanho | O que tem |
|---|---|---|---|
| **Giraffas** | `https://www.giraffas.com.br/documentos/Tabela_Nutricional_A3_26.pdf` | 2 pág. A3 | ~184 linhas de produto |
| **Habib's** | `https://www.habibs.com.br/storage/pdf/tb_nutri.pdf` | 22 pág. | carimbo "Agosto 2026" |
| **Vivenda do Camarão** | `https://vivendadocamarao.com.br/wp-content/uploads/2025/08/Tabela_nutricional.pdf` | 1 pág. | nutricional + alergênicos |
| **Montana Grill** | `https://montanagrill.com.br/tabelanutricional` (308 → PDF) | 1 pág. | peso em g + kcal por prato |
| **Chiquinho Sorvetes** | `https://chiquinho.com.br/wp-content/uploads/2026/08/chiquinho_tabela_nutricional_completa_site_linha_proteica_082026.pdf` | 8,5 MB | agosto de 2026 |

O que cada uma exige, além do que já está em `ATUALIZAR-CARDAPIO.md`:

- **Giraffas — a melhor do lote.** Traz as onze colunas que o app usa (kcal/kJ, carboidratos,
  açúcares totais **e** adicionados, proteínas, gorduras totais/saturadas/trans, fibra, sódio),
  o peso da porção em gramas e o **`%VD` ao lado de cada valor** — a conferência mais barata que
  existe, e a que pegou os erros do Madero e do BK. Publica junto
  `documentos/Tabela_Alergenos_A3_marco_26.pdf`.
  **O link não está no HTML:** o site é React e a casca de `/cardapio` tem 1,4 KB. O caminho vive
  no bundle (`/assets/index-*.js`), numa constante ao lado dos links do rodapé. Vale como técnica
  geral — ver abaixo.
- **Habib's — a fonte mais recente.** O extrator caseiro devolve **lixo**: o PDF usa tabela de
  caracteres própria, exatamente como o Madero. Use `pdfjs-dist`, não regex no stream.
  Bônus: o cardápio do próprio site já monta as *flags* nutricionais da ANVISA por item
  (`buildFlagsNutri`, `alertsNutritionals` no HTML), o que dá uma segunda leitura para conferir
  a extração do PDF contra a tela.
- **Vivenda do Camarão.** O rodapé traz "Elaborado por FB/MC de Garantia da Qualidade em
  14/11/2024" e `%VD` sobre 2.000 kcal — é a data a comparar com `fonte.atualizadoEm`. Tem
  legenda de glúten e lactose, que o formato do item hoje não guarda (não invente campo por isso;
  se for útil, vai em `alerta`).
- **Montana Grill.** `/tabelanutricional` é rota, não arquivo: responde **308** para o PDF.
  As linhas trazem peso e kcal (Picanha 220 g / 479 kcal), o que faz a checagem de massa do
  validador valer desde o primeiro dia.
- **Ragazzo Express** — o resto do Ragazzo, que entrou em 2026-09-13.
  `https://www1.deliveryragazzo.com.br/storage/pdf/tb_nutri_rex.pdf`, 9 páginas, 53 tabelas,
  **abril de 2026**. Dessas, 41 são produtos que não estão no PDF principal: sobretudo casquinhas
  recheadas, cascões e milk-shakes do formato Express. Extrai com o mesmo parser do principal, sem
  ajuste (rodei: 53 tabelas, zero rótulo desconhecido). **O que falta decidir não é técnico:** são
  dois documentos com datas diferentes e `data/<rede>.json` guarda **uma** `fonte` por rede, então
  mesclar seria misturar fontes — o que o `adicionar-rede` proíbe. Os 12 produtos que aparecem nos
  dois trazem valores **idênticos**, exceto o `Suco de Laranja` (46 contra 48 kcal por 100 ml), o
  que mostra que os dois documentos não se contradizem de fato. As saídas seriam ou uma rede
  separada ("Ragazzo Express") com a sua própria `fonte`, ou um campo de fonte por categoria —
  e o segundo mexe no formato do item, que é o que o repo evita.
- **Chiquinho Sorvetes.** **Confira a cobertura antes de extrair:** o nome do arquivo diz
  `linha_proteica`, e não ficou claro se ele cobre o cardápio inteiro ou só essa linha. Se cobrir
  só parte, é o caso do Bob's — entra pela metade, e quem pediu precisa saber antes.

### Com ressalva — a fonte existe, o custo é que não fecha

- **Bacio di Latte.** `https://baciodilatte.com.br/wp-content/uploads/2025/06/Tabela-Nutricional-e-Alergenicos-Bacio-di-Latte.pdf`
  (18 MB) e um PDF só do Milkshake Bacio Zero, de 05/2026. Tem algum texto, mas o despejo sai
  binário e o arquivo é pesado — pode ser tabela em imagem. **Conferir antes de prometer.**
- **Johnny Rockets.** `https://johnnyrockets.com.br/cardapio/nutricional.pdf` — 45 páginas e
  **90 operadores de texto no documento inteiro**: é imagem, provavelmente uma página por produto.
  Dá para fazer pelo caminho do Bob's (folhas de 4 num HTML local capturado pelo driver), mas o
  custo é esse, e é grande.

### Reprovadas — e por quê, para não retestar

- **Outback Brasil.** A rede responde no Reclame Aqui que só informa **em loja ou pelo
  atendimento**; o site publica alergênicos e mais nada. Mesmo caso do Cabana Burger.
- **Spoleto.** O `system/application/static/pdf/spoleto_tabela_nutricional.pdf` que o buscador
  indexa responde **200 com HTML** — o site foi refeito e o arquivo não existe mais. Nada de
  nutricional no site atual, nem na home nem no `/cardapio`.
- **Domino's.** Igual: `sites/default/files/tabela_nutricional_dominos.pdf` e `..._2.pdf`
  respondem **200 com HTML**.
- **Starbucks Brasil.** Nada no site (a home dá 403 para `curl`). O CMS da Zamp existe
  — `sbux-cms.zamp.com.br`, 403 na raiz —, mas é bucket S3 **sem listagem**: `api/upload/files`
  e `uploads` devolvem `NoSuchKey`. Sem o caminho exato não há como achar.
- **Popeyes** (reconferido, ver item 2). Continua sem publicar, e o `plk-cms` é o mesmo bucket
  S3 sem listagem. A esperança de "a Zamp publica para BK e Subway, então um dia publica para
  este" segue de pé, mas não há atalho por enumeração.
- **China in Box** (reconferida em 2026-09-13, continua reprovada). O site é casca
  Ionic/Cordova em Angular: baixei o `main-*.js` e os 26 `chunk-*.js` e **`nutri` não aparece
  em nenhum**, nem `caloria`, `sodio` ou `.pdf`. O cardápio vem da API `cib.alphacode.com.br/api/`,
  cujos produtos não têm campo nutricional. O `qrcode.chinainbox.com.br` que o buscador indexa
  (cardápio oficial de 2021) **não resolve mais** — DNS morto, não é 404. Tudo o que existe é de
  terceiro: Scribd, FatSecret, blogs e um PDF de 2016 no silo.tips. A pergunta 1 do portão reprova
  os quatro.
- **Sem nada encontrado** (home, `/cardapio`, bundles e, onde é WordPress, a API de mídia):
  Casa do Pão de Queijo, Taco Bell, Divino Fogão, Mania de Churrasco, Coco Bambu,
  Rei do Mate, Croasonho, Gendai, Mr. Cheney, Sodiê Doces, Nutty Bavarian, Baked Potato,
  Temakeria & Cia, Jin Jin, Sbarro.

### Três técnicas que a varredura rendeu

Valem para a próxima rede, e teriam poupado tempo aqui:

1. **Em site SPA, o link da tabela está no bundle, não no HTML.** A casca do Giraffas tem 1,4 KB
   e nenhum link; o caminho do PDF está numa constante do `/assets/index-*.js`. Baixe o bundle e
   procure `nutri` nele antes de concluir que a rede não publica.
2. **Em WordPress, pergunte à API de mídia.** `wp-json/wp/v2/media?search=nutri&per_page=50`
   lista os arquivos por nome e devolve o `source_url` pronto — foi assim que Vivenda e Bacio
   apareceram, e foi assim que se **provou** que o Cabana não tem nada (a busca volta `[]`).
   `wp-json/wp/v2/search?search=nutricional` faz o mesmo para páginas.
3. **O domínio óbvio pode não ser o da rede — confira o `<title>` antes de concluir "não publica".**
   `ragazzo.com.br` é a *Ragazzo Model Management*, uma agência de modelos em Wix; a lanchonete
   publica em `deliveryragazzo.com.br`. Uma varredura automática que só procure `nutri` no HTML
   reprova a rede errada e ninguém revisita. O mesmo vale ao contrário: `habibs.com.br/ragazzo`
   responde 200 e serve o site do Habib's, não uma seção do Ragazzo.

E a de sempre, que apanhou três candidatas de uma vez: **um PDF indexado pelo Google não é um
PDF que existe.** Spoleto, Domino's e o link antigo do Jerônimo respondem 200 com HTML. Confira o
`content-type`, sempre.

---

## Onde continuar a ler

- `ATUALIZAR-CARDAPIO.md` — o procedimento, o formato do item, o que o validador cobra e as
  armadilhas por fonte
- `CLAUDE.md` — o requisito que manda no repo e os defeitos conhecidos de cada fonte
- `.claude/skills/adicionar-rede/SKILL.md` — o portão a passar antes de extrair
- `fontes/manifesto.json` + `node scripts/conferir-fontes.mjs` — a fonte mudou?

Uma lição que atravessa tudo isto e vale repetir: **código de status não prova que o arquivo
existe.** Host com fallback de rota devolve 200 com HTML para qualquer caminho. Foi assim que
os ícones do PWA do WeightChartS ficaram quebrados sem ninguém notar, e foi assim que eu
afirmei erradamente que o `CLAUDE.md` dele estava exposto. Confira o `content-type`.
