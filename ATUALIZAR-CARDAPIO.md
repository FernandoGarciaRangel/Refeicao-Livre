# Como atualizar um cardápio

As redes mudam cardápio o tempo todo. Atualizar aqui é editar um arquivo JSON e rodar o validador — não há build, não há banco, não há código a tocar.

## O ciclo

```bash
# 1. a fonte mudou? (segundos, e diz qual rede olhar)
node scripts/conferir-fontes.mjs
# 2. baixe a fonte oficial da rede (links na tabela abaixo)
# 3. edite data/<rede>.json
# 4. confira
node scripts/validar-dados.mjs
# 5. suba o app e olhe
npx serve . -l 8082
# 6. commit
```

**Comece sempre pelo passo 1.** `fontes/manifesto.json` guarda o sha256 do documento de onde
cada cardápio saiu; o script rebaixa e compara. Se nada mudou, o trabalho é atualizar
`verificadoEm` e commitar. Se mudou, ele diz qual rede reextrair.

Três redes não dão para conferir por hash — McDonald's e KFC são sites que mudam sempre, e o
Bob's são imagens sem versão. Para essas, reextrair e comparar o JSON é o único caminho, e o
script diz isso em vez de fingir que conferiu.

O validador sai com erro se algo não fecha. **Rode sempre antes de commitar** — ele é a diferença entre publicar um número certo e um número plausível.

## Fontes oficiais por rede

| Rede | Onde está a tabela | Formato |
|---|---|---|
| McDonald's | `https://www.mcdonalds.com.br/cardapio` | Site, uma tabela por produto |
| KFC | `https://www.kfc.com.br/nutritional-information` | Site, 7 tabelas HTML por categoria |
| Burger King | `https://bk-media.burgerking.com.br/TABELA_NUTRICIONAL_BK.pdf` | PDF, uma página, duas colunas |
| Madero | `https://restaurantemadero.com.br/assets/site/arquivos/Tabela_Nutricional_Alergenicos.pdf` | PDF, 10 páginas, texto corrido bilíngue |
| Subway | `https://sbw-cms.zamp.com.br/Tabela_Nutricional_15_05_2026_a7b1fe9dee/…pdf` | PDF, arte vetorial **sem texto** |
| Bob's | `https://bobs.com.br/cardapio/` | Imagem PNG por produto, **por 100 g** |

Cada `data/<rede>.json` guarda a URL da sua fonte no campo `fonte.url`. Se a rede mudar o endereço, mude lá também.

### Bob's: o caso que criou o campo `base`

O Bob's publica **por 100 g**, não por porção. O rótulo do Big Bob diz
`Porção: 100 g (3/7 unidade)` e `258 kcal`. Ao lado de um Whopper de 717 kcal por unidade, ele
apareceria como um terço do tamanho; a unidade inteira dá cerca de 602 kcal.

Converter pela fração publicada foi recusado — daria um número **calculado por nós**. A saída
foi o campo `base`: o dado diz em que quantidade ele se aplica, a UI mostra "kcal/100 g" ao lado
do valor, e ao montar a refeição o app **pergunta a quantidade em gramas** em vez de somar 100 g
calados. Nada é estimado e nada é comparado fora de base.

Duas coisas a saber antes de mexer nesse arquivo:

- **Só 41 dos 91 produtos têm tabela.** Sanduíches centrais — Bob's Classic, Double Cheese,
  Cheddar Australiano, Crispy Bacon — não têm nenhuma tabela publicada. Não estão no app, e não
  devem entrar a partir do resumo da página (veja abaixo).
- **O resumo de três valores da página do produto diverge da tabela oficial.** No Big Bob a
  página diz 253 kcal e 515 mg de sódio; a tabela diz 258 kcal e 343 mg. Os `%VD` da tabela
  conferem todos, então é ela que vale. Não use o resumo, nem para completar buracos.

A tabela sai como **imagem PNG, uma por produto**, com o `nutri_*.png` já no HTML estático da
página do produto (dá para pegar por `curl`, sem browser). Para transcrever sem gastar uma
leitura por imagem, monte folhas de 4 num HTML local e capture com o driver:

```bash
# uma página com 4 <img> em grade 2x2, servida pelo próprio driver
APP_DIR=<pasta> OUT_DIR=<saída> node .claude/skills/run-refeicao-livre/driver.mjs repl
> size 1400 1800 1     # o 3º argumento é o deviceScaleFactor; sem ele sai em 2800x3600
> goto /folha0.html
> shot folha0.png
```

41 tabelas viraram 11 leituras. E confira o `%VD` de cada folha: ele é o que separa transcrição
certa de número parecido.

### Subway: a fonte não está no site da rede

O `subway.com.br` **não** publica tabela nutricional — nem na home, nem no cardápio, nem nas
páginas de produto, e o site é protegido por Akamai (o Chrome headless leva "Access Denied";
com janela passa). Procurar lá esgota sem resultado.

A tabela existe e é oficial, mas mora no CMS da **Zamp**, a operadora — a mesma do Burger King
e do Popeyes: `sbw-cms.zamp.com.br/Tabela_Nutricional_<data>_<hash>/…pdf`. Quando a data mudar,
o caminho inteiro muda; ache o novo pelo campo `fonte.url` do JSON ou por busca no host.

O PDF é **arte vetorial sem camada de texto**: `pdfjs` extrai zero caracteres dele. A saída foi
renderizar com o próprio `pdf.js` dentro do browser e ler as faixas visualmente:

```bash
# render.html carrega pdf.js do CDN e desenha a página num <canvas>,
# com recorte por fração (fx/fy/fw/fh) para ampliar uma faixa
APP_DIR=<pasta> OUT_DIR=<saída> node .claude/skills/run-refeicao-livre/driver.mjs repl
> size 2400 1000 1
> goto /render.html?p=2&s=2&fx=0.02&fw=0.65&fy=0.09&fh=0.235
> shot faixa0.png
```

Quatro faixas cobriram a tabela inteira. **Página 1 é a lista de ingredientes; a tabela está na
página 2.**

E uma coisa sobre o cardápio, que muda como o dado é usado: o Subway publica sobretudo os
**componentes** (pão, proteína, queijo, vegetal, molho) e só alguns subs prontos. É por isso que
ele tem as categorias `proteinas`, `queijos`, `paes` e `vegetais`, que nenhuma outra rede usa —
o usuário monta o sanduíche na refeição, que é como a rede vende.

**O Burger King e o Madero têm outra tabela antiga circulando na web.** Confira sempre a data impressa no rodapé do PDF (o BK diz "Última atualização"; o Madero traz um carimbo tipo `MD STH MAIO/2026`) contra o campo `fonte.atualizadoEm` do JSON. Já existiu um `Tabela-Nutricional-Geral.pdf` do BK, de janeiro de 2024, com valores diferentes para os mesmos sanduíches.

## O formato de um item

```json
{
  "nome": "Whopper",
  "porcao": "325 g",
  "kcal": 717,
  "carb": 47,
  "acucar": 13,
  "prot": 32,
  "gord": 44,
  "gordSat": 17,
  "fibra": 5,
  "sodio": 1369
}
```

Campos opcionais: `sazonal: true` (produto que entra e sai do cardápio) e `alerta: "<texto>"` (mostra um aviso no detalhe do item).

### `base`: a que quantidade os valores se referem

No topo do arquivo da rede, ao lado de `fonte` e `verificadoEm`:

```json
"base": "100g"
```

Vale `"porcao"` (o padrão, e o que vale quando o campo não existe) ou `"100g"`. Nada além disso
— o validador recusa outro valor, porque a UI leria como "porcao" e somaria errado.

Isso não é cosmético. Com `"100g"` o app mostra `kcal/100 g` na lista, escreve "Valores por
100 g" no detalhe e, ao acrescentar o item à refeição, pede a **quantidade em gramas** para
poder somar. Sem o campo, 258 kcal por 100 g entrariam no total como se fossem um sanduíche
inteiro.

Escolha a base pela fonte, nunca pela conveniência: se a rede publica por 100 g, é `"100g"`,
mesmo que dê mais trabalho. Converter para porção seria publicar número calculado por nós.

### A regra que mais importa: `null`, nunca `0`

Quando a fonte **não publica** um valor, o campo vai `null`. Nunca `0`.

Um zero mentiroso entra na soma da refeição e produz um total errado com cara de certo — e a tela não tem como saber que aquilo foi inventado. Com `null`, a UI mostra `—` e marca o total como parcial. Todos os oito campos numéricos precisam estar presentes no JSON, nem que seja com `null`; o validador cobra isso.

### Acrescentar uma rede nova

1. Crie `data/<slug>.json` no mesmo formato (veja `burger-king.json`).
2. Acrescente a entrada em `data/index.json` com `slug`, `nome`, `cor` (hex de 6 dígitos) e `inicial`.
3. Opcionalmente, ponha a logo em `assets/logos/<slug>.svg` e aponte o campo `logo` para ela (veja abaixo). Sem esse campo o badge usa a `inicial`, e está tudo certo.
4. Use só os slugs de categoria que existem em `data/categorias.json` — se precisar de um tipo novo, acrescente lá primeiro.
5. Rode o validador.

O `slug` do arquivo, o nome do arquivo e o `slug` de dentro do JSON precisam ser os três iguais.

### A logo do badge

O badge é um quadrado na cor da marca. Dentro dele vai a logo quando o campo `logo` existe, e a `inicial` quando não — os dois caminhos são suportados de propósito, para que entrar uma rede não dependa de ter arte pronta.

O que a arte precisa ser, para assentar sobre a cor da marca do mesmo jeito que a inicial assentava:

- **monocromática em branco** (`fill="#ffffff"` no próprio arquivo — o `<img>` não herda o `color` da página);
- **quadrada ou quase**, em `viewBox="0 0 24 24"`, com o desenho centrado: o CSS a encaixa em 64% do badge com `object-fit: contain`;
- salva em `assets/logos/<slug>.svg`, que é o único caminho que o validador aceita.

O espaço do badge é pequeno (46 px), então **símbolo funciona e wordmark não**. Quando a marca não tem símbolo — é o caso do Madero, que é só a palavra em serifa — a saída é a primeira letra do wordmark oficial, recortada da arte da própria rede, e não uma letra redesenhada por nós.

**Onde achar a arte, na ordem que compensa tentar:**

1. **Simple Icons** — `https://cdn.jsdelivr.net/npm/simple-icons@latest/icons/<slug>.svg`. É de onde vieram McDonald's, Burger King e KFC. Já vem em `viewBox="0 0 24 24"` com um path só; basta trocar `role="img"` por `fill="#ffffff"`. Cobertura irregular: Subway, Pizza Hut e Bob's não existem lá em versão nenhuma (testado da v9 à v13).
2. **Wikimedia Commons**, pela API da Wikipédia — foi de lá que saiu o `Subway icon.svg`. Procure o artigo da marca e liste as imagens:
   `https://en.wikipedia.org/w/api.php?action=query&titles=<Artigo>&prop=images&imlimit=200&format=json`.
   Prefira arquivos com "icon" no nome: os "logo" costumam ser wordmark. Ali também estão o `Pizza Hut 2025.svg` (o telhado com o script — testado, lê bem a 46 px) e o `Logotipo do Bob's.svg` (wordmark 2:1, **não** serve).
3. **O site da rede**, por último. O Pizza Hut publica `/assets/svgs/logo-ph-full.svg`, mas o logo dele é wordmark dentro do telhado e vira borrão a 46 px.

**Não perca tempo com favicon nem `apple-touch-icon`.** Nos três sites testados (Bob's, Pizza Hut, Subway) esses caminhos respondem **200 com HTML** — é fallback de SPA, não o ícone. Confira o `content-type` antes de acreditar no código de status.

Antes de aceitar uma logo, **renderize-a no badge real, a 46 px e ampliada**, sobre a cor da marca. Foi assim que Pizza Hut e Bob's foram reprovados e Subway e KFC aprovados.

## O que o validador cobra

Erros (derrubam a execução):

- categoria que não existe em `categorias.json`; rede no `index.json` sem arquivo, ou arquivo sem rede
- `logo` fora do padrão `assets/logos/<nome>.svg`, ou apontando para arquivo que não existe
- item sem `nome`, `porcao` ou `kcal`; campo numérico ausente
- valores fora de faixa (kcal 0–3000, sódio 0–6000 mg, macros 0–500 g)
- nome repetido dentro da mesma categoria
- gordura saturada maior que a gordura total; açúcares mais de 1 g acima dos carboidratos
- **macros que não cabem na porção**: `carb + prot + gord` em gramas acima do peso declarado
- `verificadoEm` fora de `AAAA-MM-DD`

Avisos (não derrubam, mas confira um a um):

- calorias declaradas que não fecham com `4·carb + 4·prot + 9·gord` por mais de 20%

Esse último é o pega-erro-de-digitação, e vale levá-lo a sério: foi ele que apontou que a tabela do Madero imprime os pares "por 100 g" e "por unidade de consumo" em **ordem trocada** em parte dos pratos — um erro que passaria despercebido em qualquer conferência visual.

A checagem de massa é mais nova e pega o que a de Atwater não vê. Atwater só olha a relação entre calorias e macros, que continua fechando mesmo com o peso errado; a de massa compara os macros com o peso declarado. Ao entrar, ela achou de primeira dois pesos impossíveis — um deles (`Molho Grogu`, do BK) já estava publicado havia dias: 65 g de gordura numa porção de 26 g. Nos dois casos o peso virou `"1 porção"` e os nutrientes ficaram como publicados, porque só o peso estava furado.

## Duas armadilhas ao mexer nos dados

**Arquivo novo entra no mesmo commit que a referência a ele.** Se o `index.json` citar uma rede cujo arquivo ficou de fora do `git add`, o deploy passa, o build fica verde e a rede some da tela sem erro nenhum — 404 silencioso. Vale igual para `assets/logos/`: a logo que não sobe cai calada na inicial. O validador e o passo 1 do smoke cobrem os dois casos.

**Maiúsculas e minúsculas.** O Windows ignora, o Linux da Vercel não. `data/Burger-King.json` referenciado como `burger-king` funciona aqui e quebra em produção. Confira letra por letra.

Depois do deploy, confirme que cada arquivo respondeu:

```bash
for f in index categorias mcdonalds burger-king kfc madero subway bobs; do
  printf "%-14s" "$f"
  curl -s -o /dev/null -w "%{http_code}\n" "https://refeicao-livre.vercel.app/data/$f.json?v=$RANDOM"
done
```

## Quando a fonte é o site do McDonald's

O site é protegido por Cloudflare: `curl` e qualquer busca do lado do servidor tomam **403**.
Um Chrome de verdade passa; o headless é detectado e fica preso na tela de verificação. O
caminho que funciona é o `driver.mjs` deste repo com `HEADFUL=1`:

```bash
HEADFUL=1 node .claude/skills/run-refeicao-livre/driver.mjs repl
> goto https://www.mcdonalds.com.br/cardapio/sanduiches-de-carne-bovina
> sleep 22000     # o desafio do Cloudflare leva uns 20 s para liberar
> eval <script>
```

Uma vez com a página aberta, **não navegue produto por produto**: o site é Nuxt e cada página
de categoria traz o payload `__NUXT_DATA__` com a tabela nutricional completa de todos os
produtos daquela seção. Um `fetch` de mesma origem, de dentro da página já liberada, busca as
14 categorias sem novo desafio. O payload é o formato achatado do devalue — um array em que os
valores de um objeto são **índices** para outras posições —, então precisa de um resolvedor
recursivo; ler com regex não funciona.

Uma armadilha de número: **o site alterna ponto e vírgula como separador decimal no mesmo
campo** — `1767.93` e `1441,0` são ambos miligramas de sódio. Nenhum valor usa separador de
milhar. Tratar o ponto como milhar multiplica o sódio por 100 e passa despercebido até o
validador reclamar da faixa.

## Quando a fonte é PDF

Os dois PDFs atuais têm texto de verdade (não são imagem), então dá para extrair com `pdfjs-dist` — **não** com regex em cima do stream: o Madero usa uma tabela de caracteres própria e um parser caseiro devolve lixo.

Duas coisas aprendidas extraindo esses dois, que valem para o próximo:

- **O `%VD` impresso ao lado de cada valor é a melhor conferência que existe.** Ele amarra o número à sua coluna: proteína 32 g com "63%" só fecha contra o VD de 50 g da RDC 429/2020. Foi assim que se confirmou o mapeamento das 12 colunas do BK e se descobriu a inversão dos pares no Madero.
- **Cuidado com tabelas que misturam duas bases de VD.** O PDF do BK tem linhas na RDC 429/2020 (proteína 50 g, sódio 2.000 mg) e linhas herdadas da RDC 360/2003 (proteína 75 g, sódio 2.400 mg). Só os percentuais mudam; os valores absolutos, que são os usados aqui, não.

Quando o número impresso é impossível — saturada maior que a gordura total, sódio que não bate com o próprio percentual —, o campo vai `null` e o motivo entra em `observacoes`. Não estime.
