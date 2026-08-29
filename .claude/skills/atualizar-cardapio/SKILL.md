---
name: atualizar-cardapio
description: Atualiza o cardápio de uma rede que já existe no Refeição Livre contra a tabela nutricional oficial mais recente. Use quando pedirem para atualizar, revisar ou reconferir os dados de uma rede já cadastrada, incluir item novo, remover item que saiu do cardápio, ou corrigir valores desatualizados. Palavras-chave: atualizar cardapio, revisar dados, item novo, item saiu, valores desatualizados, reconferir, tabela nutricional nova.
---

# Atualizar o cardápio de uma rede existente

Editar um item é trocar um número em `data/<rede>.json`. Não há build, não há
banco, não se toca em código.

As regras de dado e o formato do item estão em **`ATUALIZAR-CARDAPIO.md`**, com
os links das fontes por rede. Leia antes. Esta skill cobre só o que é exclusivo
de atualizar uma rede **que já está no app** — e o principal é o que **não** se
pode perder no caminho.

Para incluir uma rede que ainda não existe, use a skill `adicionar-rede`.

---

## O risco desta operação: reextração apaga decisão tomada à mão

Os JSON de `data/` **não são saída crua de um extrator**. Cada um carrega
decisões que custaram investigação:

| Rede | O que foi decidido à mão |
|---|---|
| McDonald's | `gordSat: null` em Salada Mix Crispy Beef e McColosso Creme Crocante; `acucar: null` em Moca Mix — a fonte publica valor impossível |
| Burger King | `sodio: null` em Cheddar Duplo Crispy; `gordSat: null` em Chicken Jr. — mesma razão |
| Madero | campo `alerta` nos itens em que as calorias não fecham com os próprios macros; nomes desambiguados por porção |

Rodar o extrator de novo e sobrescrever o arquivo **reintroduz silenciosamente os
números errados** — 45 g de gordura saturada num sanduíche que tem 21 g de
gordura total, sódio de 3 mg marcado como 6% do VD. O validador pega alguns, mas
não todos: o `alerta` do Madero, por exemplo, some sem que nada reclame.

**Portanto:** ao reextrair, compare com o arquivo atual e **reaplique** as
correções que continuarem valendo. Se a rede tiver corrigido a fonte, ótimo —
tire o `null` e registre em `observacoes` que foi corrigido na origem. O que não
pode é a correção sumir sem alguém decidir.

## Passo 1 — a fonte mudou?

Pegue a URL em `fonte.url` do próprio JSON e compare a data impressa no documento
com `fonte.atualizadoEm`:

- **Burger King** — "Última atualização" no rodapé do PDF
- **Madero** — carimbo tipo `MD STH MAIO/2026` no rodapé
- **McDonald's** — não há carimbo; o site é sempre a versão corrente

Cuidado com PDF antigo circulando: existe um `Tabela-Nutricional-Geral.pdf` do BK
de **janeiro de 2024** com valores diferentes do `TABELA_NUTRICIONAL_BK.pdf` de
**maio de 2026**, os dois no domínio oficial. Confira a data, não o nome do
arquivo.

**Se a fonte não mudou**, ainda assim atualize `verificadoEm` para hoje e
commite: o rodapé do app mostra essa data, e ela é a promessa de que alguém
olhou. É uma mudança legítima de uma linha.

## Passo 2 — extrair e comparar, não substituir

Extraia para um arquivo **novo** no scratchpad e faça o diff contra o de `data/`.
O que interessa no diff:

- **item novo** → acrescente
- **item que sumiu da fonte** → remova (não deixe "por garantia": o app promete o
  cardápio atual)
- **valor que mudou** → confira o `%VD` impresso antes de aceitar; receita mudada
  e erro de extração produzem o mesmo sintoma
- **item que ganhou/perdeu campo** → se a fonte passou a publicar o que faltava,
  tire o `null` e ajuste `observacoes`

As armadilhas de extração por fonte (Cloudflare e o payload do Nuxt no
McDonald's, o `%VD` como conferência, as duas bases de VD do BK, os pares
trocados do Madero, o separador decimal) estão em `ATUALIZAR-CARDAPIO.md` e no
`CLAUDE.md`. Não as redescubra.

## Passo 3 — mexer só no que mudou

Prefira editar as linhas do JSON existente a regravar o arquivo inteiro. Um diff
pequeno é revisável; um arquivo regravado esconde a mudança real no meio de
reordenação e reformatação.

Se precisar regravar mesmo assim, mantenha a ordenação alfabética dentro de cada
categoria e a ordem das categorias — senão o diff vira ruído.

Atualize `verificadoEm` sempre, e `fonte.atualizadoEm` quando a fonte for nova.

## Passo 4 — validar e testar

```bash
node scripts/validar-dados.mjs
node .claude/skills/run-refeicao-livre/driver.mjs smoke
```

O validador precisa sair com 0. Os avisos **não** derrubam, mas confira cada um
contra a fonte antes de seguir — o aviso de Atwater (calorias que não fecham com
os macros) é o pega-erro-de-transcrição, e foi ele que expôs o erro sistemático
do Madero.

**O smoke vai quebrar de propósito** se você mexeu no que ele trava:

| Checagem | Valor atual |
|---|---|
| itens do Burger King | 107 |
| Big Mac + WHOPPER® Jr. | `524 + 388 = 912` kcal |
| 912 kcal sobre 2.400 | "38% do seu gasto diário" |
| redes no portal | `["McDonald's", "Burger King", "Madero"]` |

Quebrou? **Confira o número novo contra a fonte e atualize a asserção.** Nunca
afrouxe a checagem para ela passar — ela existe para avisar exatamente agora.

## Passo 5 — commit e deploy

Descreva no commit **o que mudou no cardápio**, não "atualiza dados": item novo,
item removido, valor corrigido, e a data da fonte. É o histórico que responde
"desde quando esse número é esse".

Depois do deploy, confirme com cache-buster — o browser reporta o JSON antigo
mesmo após recarregar:

```bash
curl -s "https://refeicao-livre.vercel.app/data/<rede>.json?v=$RANDOM" \
  | grep -o '"verificadoEm": "[^"]*"'
```

## O que NÃO fazer

- Não sobrescreva o JSON com saída crua de extrator sem reaplicar as correções
  manuais — é a forma mais fácil de reintroduzir número errado.
- Não preencha com `0` o campo que a fonte deixou de publicar; use `null`.
- Não estime valor impossível — `null` e o motivo em `observacoes`.
- Não deixe item que saiu do cardápio "por garantia".
- Não relaxe asserção do smoke; atualize o valor esperado.
- Não troque a fonte por um agregador (FatSecret, Tabela TACO Online, Scribd)
  porque a oficial ficou difícil de ler. Se a oficial saiu do ar, relate.
