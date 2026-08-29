# Refeição Livre

Guia de refeição livre: o cardápio das maiores redes de fast food, montado a partir da
**tabela nutricional oficial** de cada rede, organizado por restaurante e, dentro dele, por
tipo de alimento. Monte um prato e veja o total de calorias como percentual do seu gasto diário.

**App online:** [refeicao-livre.vercel.app](https://refeicao-livre.vercel.app/)

## Funcionalidades

- Cardápio por rede → tipo de alimento (hambúrgueres, frango, acompanhamentos, molhos, bebidas, shakes, sobremesas…)
- Busca por nome e ordenação por nome ou por calorias
- Detalhe do item com carboidratos, açúcares, proteína, gordura, saturada, fibra e sódio
- **Monte sua refeição**: soma os macros e mostra o total como % do gasto diário, com link para a Calculadora TMB
- Temas escuro e claro, com preferência lembrada
- Link direto por URL: `#/burger-king/hamburgueres`

## Redes cobertas

| Rede | Itens | Fonte | Atualizada pela rede em |
|---|---:|---|---|
| McDonald's | 165 | Cardápio oficial, tabela por produto | 08/2026 |
| Burger King | 107 | PDF oficial (ZAMP S.A.) | 29/05/2026 |
| KFC | 54 | Tabela oficial no site, com peso da porção | 08/2026 |
| Madero | 101 | PDF oficial bilíngue | 05/2026 |

**427 itens** no total.

Acrescentar uma rede é criar um JSON — veja **[ATUALIZAR-CARDAPIO.md](ATUALIZAR-CARDAPIO.md)**.

## Stack

HTML, CSS e JavaScript vanilla. Sem build, sem framework, sem dependências em runtime.
Os cardápios são arquivos JSON em `data/`, lidos por `fetch` na hora.

```
index.html    tela e markup
tokens.css    tokens do sistema "Preto & Laranja" (cópia idêntica nos apps do workspace)
styles.css    componentes
app.js        estado, rotas por hash, refeição montada
data/         index.json, categorias.json e um arquivo por rede
assets/logos/ a logo de cada rede, branca, referenciada pelo index.json
scripts/      validar-dados.mjs
```

## Rodar localmente

```bash
npx serve . -l 8082
```

A porta é fixa por convenção — os apps do workspace têm portas próprias para subirem ao
mesmo tempo, e o botão **← Apps** só encontra o hub local se ele estiver em 8080:

| App | Porta |
|---|---|
| Apps-Hub | 8080 |
| Calculadora TMB | 8081 |
| **Refeição Livre** | **8082** |
| WeightChartS | 3000 |

**Abrir o `index.html` direto do disco não funciona.** O app busca os cardápios por `fetch`,
que o `file://` bloqueia; a tela avisa e mostra o comando acima em vez de falhar calada.

## Conferir os dados

```bash
node scripts/validar-dados.mjs
```

## Aviso

Os valores são compilados das tabelas nutricionais **oficiais** de cada rede, com link para a
fonte e data de verificação indicados no rodapé de cada cardápio. Marcas e nomes de produtos
pertencem aos respectivos titulares; este projeto **não tem afiliação nem patrocínio** de
nenhuma delas. Cardápios mudam com frequência e o valor informado no restaurante prevalece.
A informação é de referência e não substitui orientação nutricional profissional.

Onde a fonte oficial publica um valor impossível — gordura saturada maior que a total, sódio
que não fecha com o próprio percentual —, o campo fica vazio (`—`) em vez de estimado, e o
motivo está registrado nas observações da rede.

## Licença

MIT.
