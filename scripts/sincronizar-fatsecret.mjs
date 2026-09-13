#!/usr/bin/env node
/**
 * sincronizar-fatsecret.mjs — regrava data/<rede>.json a partir da Platform API
 * do FatSecret, em vez de raspar o HTML do site.
 *
 *   node scripts/sincronizar-fatsecret.mjs milky-moo         # regrava o arquivo
 *   node scripts/sincronizar-fatsecret.mjs milky-moo --dry   # só mostra o que mudaria
 *
 * É script de MANUTENÇÃO, rodado à mão, não código de runtime. A API precisa de
 * chave e de IP na whitelist — nada disso pode viver no browser, e o app continua
 * lendo só os JSON de `data/`. Quem roda isto commita o resultado.
 *
 * ------------------------------------------------------------------ os planos
 *
 * O que o tier gratuito (scope `basic`) NÃO dá, medido na conta real:
 *
 *   - `foods/search/v3` responde "Missing scope: scope 'premier'". A v1 responde,
 *     mas devolve os nutrientes como FRASE (`food_description`), não como objeto.
 *   - `region`/`language` são premium: "Localization is a premium feature only made
 *     available to select accounts". Sem eles a busca vê só o índice dos EUA — e a
 *     Milky Moo é marca brasileira, cadastrada no fatsecret.com.br.
 *
 * A segunda é a que decide: se a busca sem `region` não achar a marca, este caminho
 * está fechado no plano gratuito, e não adianta mexer no código. O script diz isso
 * em vez de falhar com mensagem genérica.
 *
 * Por isso ele desce uma escada e informa por qual degrau passou:
 *
 *   busca:    v3 (premier, traz `servings` estruturado) → v1 (basic, traz frase)
 *   detalhe:  food/v2 por id (traz açúcar, gordura saturada, fibra e sódio)
 *             → frase da busca (só kcal, gordura, carboidrato e proteína)
 *
 * No degrau de baixo o resultado é o MESMO conteúdo que a raspagem já dava. O ganho
 * aí não é dado novo: é parar de depender do HTML e passar por interface documentada.
 *
 * -------------------------------------------------------------------- ambiente
 *
 * Credenciais (cadastro gratuito em platform.fatsecret.com), por variável de ambiente
 * ou num `.env` na raiz (já está no .gitignore) — este script lê o arquivo sozinho:
 *
 *   FATSECRET_KEY=<client_id>       FATSECRET_SECRET=<client_secret>
 *   FATSECRET_SCOPE=basic           # "basic premier localization" se a conta tiver
 *   FATSECRET_REGIAO=BR             # só funciona com localization; vazio = índice dos EUA
 *
 * O tier gratuito só emite token para IPs cadastrados no painel, e o painel avisa que
 * a mudança leva até 24 h para valer.
 *
 * Sem dependências — usa o fetch do Node ≥ 22.
 */

import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns';
import { fileURLToPath } from 'node:url';

// A whitelist do FatSecret guarda o IPv4 desta máquina. Numa rede de pilha dupla o
// Node pode resolver o host da API para IPv6 e sair pelo endereço v6 — que não está
// cadastrado, e o token volta 401 sem nada de errado na chave. Cadastrar o v6 não
// resolveria: o endereço temporário de privacidade rotaciona sozinho. Forçar a
// resolução para v4 resolve, e é inócuo em rede que só tem v4.
dns.setDefaultResultOrder('ipv4first');

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(RAIZ, 'data');

// ---------------------------------------------------------------- configuração

// Uma entrada por rede sincronizada. `marca` é o `brand_name` exato como a API o
// devolve: a busca é por texto livre e traz lixo de outras marcas junto, então o
// filtro é por igualdade, não por "contém".
const REDES = {
  'milky-moo': {
    nome: 'Milky Moo',
    marca: 'Milky Moo',
    busca: 'Milky Moo',
    categoria: 'shakes',
    // O rodapé do app transforma `fonte.url` em link para o usuário clicar, então
    // ele aponta para a página que um humano consegue abrir e conferir — não para
    // o endpoint REST, que pediria chave e não diria nada a ninguém.
    paginaPublica: 'https://www.fatsecret.com.br/calorias-nutri%C3%A7%C3%A3o/milky-moo',
    tipo: 'Levantamento do FatSecret (Platform API)',
  },
};

const OAUTH = 'https://oauth.fatsecret.com/connect/token';
const BUSCA_V3 = 'https://platform.fatsecret.com/rest/foods/search/v3';
const BUSCA_V1 = 'https://platform.fatsecret.com/rest/foods/search/v1';
const DETALHE_V2 = 'https://platform.fatsecret.com/rest/food/v2';

// ------------------------------------------------------------------- utilidades

const morre = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };

/** Lê o .env da raiz sem dependência. Variável de ambiente real tem precedência. */
function carregaEnv() {
  const arq = path.join(RAIZ, '.env');
  if (!fs.existsSync(arq)) return;
  for (const linha of fs.readFileSync(arq, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(linha);
    if (!m) continue;
    const valor = m[2].replace(/^["']|["']$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
  }
}

/**
 * A API herdou do XML o hábito de devolver objeto quando há um resultado só e
 * array quando há vários. Ler `.length` direto perde o caso de um item.
 */
const lista = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);

/** Número ou null. Campo ausente é ausente — nunca 0 (ver ATUALIZAR-CARDAPIO.md). */
function num(v, casas) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

/** "120" + "ml" -> "120 ml"; decimal com vírgula, como no resto do repo. */
function porcaoDe(serving) {
  const qtd = num(serving.metric_serving_amount, 2);
  const un = (serving.metric_serving_unit || '').trim();
  if (qtd !== null && un) return `${String(qtd).replace('.', ',')} ${un}`;
  return (serving.serving_description || '').trim() || '1 porção';
}

/**
 * "120ml" -> "120 ml", e traduz a porção genérica: o índice dos EUA descreve em
 * inglês, e "1 serving" apareceria cru na tela de um app em pt-BR.
 */
function separaUnidade(s) {
  const t = s.trim().replace(/^([\d.,]+)\s*(g|ml|kg|l|oz)$/i, (_, n, u) => `${n} ${u.toLowerCase()}`);
  return t.replace(/\b(\d+)?\s*servings?\b/i, (_, n) => (n ? `${n} porção` : 'porção')).trim();
}

/** Erro de escopo é degrau da escada, não falha: precisa ser reconhecido, não abortado. */
const semEscopo = (corpo) => /missing scope|scope '?(premier|localization)/i.test(corpo);

// ------------------------------------------------------------------------- API

async function pegaToken() {
  const id = process.env.FATSECRET_KEY;
  const segredo = process.env.FATSECRET_SECRET;
  if (!id || !segredo) {
    morre('faltam FATSECRET_KEY e FATSECRET_SECRET (no ambiente ou num .env na raiz).\n'
        + '  Cadastro gratuito em https://platform.fatsecret.com — e cadastre o IP desta\n'
        + '  máquina na whitelist do painel, senão o token vem 401.');
  }
  const r = await fetch(OAUTH, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${id}:${segredo}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      scope: process.env.FATSECRET_SCOPE || 'basic',
    }),
  });
  const corpo = await r.text();
  if (!r.ok) {
    // Conferido contra o servidor: credencial errada devolve 400 invalid_client.
    // Então 400/invalid_client é chave, e 401/403 é quase sempre IP — vale saber
    // qual dos dois antes de sair regerando segredo no painel à toa.
    const dica = /invalid_client/.test(corpo)
      ? '  invalid_client = par chave/segredo nao confere. Copie os dois de novo do painel.'
      : /invalid_scope/.test(corpo)
      ? '  invalid_scope = a conta nao tem esse scope. Tire FATSECRET_SCOPE do .env para usar "basic".'
      : '  Sem invalid_client, o suspeito e o IP: so os enderecos cadastrados na whitelist\n'
      + '  emitem token, e o painel avisa que a mudanca leva ate 24 h para valer.';
    morre(`token: HTTP ${r.status} — ${corpo.slice(0, 300)}\n${dica}`);
  }
  const j = JSON.parse(corpo);
  if (!j.access_token) morre(`token: resposta sem access_token — ${corpo.slice(0, 300)}`);
  return j.access_token;
}

/** GET autenticado. Devolve {ok, json, corpo} em vez de lançar: o chamador decide. */
async function chama(base, params, token) {
  const url = new URL(base);
  url.search = new URLSearchParams({ format: 'json', ...params });
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const corpo = await r.text();
  let json = null;
  try { json = JSON.parse(corpo); } catch { /* erro em texto puro */ }
  // A API responde 200 com `{"error": …}` em parte dos casos, então o status não basta.
  const erro = json?.error ? (json.error.message ?? JSON.stringify(json.error)) : null;
  return { ok: r.ok && !erro, status: r.status, json, corpo: erro ?? corpo };
}

/**
 * O envelope da resposta já mudou de forma entre versões (`foods` na v1,
 * `foods_search` na v3), então em vez de fixar o caminho a extração procura a
 * primeira chave `food` que aparecer na árvore. Custa nada e sobrevive à v4.
 */
function achaFoods(no) {
  if (no == null || typeof no !== 'object') return null;
  if (no.food !== undefined) return lista(no.food);
  for (const v of Object.values(no)) {
    const achou = achaFoods(v);
    if (achou) return achou;
  }
  return null;
}

/** Desce a escada de busca e devolve {foods, versao}. */
async function busca(token, expressao) {
  const fixture = process.env.FATSECRET_FIXTURE;
  if (fixture) {
    console.log(`  (fixture: ${fixture} — nenhuma chamada de rede)`);
    return { foods: achaFoods(JSON.parse(fs.readFileSync(fixture, 'utf8'))) ?? [], versao: 'fixture' };
  }

  // Medido em 2026-09-13 no plano basic: `region=BR` NÃO dá erro — é aceito e
  // ignorado, devolvendo o mesmo índice dos EUA. Isso é pior que recusar, porque
  // quem passa a variável acredita estar buscando no Brasil. O aviso existe para
  // essa pessoa não concluir que a marca "sumiu do FatSecret".
  const regiao = process.env.FATSECRET_REGIAO
    ? { region: process.env.FATSECRET_REGIAO, language: process.env.FATSECRET_IDIOMA || 'pt' }
    : {};
  if (Object.keys(regiao).length) {
    console.log(`  ⚠ region=${regiao.region} enviado — se a conta nao tiver o scope localization,`);
    console.log('    a API aceita e IGNORA o parametro, devolvendo o indice dos EUA sem avisar.');
  }

  for (const [base, versao] of [[BUSCA_V3, 'v3'], [BUSCA_V1, 'v1']]) {
    const todos = [];
    let degrauCaiu = false;

    for (let pagina = 0; pagina < 20; pagina++) {
      const r = await chama(base, {
        search_expression: expressao,
        max_results: '50',
        page_number: String(pagina),
        ...regiao,
      }, token);

      if (!r.ok) {
        if (semEscopo(r.corpo) && versao === 'v3') {
          console.log(`  busca v3 indisponivel no plano (${r.corpo.trim()}) — caindo para a v1`);
          degrauCaiu = true;
          break;
        }
        if (semEscopo(r.corpo) && Object.keys(regiao).length) {
          morre(`busca ${versao}: ${r.corpo}\n`
              + '  region/language sao premium. Tire FATSECRET_REGIAO do .env e rode de novo —\n'
              + '  mas saiba que sem regiao a busca ve so o indice dos EUA.');
        }
        morre(`busca ${versao} (pagina ${pagina}): HTTP ${r.status} — ${String(r.corpo).slice(0, 300)}`);
      }

      const foods = achaFoods(r.json) ?? [];
      todos.push(...foods);
      if (foods.length < 50) break;
    }

    if (!degrauCaiu) return { foods: todos, versao };
  }
  return { foods: [], versao: 'nenhuma' };
}

/**
 * Detalhe por id, que é o único jeito de obter açúcar, gordura saturada, fibra e
 * sódio. Se o plano não liberar, devolve null uma vez e o chamador para de tentar —
 * insistir por item gastaria 16 chamadas para 16 negativas iguais.
 */
async function detalhe(token, foodId) {
  const r = await chama(DETALHE_V2, { food_id: String(foodId) }, token);
  if (!r.ok) return { indisponivel: true, motivo: String(r.corpo).slice(0, 160) };
  const food = r.json?.food ?? achaFoods(r.json)?.[0] ?? null;
  return { food };
}

// -------------------------------------------------------------------- mapeamento

/**
 * Escolhe qual `serving` vira o item. A prioridade é a porção que já está no
 * arquivo: trocar de porção entre sincronizações mudaria as calorias do item sem
 * que a fonte tivesse mudado nada, e o diff pareceria erro de extração.
 */
function escolheServing(food, porcaoAtual) {
  const servings = lista(food.servings?.serving).filter((s) => s && s.calories != null);
  if (!servings.length) return null;
  if (porcaoAtual) {
    const igual = servings.find((s) => porcaoDe(s) === porcaoAtual);
    if (igual) return igual;
  }
  return servings.find((s) => String(s.is_default) === '1') ?? servings[0];
}

function itemDeServing(nome, serving) {
  return {
    nome,
    porcao: porcaoDe(serving),
    kcal: num(serving.calories, 0),
    carb: num(serving.carbohydrate, 1),
    acucar: num(serving.sugar, 1),
    prot: num(serving.protein, 1),
    gord: num(serving.fat, 1),
    gordSat: num(serving.saturated_fat, 1),
    fibra: num(serving.fiber, 1),
    sodio: num(serving.sodium, 0),
  };
}

/**
 * Degrau de baixo: a v1 resume tudo numa frase.
 *   "Per 120ml - Calories: 241kcal | Fat: 9.10g | Carbs: 38.00g | Protein: 2.10g"
 * Os quatro campos que ela traz são os mesmos que a raspagem dava; o resto fica null,
 * como manda a regra — campo que a fonte não publica não se estima.
 */
function itemDeDescricao(nome, descricao) {
  if (!descricao) return null;
  const campo = (rot) => {
    const m = new RegExp(`${rot}:\\s*([\\d.,]+)`, 'i').exec(descricao);
    return m ? num(m[1], 1) : null;
  };
  const porcao = /^Per\s+(.+?)\s*-\s*Calories/i.exec(descricao)?.[1]?.trim();
  const kcal = campo('Calories');
  if (kcal === null) return null;
  return {
    nome,
    porcao: porcao ? separaUnidade(porcao) : '1 porção',
    kcal: Math.round(kcal),
    carb: campo('Carbs'),
    acucar: null,
    prot: campo('Protein'),
    gord: campo('Fat'),
    gordSat: null,
    fibra: null,
    sodio: null,
  };
}

/** 4·carb + 4·prot + 9·gord contra as kcal declaradas — pega erro de mapeamento. */
function atwater(it) {
  if ([it.kcal, it.carb, it.prot, it.gord].some((v) => typeof v !== 'number')) return null;
  if (it.kcal <= 40) return null;
  const calc = 4 * it.carb + 4 * it.prot + 9 * it.gord;
  return Math.round(((calc - it.kcal) / it.kcal) * 100);
}

// ------------------------------------------------------------------------ main

carregaEnv();

const slug = process.argv[2];
const seco = process.argv.includes('--dry');
if (!slug || !REDES[slug]) {
  morre(`uso: node scripts/sincronizar-fatsecret.mjs <${Object.keys(REDES).join('|')}> [--dry]`);
}
const cfg = REDES[slug];
const destino = path.join(DATA, `${slug}.json`);
const atual = fs.existsSync(destino) ? JSON.parse(fs.readFileSync(destino, 'utf8')) : null;

// As porções já escolhidas, para a sincronização não trocá-las sozinha.
const porcaoPorNome = new Map();
for (const cat of atual?.categorias ?? []) {
  for (const it of cat.itens) porcaoPorNome.set(it.nome, it.porcao);
}

console.log(`\nSincronizando ${cfg.nome} pela Platform API do FatSecret\n`);

const token = process.env.FATSECRET_FIXTURE ? null : await pegaToken();
const { foods: crus, versao } = await busca(token, cfg.busca);
console.log(`  busca ${versao}: ${crus.length} resultado(s) para "${cfg.busca}"`);

const daMarca = crus.filter((f) => String(f.brand_name ?? '').trim() === cfg.marca);
console.log(`  ${daMarca.length} com brand_name === "${cfg.marca}"`);

if (!daMarca.length) {
  const marcas = [...new Set(crus.map((f) => f.brand_name).filter(Boolean))].slice(0, 8);
  morre('nenhum item da marca voltou — nao vou sincronizar com zero item, isso apagaria a rede.\n'
      + (marcas.length ? `  Marcas que vieram: ${marcas.join(', ')}\n` : '  A busca nao devolveu marca nenhuma.\n')
      + '\n  Causa mais provavel: o plano gratuito ve so o indice dos EUA, e a Milky Moo e\n'
      + '  marca brasileira. region/language sao premium ("Localization is a premium feature\n'
      + '  only made available to select accounts"), entao nao ha ajuste de codigo que resolva.\n'
      + '  Se for isso, o caminho da API esta fechado no plano gratuito — mantenha o dado atual.');
}

// ---- monta os itens, tentando o detalhe antes de cair na frase
const itens = [];
const semDado = [];
let detalheOff = null;

for (const food of daMarca) {
  const nome = String(food.food_name).trim();
  let item = null;

  if (food.servings) {
    const s = escolheServing(food, porcaoPorNome.get(nome));
    if (s) item = itemDeServing(nome, s);
  }

  // Em modo fixture não existe token: sair para a rede aqui mandaria "Bearer null".
  if (!item && !detalheOff && food.food_id && !process.env.FATSECRET_FIXTURE) {
    const d = await detalhe(token, food.food_id);
    if (d.indisponivel) {
      detalheOff = d.motivo;
      console.log(`  detalhe por id indisponivel (${d.motivo}) — usando a frase da busca`);
    } else if (d.food) {
      const s = escolheServing(d.food, porcaoPorNome.get(nome));
      if (s) item = itemDeServing(nome, s);
    }
  }

  if (!item) item = itemDeDescricao(nome, food.food_description);
  if (!item) { semDado.push(nome); continue; }
  itens.push(item);
}
itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

if (semDado.length) console.log(`  ⚠ ${semDado.length} sem valor nutricional, ficaram de fora: ${semDado.join(', ')}`);

// ---- o que mudou em relação ao arquivo em disco
const antes = new Map();
for (const cat of atual?.categorias ?? []) for (const it of cat.itens) antes.set(it.nome, it);
const novos = itens.filter((it) => !antes.has(it.nome)).map((it) => it.nome);
const sumidos = [...antes.keys()].filter((n) => !itens.some((it) => it.nome === n));
const mudados = [];
for (const it of itens) {
  const v = antes.get(it.nome);
  if (!v) continue;
  const difs = Object.keys(it).filter((k) => JSON.stringify(v[k]) !== JSON.stringify(it[k]));
  if (difs.length) mudados.push(`${it.nome}: ${difs.map((k) => `${k} ${JSON.stringify(v[k])}→${JSON.stringify(it[k])}`).join(', ')}`);
}

console.log('');
console.log(`  itens: ${antes.size} → ${itens.length}`);
if (novos.length) console.log(`  novos:   ${novos.join(', ')}`);
if (sumidos.length) console.log(`  sumiram: ${sumidos.join(', ')}`);
for (const m of mudados) console.log(`  mudou   ${m}`);

// Aviso de Atwater aqui também, para o desvio aparecer antes do commit e não só no
// validador — a diferença é que aqui dá para reconferir com a resposta na mão.
const fora = itens.map((it) => [it.nome, atwater(it)]).filter(([, d]) => d !== null && Math.abs(d) > 20);
if (fora.length) {
  console.log('');
  for (const [nome, d] of fora) console.log(`  ⚠ Atwater ${nome}: ${d > 0 ? '+' : ''}${d}%`);
}

const hoje = new Date().toISOString().slice(0, 10);
const saida = {
  slug,
  nome: cfg.nome,
  fonte: {
    url: cfg.paginaPublica,
    tipo: cfg.tipo,
    oficial: false,
    atualizadoEm: hoje,
  },
  verificadoEm: hoje,
  // O texto é curado à mão: descreve os defeitos da fonte, que nenhuma API informa.
  // Preservado do arquivo em disco para uma sincronização não apagar o que se sabe.
  observacoes: atual?.observacoes ?? '',
  categorias: [{ slug: cfg.categoria, itens }],
};

if (seco) {
  console.log('\n--dry: nada gravado.\n');
  process.exit(0);
}

// Sincronizar é sobrescrever: uma busca que voltou pela metade — API instável,
// marca renomeada, registro removido pelo FatSecret — apagaria itens reais sem
// pedir licença, e o app não teria como saber que sumiram. Perder muita coisa de
// uma vez é sinal de fonte quebrada, não de cardápio encolhido.
const perda = antes.size ? sumidos.length / antes.size : 0;
if (perda > 0.3 && !process.argv.includes('--force')) {
  morre(`a sincronização perderia ${sumidos.length} dos ${antes.size} itens (${Math.round(perda * 100)}%).\n`
      + '  Confira a resposta antes: rode com --dry e olhe a lista de "sumiram".\n'
      + '  Se a perda for real (a rede tirou os sabores do cardápio), repita com --force.');
}

fs.writeFileSync(destino, JSON.stringify(saida, null, 2) + '\n');
console.log(`\n✓ ${path.relative(RAIZ, destino)} regravado.`);
console.log('  Agora: node scripts/validar-dados.mjs && node .claude/skills/run-refeicao-livre/driver.mjs smoke\n');
