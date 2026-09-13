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
 * Por que a API e não o site: a raspagem do HTML dependia de o FatSecret continuar
 * imprimindo `|Cals|241|` naquela ordem, e só entregava quatro campos (kcal, gordura,
 * carboidrato, proteína). A API devolve o objeto `serving` inteiro, então açúcar,
 * gordura saturada, fibra e sódio podem deixar de ser `null` — quando o registro
 * de origem os tiver. O que NÃO muda: o número continua sendo de terceiro, não da
 * rede. O `fonte.oficial: false` fica.
 *
 * Credenciais (cadastro gratuito em platform.fatsecret.com), por variável de ambiente:
 *
 *   FATSECRET_KEY=<client_id>  FATSECRET_SECRET=<client_secret>  node scripts/…
 *
 * ou num `.env` na raiz (já está no .gitignore) — este script lê o arquivo sozinho,
 * sem dependência.
 *
 * O tier gratuito só emite token para IPs cadastrados no painel. Erro 401 na etapa
 * do token com credencial certa costuma ser IP fora da whitelist, não chave errada.
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

const API = 'https://platform.fatsecret.com/rest/foods/search/v3';
const OAUTH = 'https://oauth.fatsecret.com/connect/token';
const REGIAO = { region: 'BR', language: 'pt' };

// ------------------------------------------------------------------- utilidades

const morre = (m) => { console.error(`\n✗ ${m}\n`); process.exit(1); };

/** Lê o .env da raiz sem dependência. Variável de ambiente real tem precedência. */
function carregaEnv() {
  const arq = path.join(RAIZ, '.env');
  if (!fs.existsSync(arq)) return;
  for (const linha of fs.readFileSync(arq, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linha);
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
    body: new URLSearchParams({ grant_type: 'client_credentials', scope: 'basic' }),
  });
  const corpo = await r.text();
  if (!r.ok) {
    // Conferido contra o servidor: credencial errada devolve 400 invalid_client.
    // Entao 400/invalid_client é chave, e 401/403 é quase sempre IP — vale saber
    // qual dos dois antes de sair regerando segredo no painel à toa.
    const dica = /invalid_client/.test(corpo)
      ? '  invalid_client = par chave/segredo nao confere. Copie os dois de novo do painel.'
      : '  Sem invalid_client, o suspeito e o IP: so os enderecos cadastrados na whitelist\n'
      + '  emitem token. Confira o IP de saida desta maquina (curl https://api.ipify.org) e,\n'
      + '  se a rede tiver IPv6, cadastre-o tambem — a requisicao pode sair por ele.';
    morre(`token: HTTP ${r.status} — ${corpo.slice(0, 300)}\n${dica}`);
  }
  const j = JSON.parse(corpo);
  if (!j.access_token) morre(`token: resposta sem access_token — ${corpo.slice(0, 300)}`);
  return j.access_token;
}

/**
 * Percorre as páginas da busca e devolve os `food` crus.
 *
 * O envelope da resposta já mudou de forma entre versões da API (`foods` na v2,
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

async function busca(token, expressao) {
  const fixture = process.env.FATSECRET_FIXTURE;
  if (fixture) {
    console.log(`  (fixture: ${fixture} — nenhuma chamada de rede)`);
    return achaFoods(JSON.parse(fs.readFileSync(fixture, 'utf8'))) ?? [];
  }

  const todos = [];
  for (let pagina = 0; pagina < 20; pagina++) {
    const url = new URL(API);
    url.search = new URLSearchParams({
      search_expression: expressao,
      max_results: '50',
      page_number: String(pagina),
      format: 'json',
      ...REGIAO,
    });
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const corpo = await r.text();
    if (!r.ok) morre(`busca (página ${pagina}): HTTP ${r.status} — ${corpo.slice(0, 300)}`);
    const j = JSON.parse(corpo);
    if (j.error) morre(`busca: ${j.error.message ?? JSON.stringify(j.error)}`);
    const foods = achaFoods(j) ?? [];
    todos.push(...foods);
    if (foods.length < 50) break;
  }
  return todos;
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

function itemDe(food, serving) {
  return {
    nome: String(food.food_name).trim(),
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

/** 4·carb + 4·prot + 9·gord contra as kcal declaradas — pega erro de mapeamento. */
function atwater(it) {
  if ([it.kcal, it.carb, it.prot, it.gord].some((v) => typeof v !== 'number')) return null;
  const calc = 4 * it.carb + 4 * it.prot + 9 * it.gord;
  if (it.kcal <= 40) return null;
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
const crus = await busca(token, cfg.busca);
console.log(`  ${crus.length} resultado(s) na busca por "${cfg.busca}"`);

const daMarca = crus.filter((f) => String(f.brand_name ?? '').trim() === cfg.marca);
console.log(`  ${daMarca.length} com brand_name === "${cfg.marca}"`);
if (!daMarca.length) {
  morre('nenhum item da marca voltou. Confira o brand_name na resposta antes de mexer\n'
      + '  no arquivo — sincronizar com zero item apagaria a rede do app.');
}

const itens = [];
const semServing = [];
for (const food of daMarca) {
  const s = escolheServing(food, porcaoPorNome.get(String(food.food_name).trim()));
  if (!s) { semServing.push(food.food_name); continue; }
  itens.push(itemDe(food, s));
}
itens.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

if (semServing.length) {
  console.log(`  ⚠ ${semServing.length} sem porção com calorias, ficaram de fora: ${semServing.join(', ')}`);
}

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

// Aviso de Atwater aqui também, para o desvio aparecer antes do commit e não só
// no validador — a diferença é que aqui dá para reconferir com a resposta na mão.
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
