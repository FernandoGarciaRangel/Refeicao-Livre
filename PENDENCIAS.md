# Pendências

Três redes ficaram de fora, cada uma por um motivo diferente. Este arquivo existe para
que a próxima sessão **não refaça a investigação** — cada item diz o que já foi testado,
o que falhou e com que evidência, e qual é o próximo passo concreto.

Última revisão: 2026-08-29. Estado do app nessa data: 530 itens, 6 redes, validador exit 0,
smoke 22/22.

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
