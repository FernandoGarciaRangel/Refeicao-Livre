---
name: run-refeicao-livre
description: Roda, pilota e tira screenshot do Refeição Livre (cardápio de fast food com tabela nutricional oficial, HTML/CSS/JS puro com dados em JSON). Use para iniciar/subir o app, abrir em localhost, navegar entre redes e categorias, buscar item, montar uma refeição, conferir a soma de calorias, testar tema claro/escuro, capturar tela, rodar o smoke end-to-end, ou confirmar que uma mudança de cardápio aparece no app de verdade. Palavras-chave: run, start, dev, serve, screenshot, driver, headless, e2e, smoke, cardapio, nutricional, refeicao livre, fast food.
---

# Rodar e pilotar o Refeição Livre

Uma página só: `index.html` + `tokens.css` + `styles.css` + `app.js` (IIFE, sem
módulos). **Sem build, sem npm, sem dependências em runtime.** A diferença para
os outros apps do workspace é que os cardápios não estão no HTML: são arquivos
JSON em `data/`, lidos por `fetch` na abertura.

O caminho do agente é o **driver**: `.claude/skills/run-refeicao-livre/driver.mjs`.
Ele sobe um servidor estático, lança o Chrome headless e fala CDP direto pelo
`WebSocket` nativo do Node — zero dependências, nada de Playwright.

Todos os caminhos abaixo são relativos a `refeicao-livre/`.

## Pré-requisitos

Só Node ≥ 22 (pelo `WebSocket` global) e o Chrome instalado. Não existe
`package.json` — não há `npm install`, nem lint, nem testes unitários. As duas
suítes deste repo são o **smoke do driver** e o **validador de dados**
(`node scripts/validar-dados.mjs`), e elas cobrem coisas diferentes: o validador
olha os JSON sem abrir browser; o smoke olha a tela.

O driver acha o Chrome sozinho em
`C:/Program Files/Google/Chrome/Application/chrome.exe` (também tenta Program
Files (x86), LocalAppData, Edge e caminhos de Linux); se estiver noutro lugar,
`CHROME=<caminho do exe>`.

## Run (caminho do agente) — comece por aqui

### Smoke test end-to-end

22 checagens: carrega a lista de redes, confere que as logos dos badges
carregaram de verdade, que todo JSON de `data/` responde e faz parse, mede o `h1`
em três larguras, abre um cardápio por URL, confere a busca, o detalhe com os
macros, a refeição somada **entre redes**, o percentual do gasto diário, o tema
claro e o console limpo. Gera 3 screenshots em `.claude-shots/`.

```bash
node .claude/skills/run-refeicao-livre/driver.mjs smoke
```

Saída atual: `OK: 22/22 checagens passaram`.

Os números de referência estão conferidos contra a fonte oficial — se mudar um
cardápio, é aqui que quebra primeiro, **de propósito**:

| Checagem | Valor travado |
|---|---|
| itens do Burger King | 107 |
| Big Mac + WHOPPER® Jr. | `524 + 388 = 912` kcal |
| 912 kcal sobre 2.400 | "38% do seu gasto diário" |
| redes no portal | `["McDonald's", "Burger King", "KFC", "Madero", "Bob's"]` |

Quebrou depois de atualizar cardápio? Confira o número novo contra a fonte e
**atualize o smoke** — não relaxe a asserção.

### REPL: um comando por linha no stdin

```bash
node .claude/skills/run-refeicao-livre/driver.mjs repl <<'EOF'
goto /#/burger-king
wait document.querySelectorAll('.item-topo').length > 0
fill #busca whopper jr
eval [...document.querySelectorAll('.item-nome')].map(e => e.textContent)
click .lista li:first-child .btn-add
eval document.getElementById('pratoKcal').textContent
eval JSON.stringify(window.refeicaoLivre.somaPrato().soma)
errors
quit
EOF
```

Saída real desse bloco:

```
ok eval ["WHOPPER® Jr."]
ok click .lista li:first-child .btn-add {"x":369,"y":450}
ok eval "388 kcal"
ok eval "{\"kcal\":388,\"carb\":29,...}"
ok errors 0
```

Comandos: `goto`, `click`, `fill`, `press`, `text`, `eval`, `wait`, `fit`,
`shot`/`shotfull`, `size`, `offline`, `console`, `errors`, `sleep`, `quit`.
Cada linha responde `ok …` ou `err …`. Screenshots caem em `.claude-shots/`
(gitignorado); `OUT_DIR=<dir>` muda, `HEADFUL=1` abre janela de verdade.

### Handles expostos

`window.refeicaoLivre` existe e dá `{ estado, aplicaTema, somaPrato }`. É por
ele que se troca o tema sem clicar (`window.refeicaoLivre.aplicaTema('light')`)
e se lê a soma da refeição sem raspar a tela.

## Gotchas

- **Navegar por hash não recarrega a página — e isso cria uma corrida.**
  `goto /#/mcdonalds` troca o `location.hash`, o `hashchange` dispara e o app
  busca o JSON da rede nova de forma assíncrona. Um
  `wait document.querySelectorAll('.item-topo').length > 0` logo depois passa
  **na hora**, olhando a lista da rede *anterior*, que ainda está no DOM. Espere
  pelo nome da rede já pintado:
  `wait document.getElementById("redeNome").textContent === "Burger King"`.
  Foi exatamente isso que fez o passo 7 do smoke falhar na primeira versão.

- **`file://` não serve este app.** Abrir o `index.html` do disco dá erro de
  CORS no `fetch` dos JSON. O app detecta `location.protocol === 'file:'` e
  mostra a instrução, mas para pilotar use sempre o driver ou
  `npx serve . -l 8082`.

- **A busca é normalizada; os nomes oficiais não.** Os nomes trazem símbolos que
  ninguém digita: `WHOPPER® Jr.`, `Big King™`. `app.js` tem `normaliza()`, que
  tira acentos, `®™©` e pontuação dos dois lados da comparação — então
  `whopper jr` acha `WHOPPER® Jr.` e `acucar` acha `Açúcar`. Se for asserir
  nome, use o texto **oficial** (com o `®`); se for digitar busca, o texto
  simples basta.

- **`innerText` devolve o texto já transformado pelo CSS.** `.grupo-titulo` tem
  `text-transform: uppercase`, então `innerText` dá `"HAMBÚRGUERES"` e
  `textContent` dá `"Hambúrgueres"`. Para comparar com `data/categorias.json`,
  que guarda o nome com a caixa original, use `textContent`.

- **Trocar de rede zera a busca, trocar de categoria não.** É intencional: um
  termo da rede anterior deixaria o cardápio novo vazio sem nada na tela
  explicando por quê. Ao escrever passos, não assuma que o campo continua
  preenchido depois de um `goto` para outra rede.

- **O `h1` some se transbordar, e `scrollWidth` não detecta.** `.intro h1` usa
  `background-clip: text` com `color: transparent`: o excedente fica invisível,
  sem scrollbar e sem erro, e `scrollWidth === clientWidth` continua verdadeiro.
  Use `fit .intro h1` (mede o texto com um `Range`), como o passo 3 do smoke faz.

- **Campo com `—` no detalhe é dado ausente na fonte, não bug.** Onde a rede não
  publica um valor, o JSON traz `null` e a UI mostra `—`; o total da refeição
  então se marca como parcial. Não "conserte" isso preenchendo com zero — ver o
  `CLAUDE.md` do repo.

- **`offline` não serve para nada aqui.** O comando existe no driver (é o mesmo
  harness dos outros apps) e corta CDN e Firebase. Este app não usa Firebase; o
  comando roda, responde `ok` e não muda nada. Cortar CDN só derruba as fontes.

- **`shotfull` pinta elementos `fixed` na altura do viewport.** A barra "Sua
  refeição" é `position: fixed` no rodapé e aparece no meio da imagem. Para
  screenshot limpo, use `shot`.

## Troubleshooting

| Sintoma | Causa / correção |
|---|---|
| Lista vazia depois de trocar de rede | Corrida do hash: esperou por `.item-topo` em vez do `redeNome`. |
| Busca não acha um item que existe | O nome tem `®`/`™`. A busca normaliza, mas a *asserção* precisa do texto oficial. |
| `sem elemento: .lista li:first-child` | O filtro atual não casou com nada. Cheque `#busca` antes de clicar. |
| Categoria "não existe em categorias.json" | Comparou `innerText` (caixa alta pelo CSS) em vez de `textContent`. |
| Smoke falha na contagem de itens | Cardápio atualizado. Confira contra a fonte e atualize o número no smoke. |
| Tela com instrução de `npx serve` | Abriu por `file://`. Use o driver ou um servidor. |
| `Chrome não encontrado` | `CHROME=<caminho do chrome.exe>`. |
| `Chrome não abriu a porta de debug em 20000ms` | Sobrou um Chrome do driver travado: `taskkill //F //IM chrome.exe` ou reinicie. |
