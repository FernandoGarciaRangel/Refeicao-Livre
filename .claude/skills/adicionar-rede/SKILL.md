---
name: adicionar-rede
description: Acrescenta um restaurante novo ao Refeição Livre a partir da tabela nutricional oficial da rede. Use quando pedirem para incluir uma rede de fast food no app (McDonald's, Burger King, Madero, Bob's, Popeyes, KFC, Giraffas, Habib's, Subway, Spoleto, Outback…), criar um data/<slug>.json novo, ou avaliar se a fonte de uma rede serve. Palavras-chave: adicionar restaurante, nova rede, incluir rede, cardapio novo, tabela nutricional, fonte oficial.
---

# Acrescentar uma rede ao Refeição Livre

Uma rede nova é **um arquivo JSON e uma linha no índice** — nada de HTML, CSS ou JS.
Se em algum momento parecer que você precisa editar código para a rede aparecer,
pare: o desenho do repo está sendo quebrado (ver `CLAUDE.md`).

As regras de dado (o que vai `null`, por que não se estima, o que o validador
cobra, o formato do item) estão em **`ATUALIZAR-CARDAPIO.md`**. Leia antes. Esta
skill cobre só o que é exclusivo de acrescentar uma rede que ainda não existe.

---

## Passo 0 — o portão: essa fonte serve?

**Faça isto antes de extrair qualquer coisa.** É o passo que economiza o trabalho
inteiro quando a resposta é não, e foi aprendido caro: o Bob's só se revelou
inviável depois que a fonte já tinha sido caçada, baixada e aberta.

Quatro perguntas, nesta ordem:

1. **É fonte oficial da própria rede?** Site dela ou PDF hospedado no domínio
   dela. FatSecret, Tabela TACO Online, Scribd, blog de nutrição e afins **não
   servem** — são terceiros que copiaram, sem garantia de estarem atualizados.
   O app inteiro se sustenta na promessa de "número oficial".

2. **Os valores são por porção?** As redes já no app publicam por porção — o que
   você come. Uma rede que publique **por 100 g** não é comparável: o Big Bob a
   258 kcal/100 g apareceria ao lado de um Whopper de 717 kcal/unidade como se
   fosse um terço dele (a unidade inteira dá ~602). Some no mesmo prato e o total
   fica errado.

   Se a fonte for por 100 g, **não converta**: o resultado seria número calculado
   por nós, e este app não publica número calculado. Pare e leve a decisão a
   quem pediu, com o exemplo concreto do desvio. O caso do Bob's está registrado
   em `ATUALIZAR-CARDAPIO.md`.

3. **Dá para extrair sem transcrever à mão?** PDF com texto de verdade e site com
   dado no HTML/payload servem. **Imagem serve mal** — o Bob's publica um PNG por
   produto, e transcrever número de imagem é o método menos confiável que existe
   para exatamente o dado que não pode estar errado. Se for imagem, diga o custo
   (uma leitura por produto) antes de começar.

4. **Essa é a versão corrente?** Procure a data no rodapé do documento. Já
   circulava um `Tabela-Nutricional-Geral.pdf` do Burger King de **janeiro de
   2024** com valores diferentes do `TABELA_NUTRICIONAL_BK.pdf` de **maio de
   2026** para os mesmos sanduíches — os dois no domínio oficial, os dois no
   Google. O buscador não ordena por data.

Só passe adiante se as quatro fecharem. Se alguma falhar, relate qual e por quê,
em vez de contornar.

## Passo 1 — pegar a fonte

Redes com proteção anti-bot (Cloudflare) recusam `curl` e `WebFetch` com **403**,
e detectam Chrome headless. O que passa é Chrome com janela:

```bash
HEADFUL=1 node .claude/skills/run-refeicao-livre/driver.mjs repl
> goto https://www.<rede>.com.br/cardapio/<categoria>
> sleep 22000        # o desafio leva uns 20 s
> eval document.title
```

Uma vez com a aba liberada, **procure o payload antes de navegar produto a
produto**. Sites em Nuxt/Next carregam a categoria inteira num `<script>`
(`__NUXT_DATA__`, `__NEXT_DATA__`) — no McDonald's isso trocou 165 navegações por
14 `fetch` de mesma origem. O formato achatado do devalue guarda índices no lugar
dos valores, então precisa de resolvedor recursivo; regex não lê.

Para PDF, use `pdfjs-dist` num script descartável no scratchpad — **não** regex
sobre o stream: fontes com tabela de caracteres própria devolvem lixo.

## Passo 2 — conferir a extração antes de acreditar nela

Os dois erros desta série passaram por conferência visual sem levantar suspeita.
Não confie em "os valores parecem plausíveis".

- **O `%VD` impresso ao lado do número é a melhor conferência que existe.** Ele
  amarra o valor à coluna: proteína 32 g com "63%" só fecha contra o VD de 50 g
  da RDC 429/2020. Foi assim que se confirmou o mapeamento das 12 colunas do BK e
  se descobriu que o Madero imprime os pares "por 100 g" e "por unidade" em ordem
  **trocada** em parte dos pratos.
- **Aceite as duas bases de VD.** O PDF do BK mistura RDC 429/2020 (proteína
  50 g, sódio 2.000 mg) com linhas herdadas da RDC 360/2003 (proteína 75 g, sódio
  2.400 mg). Um verificador que assuma uma base só gera enxurrada de falso
  positivo — foram 15, dos quais 11 eram ruído.
- **Cheque o separador decimal caso a caso.** O McDonald's usa ponto **e** vírgula
  como decimal no mesmo campo (`1767.93` e `1441,0`, ambos mg) e nunca como
  milhar. Reaproveitar o parser do BK, que trata ponto como milhar, multiplicou o
  sódio por 100 e só o validador pegou.
- **A conta de Atwater é o desempate.** `4·carb + 4·prot + 9·gord` contra as kcal
  declaradas resolve qual de dois candidatos é o valor certo, e denuncia
  transcrição errada.

## Passo 3 — mapear para o vocabulário de categorias

As categorias vivem em `data/categorias.json` e são **compartilhadas**: "Bebidas"
é a mesma coisa em toda rede. Mapeie as seções da fonte para os slugs existentes.

Crie categoria nova só quando o tipo de alimento realmente não existir ainda —
foi o caso de `carnes`, `massas` e `peixes` (Madero é restaurante completo) e de
`matinais` e `combos` (McDonald's). Não crie categoria para uma seção que é
**ocasião** e não tipo: "lançamentos", "McOferta" e "promoções" são vitrines, e
os produtos delas pertencem ao seu tipo de alimento.

Produto que aparece em mais de uma seção entra **uma vez só**. Se ele for
sazonal, marque `"sazonal": true` em vez de criar categoria para isso.

## Passo 4 — escrever os arquivos

1. `data/<slug>.json` — mesmo formato dos existentes (`burger-king.json` é o mais
   simples de copiar). `fonte.url`, `fonte.tipo`, `fonte.atualizadoEm` e
   `verificadoEm` são obrigatórios.
2. `observacoes` — registre ali **todo defeito da fonte** que você contornou: o
   campo que ficou `null` e por quê, valores que não fecham, blocos repetidos. É
   isso que impede a próxima pessoa de "consertar" o extrator achando que o erro
   é nosso.
3. `data/index.json` — `slug`, `nome`, `cor` (hex de 6 dígitos, da marca) e
   `inicial` (o badge; 1 ou 2 letras).

A cor vai no **dado**, nunca no CSS — é o que permite acrescentar rede sem tocar
no stylesheet.

## Passo 5 — validar, testar, atualizar o smoke

```bash
node scripts/validar-dados.mjs
node .claude/skills/run-refeicao-livre/driver.mjs smoke
```

O validador precisa sair com 0. Avisos não derrubam, mas **confira cada um contra
a fonte** — o aviso de Atwater é o pega-erro-de-transcrição.

O smoke vai falhar de propósito no passo 1: ele assere a **lista literal** de
redes. Atualize a lista em `cmdSmoke` para incluir a nova, na ordem em que
aparece no `index.json`.

## Passo 6 — commit e deploy

Tudo num commit só: o `data/<slug>.json` novo **e** o `index.json` que o
referencia. Se o índice subir citando um arquivo que ficou fora do `git add`, o
build fica verde e a rede some da tela sem erro nenhum.

Depois do deploy, confirme com cache-buster (o `for` completo está em
`ATUALIZAR-CARDAPIO.md`):

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  "https://refeicao-livre.vercel.app/data/<slug>.json?v=$RANDOM"
```

## O que NÃO fazer

- Não use fonte de terceiro, por mais completa que pareça.
- Não converta base (100 g → porção) para "encaixar" uma rede.
- Não preencha com `0` o campo que a fonte não publica.
- Não estime valor impossível — deixe `null` e escreva o motivo em `observacoes`.
- Não relaxe uma asserção do smoke para ela passar; atualize o valor esperado.
- Não toque em `index.html`, `styles.css` ou `app.js` para acrescentar uma rede.
  Se precisar, algo está errado no plano.
