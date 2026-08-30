#!/usr/bin/env node
/**
 * conferir-fontes.mjs — a fonte de alguma rede mudou desde a última extração?
 *
 *   node scripts/conferir-fontes.mjs
 *
 * Rebaixa o documento de cada rede e compara o sha256 com o de `fontes/manifesto.json`.
 * É a primeira coisa a rodar antes de reconferir um cardápio: responde em segundos
 * o que uma reextração levaria muito mais tempo para dizer, e diz qual rede olhar.
 *
 * Sai com código 1 se algum documento mudou — mudança é trabalho a fazer, não erro.
 * Rede sem versionamento (site que muda sempre) não dá para conferir por hash e
 * aparece como "não conferível"; para essas, a única saída é reextrair e comparar
 * o JSON.
 *
 * Sem dependências — usa o fetch do Node ≥ 22.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifesto = JSON.parse(fs.readFileSync(path.join(RAIZ, 'fontes', 'manifesto.json'), 'utf8'));

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36';
const mudou = [];
const naoConferiveis = [];
const falhas = [];

for (const f of manifesto.fontes) {
  const rotulo = f.rede.padEnd(14);
  if (!f.conferivelPorHash) {
    naoConferiveis.push(f);
    console.log(`  ${rotulo} — sem versionamento, não dá para conferir por hash`);
    continue;
  }
  try {
    const r = await fetch(f.url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    if (!r.ok) { falhas.push(`${f.rede}: HTTP ${r.status}`); console.log(`  ${rotulo} ✗ HTTP ${r.status}`); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha === f.sha256) {
      console.log(`  ${rotulo} igual (${buf.length} bytes)`);
    } else {
      mudou.push(f);
      console.log(`  ${rotulo} MUDOU — ${f.bytes} → ${buf.length} bytes`);
      console.log(`  ${' '.repeat(14)}   sha no manifesto: ${f.sha256.slice(0, 16)}…`);
      console.log(`  ${' '.repeat(14)}   sha agora:        ${sha.slice(0, 16)}…`);
    }
  } catch (e) {
    falhas.push(`${f.rede}: ${e.message}`);
    console.log(`  ${rotulo} ✗ ${e.message}`);
  }
}

console.log('');
if (falhas.length) {
  console.log(`${falhas.length} fonte(s) não puderam ser buscadas:`);
  falhas.forEach((x) => console.log(`  ✗ ${x}`));
  console.log('  (McDonald\'s e Subway às vezes barram fetch simples — ver ATUALIZAR-CARDAPIO.md)');
  console.log('');
}
if (naoConferiveis.length) {
  console.log(`${naoConferiveis.length} rede(s) sem versionamento — reextraia e compare o JSON:`);
  naoConferiveis.forEach((x) => console.log(`  · ${x.rede} (${x.formato})`));
  console.log('');
}
if (mudou.length) {
  console.log(`${mudou.length} fonte(s) MUDARAM desde a última extração:`);
  mudou.forEach((x) => console.log(`  → ${x.rede}: ${x.url}`));
  console.log('');
  console.log('Reextraia essas, atualize o sha256 no manifesto e o "obtidoEm".');
  console.log('Antes de sobrescrever o JSON, releia a seção "reextração apaga decisão');
  console.log('tomada à mão" da skill atualizar-cardapio.');
  process.exit(1);
}
console.log('Nenhuma fonte conferível mudou.');
