#!/usr/bin/env node
/**
 * validar-dados.mjs — confere os JSON de `data/` antes do commit.
 *
 *   node scripts/validar-dados.mjs
 *
 * Sai com código 1 se houver erro. Avisos não derrubam a execução, mas cada um
 * merece uma olhada: o principal deles compara as calorias declaradas com a
 * conta dos macros, que é como um dedo gordo na transcrição costuma aparecer.
 *
 * Sem dependências — este repo não tem node_modules.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(RAIZ, 'data');

const erros = [];
const avisos = [];
const erro = (m) => erros.push(m);
const aviso = (m) => avisos.push(m);

const leJson = (arquivo) => {
  const caminho = path.join(DATA, arquivo);
  if (!fs.existsSync(caminho)) { erro(`${arquivo}: arquivo não encontrado`); return null; }
  try { return JSON.parse(fs.readFileSync(caminho, 'utf8')); }
  catch (e) { erro(`${arquivo}: JSON inválido — ${e.message}`); return null; }
};

// Faixas plausíveis por porção. Servem para pegar erro de digitação e de unidade
// (grama trocada por miligrama), não para julgar o prato.
const FAIXAS = {
  kcal:    [0, 3000],
  carb:    [0, 500],
  acucar:  [0, 500],
  prot:    [0, 500],
  gord:    [0, 500],
  gordSat: [0, 500],
  fibra:   [0, 200],
  sodio:   [0, 6000],
};
const NUMERICOS = Object.keys(FAIXAS);

const indice = leJson('index.json');
const categorias = leJson('categorias.json');

if (indice && !Array.isArray(indice.redes)) erro('index.json: falta o array "redes"');
if (categorias && !Array.isArray(categorias)) erro('categorias.json: deve ser um array');

const slugsValidos = new Set((categorias ?? []).map((c) => c.slug));
const nomeCategoria = new Map((categorias ?? []).map((c) => [c.slug, c.nome]));
for (const c of categorias ?? []) {
  if (!c.slug || !c.nome) erro(`categorias.json: entrada sem slug ou nome — ${JSON.stringify(c)}`);
}

let totalItens = 0;
const arquivosDeRede = new Set();

for (const rede of indice?.redes ?? []) {
  if (!rede.slug || !rede.nome) { erro(`index.json: rede sem slug ou nome — ${JSON.stringify(rede)}`); continue; }
  if (!/^#[0-9a-f]{6}$/i.test(rede.cor ?? '')) erro(`index.json: ${rede.slug} precisa de "cor" em hex de 6 dígitos`);
  arquivosDeRede.add(`${rede.slug}.json`);

  const dados = leJson(`${rede.slug}.json`);
  if (!dados) continue;

  if (dados.slug !== rede.slug) erro(`${rede.slug}.json: "slug" interno (${dados.slug}) não bate com o do index.json`);
  if (!dados.fonte?.url || !/^https:\/\//.test(dados.fonte.url)) erro(`${rede.slug}.json: "fonte.url" ausente ou não é https`);
  if (!dados.fonte?.atualizadoEm) erro(`${rede.slug}.json: falta "fonte.atualizadoEm"`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dados.verificadoEm ?? '')) erro(`${rede.slug}.json: "verificadoEm" precisa estar em AAAA-MM-DD`);
  else if (Number.isNaN(Date.parse(dados.verificadoEm))) erro(`${rede.slug}.json: "verificadoEm" não é uma data real`);

  if (!Array.isArray(dados.categorias) || !dados.categorias.length) {
    erro(`${rede.slug}.json: "categorias" vazio`);
    continue;
  }

  for (const cat of dados.categorias) {
    // A unicidade é por categoria, não por rede: o mesmo prato pode aparecer
    // como entrada e como acompanhamento, com porção e valores diferentes.
    const vistos = new Set();
    if (!slugsValidos.has(cat.slug)) {
      erro(`${rede.slug}.json: categoria "${cat.slug}" não existe em categorias.json`);
      continue;
    }
    if (!Array.isArray(cat.itens) || !cat.itens.length) {
      erro(`${rede.slug}.json / ${cat.slug}: sem itens`);
      continue;
    }
    for (const item of cat.itens) {
      totalItens++;
      const onde = `${rede.slug}.json / ${cat.slug} / ${item.nome ?? '(sem nome)'}`;

      if (!item.nome?.trim()) erro(`${onde}: item sem "nome"`);
      if (!item.porcao?.trim()) erro(`${onde}: item sem "porcao"`);
      if (typeof item.kcal !== 'number') erro(`${onde}: "kcal" é obrigatório e precisa ser número`);

      const chave = item.nome?.toLowerCase().trim();
      if (chave && vistos.has(chave)) erro(`${onde}: nome repetido dentro da mesma categoria`);
      if (chave) vistos.add(chave);

      for (const campo of NUMERICOS) {
        const v = item[campo];
        if (v === undefined) { erro(`${onde}: falta o campo "${campo}" (use null quando a fonte não publica)`); continue; }
        if (v === null) continue;
        if (typeof v !== 'number' || Number.isNaN(v)) { erro(`${onde}: "${campo}" precisa ser número ou null`); continue; }
        const [min, max] = FAIXAS[campo];
        if (v < min || v > max) erro(`${onde}: "${campo}" = ${v} está fora da faixa ${min}–${max}`);
      }

      if (item.gord != null && item.gordSat != null && item.gordSat > item.gord + 0.5) {
        erro(`${onde}: gordura saturada (${item.gordSat} g) maior que a gordura total (${item.gord} g)`);
      }
      // Fontes que arredondam os dois campos para inteiro produzem diferenças de
      // até 1 g sem que haja erro de transcrição — daí o degrau entre aviso e erro.
      if (item.carb != null && item.acucar != null && item.acucar > item.carb + 0.5) {
        const excesso = item.acucar - item.carb;
        const msg = `${onde}: açúcares (${item.acucar} g) maiores que os carboidratos (${item.carb} g)`;
        if (excesso <= 1) aviso(`${msg} — dentro do arredondamento da fonte`);
        else erro(msg);
      }

      // Os macros são massa: somados, não cabem numa porção menor que eles.
      // Pega peso de porção errado, que a conta de Atwater não vê — ela só olha a
      // relação entre calorias e macros, que continua fechando com o peso errado.
      const gramas = /^([\d.,]+)\s*g$/.exec((item.porcao ?? '').trim());
      if (gramas) {
        const peso = Number(gramas[1].replace(',', '.'));
        const massa = ['carb', 'prot', 'gord'].reduce((s, c) => s + (item[c] ?? 0), 0);
        if (peso > 0 && massa > peso * 1.05) {
          erro(`${onde}: os macros somam ${massa.toFixed(1)} g e a porção declarada é ${peso} g`);
        }
      }

      // Conferência de Atwater: 4 kcal/g de carboidrato e proteína, 9 kcal/g de gordura.
      // É aviso, não erro — fibra, poliois e arredondamento da fonte afastam o resultado.
      if ([item.kcal, item.carb, item.prot, item.gord].every((v) => typeof v === 'number')) {
        const calculado = 4 * item.carb + 4 * item.prot + 9 * item.gord;
        if (item.kcal > 40 && Math.abs(calculado - item.kcal) > item.kcal * 0.2) {
          aviso(`${onde}: ${item.kcal} kcal declaradas, ${Math.round(calculado)} kcal pelos macros (${Math.round(((calculado - item.kcal) / item.kcal) * 100)}%)`);
        }
      }
    }
  }

  const usadas = dados.categorias.map((c) => nomeCategoria.get(c.slug) ?? c.slug).join(', ');
  console.log(`  ${rede.nome.padEnd(14)} ${String(dados.categorias.reduce((s, c) => s + c.itens.length, 0)).padStart(4)} itens  ·  ${usadas}`);
}

// arquivos de rede órfãos em data/
for (const f of fs.readdirSync(DATA)) {
  if (!f.endsWith('.json') || f === 'index.json' || f === 'categorias.json') continue;
  if (!arquivosDeRede.has(f)) erro(`data/${f}: não está listado em index.json`);
}

console.log(`\n${totalItens} itens no total.`);
if (avisos.length) {
  console.log(`\n${avisos.length} aviso(s) — confira cada um contra a fonte:`);
  avisos.forEach((a) => console.log(`  ⚠ ${a}`));
}
if (erros.length) {
  console.log(`\n${erros.length} erro(s):`);
  erros.forEach((e) => console.log(`  ✗ ${e}`));
  process.exit(1);
}
console.log('\nTudo certo.');
