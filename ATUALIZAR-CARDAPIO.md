# Como atualizar um cardápio

As redes mudam cardápio o tempo todo. Atualizar aqui é editar um arquivo JSON e rodar o validador — não há build, não há banco, não há código a tocar.

## O ciclo

```bash
# 1. baixe a fonte oficial da rede (links na tabela abaixo)
# 2. edite data/<rede>.json
# 3. confira
node scripts/validar-dados.mjs
# 4. suba o app e olhe
npx serve . -l 8082
# 5. commit
```

O validador sai com erro se algo não fecha. **Rode sempre antes de commitar** — ele é a diferença entre publicar um número certo e um número plausível.

## Fontes oficiais por rede

| Rede | Onde está a tabela | Formato |
|---|---|---|
| McDonald's | `https://www.mcdonalds.com.br/cardapio` | Site, uma tabela por produto |
| Burger King | `https://bk-media.burgerking.com.br/TABELA_NUTRICIONAL_BK.pdf` | PDF, uma página, duas colunas |
| Madero | `https://restaurantemadero.com.br/assets/site/arquivos/Tabela_Nutricional_Alergenicos.pdf` | PDF, 10 páginas, texto corrido bilíngue |

Cada `data/<rede>.json` guarda a URL da sua fonte no campo `fonte.url`. Se a rede mudar o endereço, mude lá também.

### Bob's: avaliado e deixado de fora

Não é falta de fonte — é incompatibilidade de base. O Bob's publica **por 100 g**, não por
porção: o rótulo do Big Bob diz `Porção: 100 g (3/7 unidade)` e `258 kcal`. As outras três redes
publicam por porção. Lado a lado na mesma tela, e somados no mesmo prato, o Big Bob apareceria
com pouco mais de um terço de um Whopper; a unidade inteira dá cerca de 602 kcal.

As duas saídas foram consideradas e recusadas: converter pela fração publicada dá um número
**calculado por nós**, o que este app não faz; publicar como está torna a comparação e a soma
da refeição enganosas, que é justamente o que o app existe para evitar.

Some-se o custo: o Bob's entrega a tabela só como **imagem PNG, uma por produto**
(`/cardapio/infonutricionais/<slug>`, com o `nutri_*.png` no HTML), e o cardápio é renderizado
no cliente. Seriam umas 50 transcrições visuais de número — o método menos confiável disponível.

Se um dia entrar, entra com um campo de base explícito no JSON e a UI mostrando a base ao lado
do valor; não como mais uma rede igual às outras.

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

### A regra que mais importa: `null`, nunca `0`

Quando a fonte **não publica** um valor, o campo vai `null`. Nunca `0`.

Um zero mentiroso entra na soma da refeição e produz um total errado com cara de certo — e a tela não tem como saber que aquilo foi inventado. Com `null`, a UI mostra `—` e marca o total como parcial. Todos os oito campos numéricos precisam estar presentes no JSON, nem que seja com `null`; o validador cobra isso.

### Acrescentar uma rede nova

1. Crie `data/<slug>.json` no mesmo formato (veja `burger-king.json`).
2. Acrescente a entrada em `data/index.json` com `slug`, `nome`, `cor` (hex de 6 dígitos) e `inicial`.
3. Use só os slugs de categoria que existem em `data/categorias.json` — se precisar de um tipo novo, acrescente lá primeiro.
4. Rode o validador.

O `slug` do arquivo, o nome do arquivo e o `slug` de dentro do JSON precisam ser os três iguais.

## O que o validador cobra

Erros (derrubam a execução):

- categoria que não existe em `categorias.json`; rede no `index.json` sem arquivo, ou arquivo sem rede
- item sem `nome`, `porcao` ou `kcal`; campo numérico ausente
- valores fora de faixa (kcal 0–3000, sódio 0–6000 mg, macros 0–500 g)
- nome repetido dentro da mesma categoria
- gordura saturada maior que a gordura total; açúcares mais de 1 g acima dos carboidratos
- `verificadoEm` fora de `AAAA-MM-DD`

Avisos (não derrubam, mas confira um a um):

- calorias declaradas que não fecham com `4·carb + 4·prot + 9·gord` por mais de 20%

Esse último é o pega-erro-de-digitação, e vale levá-lo a sério: foi ele que apontou que a tabela do Madero imprime os pares "por 100 g" e "por unidade de consumo" em **ordem trocada** em parte dos pratos — um erro que passaria despercebido em qualquer conferência visual.

## Duas armadilhas ao mexer nos dados

**Arquivo novo entra no mesmo commit que a referência a ele.** Se o `index.json` citar uma rede cujo arquivo ficou de fora do `git add`, o deploy passa, o build fica verde e a rede some da tela sem erro nenhum — 404 silencioso.

**Maiúsculas e minúsculas.** O Windows ignora, o Linux da Vercel não. `data/Burger-King.json` referenciado como `burger-king` funciona aqui e quebra em produção. Confira letra por letra.

Depois do deploy, confirme que cada arquivo respondeu:

```bash
for f in index categorias mcdonalds burger-king madero; do
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
