/* Refeição Livre — cardápio das redes de fast food com a tabela oficial de cada uma.
   Sem build e sem dependências: os dados vêm de data/*.json em tempo de execução. */

(function () {
  'use strict';

  var CHAVE_TEMA = 'refeicaolivre_theme';
  var CHAVE_GASTO = 'refeicaolivre_gasto';
  var CHAVE_PRATO = 'refeicaolivre_prato';

  var estado = {
    redes: [],
    categorias: [],
    cardapios: {},      // slug da rede -> JSON já carregado
    redeAtual: null,
    catAtual: null,
    busca: '',
    ordem: 'nome',      // 'nome' | 'kcal'
    prato: [],          // { rede, redeNome, categoria, nome } — o item é reencontrado no cardápio
    expandido: null,
  };

  var $ = function (id) { return document.getElementById(id); };

  function guarda(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* modo privado, segue sem persistir */ }
  }
  function lembra(chave) {
    try { return localStorage.getItem(chave); } catch (e) { return null; }
  }

  // ---------- tema ----------

  function temaAtual() {
    return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  }

  function aplicaTema(tema) {
    var t = tema === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = t;
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t === 'light' ? '#fafafa' : '#09090b';
    var btn = $('btnTheme');
    btn.setAttribute('aria-pressed', t === 'light' ? 'true' : 'false');
    btn.title = t === 'light' ? 'Mudar para o tema escuro' : 'Mudar para o tema claro';
    btn.setAttribute('aria-label', btn.title);
  }

  // ---------- formatação ----------

  var fmt = function (n, casas) {
    if (n === null || n === undefined) return '—';
    return n.toLocaleString('pt-BR', { maximumFractionDigits: casas === undefined ? 1 : casas });
  };

  function dataBr(iso) {
    var p = String(iso).split('-');
    if (p.length === 3) return p[2] + '/' + p[1] + '/' + p[0];
    if (p.length === 2) return p[1] + '/' + p[0];
    return iso;
  }

  // Os nomes oficiais trazem símbolos que ninguém digita ("WHOPPER® Jr.",
  // "Big King™") e acentos. Normaliza os dois lados da busca para que
  // "whopper jr" ache "WHOPPER® Jr." e "acucar" ache "Açúcar".
  function normaliza(s) {
    return String(s)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[®™©]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  // A maioria das redes publica por porção; algumas publicam por 100 g. Misturar
  // as duas numa soma dá total errado, então a base viaja com o dado e a UI
  // mostra qual é. Ausente = por porção.
  function baseDaRede(slug) {
    var d = estado.cardapios[slug];
    return d && d.base === '100g' ? '100g' : 'porcao';
  }

  function rotuloBase(slug) {
    return baseDaRede(slug) === '100g' ? 'por 100 g' : 'por porção';
  }

  function nomeCategoria(slug) {
    for (var i = 0; i < estado.categorias.length; i++) {
      if (estado.categorias[i].slug === slug) return estado.categorias[i].nome;
    }
    return slug;
  }

  // ---------- carregamento ----------

  function buscaJson(caminho) {
    return fetch(caminho, { cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(caminho + ' respondeu ' + r.status);
      return r.json();
    });
  }

  function carregaCardapio(slug) {
    if (estado.cardapios[slug]) return Promise.resolve(estado.cardapios[slug]);
    return buscaJson('data/' + slug + '.json').then(function (d) {
      estado.cardapios[slug] = d;
      return d;
    });
  }

  // ---------- badge da rede ----------

  // A logo quando o dado traz uma, a inicial quando não. Os dois caminhos
  // existem de propósito: acrescentar uma rede continua sendo criar o JSON e
  // uma linha no index.json, com ou sem arte pronta.
  function pintaBadge(el, rede) {
    var inicial = rede.inicial || rede.nome.slice(0, 1);
    el.style.background = rede.cor;
    el.textContent = '';
    if (!rede.logo) { el.textContent = inicial; return; }

    var img = document.createElement('img');
    img.className = 'rede-logo';
    img.src = rede.logo;
    img.alt = '';
    // logo que não carrega (arquivo fora do git add, por exemplo) não pode
    // deixar o badge vazio — cai de volta na inicial
    img.addEventListener('error', function () {
      el.textContent = inicial;
    });
    el.appendChild(img);
  }

  // ---------- tela 1: redes ----------

  function pintaRedes() {
    var alvo = $('listaRedes');
    alvo.innerHTML = '';
    estado.redes.forEach(function (rede) {
      var a = document.createElement('a');
      a.className = 'entry';
      a.href = '#/' + rede.slug;

      var badge = document.createElement('span');
      badge.className = 'rede-badge';
      badge.setAttribute('aria-hidden', 'true');
      pintaBadge(badge, rede);

      var corpo = document.createElement('span');
      corpo.className = 'entry-body';
      var titulo = document.createElement('span');
      titulo.className = 'entry-title';
      titulo.textContent = rede.nome;
      var desc = document.createElement('span');
      desc.className = 'entry-desc';
      desc.textContent = rede.descricao || 'Cardápio com a tabela nutricional oficial.';
      corpo.appendChild(titulo);
      corpo.appendChild(desc);

      var seta = document.createElement('span');
      seta.className = 'entry-arrow';
      seta.setAttribute('aria-hidden', 'true');
      seta.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

      a.appendChild(badge);
      a.appendChild(corpo);
      a.appendChild(seta);
      alvo.appendChild(a);
    });
  }

  // ---------- tela 2: cardápio ----------

  function itensVisiveis(dados) {
    var termo = normaliza(estado.busca);
    var grupos = [];
    dados.categorias.forEach(function (cat) {
      if (estado.catAtual && cat.slug !== estado.catAtual) return;
      var itens = cat.itens.filter(function (it) {
        return !termo || normaliza(it.nome).indexOf(termo) !== -1;
      });
      if (!itens.length) return;
      itens = itens.slice();
      if (estado.ordem === 'kcal') itens.sort(function (a, b) { return (b.kcal || 0) - (a.kcal || 0); });
      else itens.sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
      grupos.push({ slug: cat.slug, itens: itens });
    });
    return grupos;
  }

  function chaveItem(redeSlug, catSlug, nome) {
    return redeSlug + '|' + catSlug + '|' + nome;
  }

  function noPrato(redeSlug, catSlug, nome) {
    var k = chaveItem(redeSlug, catSlug, nome);
    for (var i = 0; i < estado.prato.length; i++) {
      if (chaveItem(estado.prato[i].rede, estado.prato[i].categoria, estado.prato[i].nome) === k) return i;
    }
    return -1;
  }

  function criaItem(rede, catSlug, item) {
    var li = document.createElement('li');
    var id = chaveItem(rede.slug, catSlug, item.nome);

    var topo = document.createElement('button');
    topo.type = 'button';
    topo.className = 'item-topo';
    topo.setAttribute('aria-expanded', estado.expandido === id ? 'true' : 'false');

    var info = document.createElement('span');
    info.className = 'item-info';
    var nome = document.createElement('span');
    nome.className = 'item-nome';
    nome.textContent = item.nome;
    var porcao = document.createElement('span');
    porcao.className = 'item-porcao';
    porcao.textContent = item.porcao + (item.sazonal ? ' · sazonal' : '');
    info.appendChild(nome);
    info.appendChild(porcao);

    var kcal = document.createElement('span');
    kcal.className = 'item-kcal';
    var sufixo = document.createElement('small');
    sufixo.textContent = baseDaRede(rede.slug) === '100g' ? 'kcal/100 g' : 'kcal';
    kcal.appendChild(document.createTextNode(fmt(item.kcal, 0)));
    kcal.appendChild(sufixo);

    topo.appendChild(info);
    topo.appendChild(kcal);
    topo.addEventListener('click', function () {
      estado.expandido = estado.expandido === id ? null : id;
      pintaCardapio();
    });

    var add = document.createElement('button');
    add.type = 'button';
    add.className = 'btn-add';
    var dentro = noPrato(rede.slug, catSlug, item.nome) !== -1;
    add.dataset.noPrato = dentro ? '1' : '0';
    add.textContent = dentro ? '✓' : '+';
    add.setAttribute('aria-label', (dentro ? 'Remover ' : 'Adicionar ') + item.nome + (dentro ? ' da' : ' à') + ' refeição');
    add.addEventListener('click', function (ev) {
      ev.stopPropagation();
      alternaNoPrato(rede, catSlug, item);
    });

    var linha = document.createElement('div');
    linha.style.display = 'flex';
    linha.style.alignItems = 'center';
    linha.style.gap = '0.5rem';
    linha.style.paddingRight = '0.9rem';
    topo.style.flex = '1 1 auto';
    linha.appendChild(topo);
    linha.appendChild(add);
    li.appendChild(linha);

    if (estado.expandido === id) {
      var det = document.createElement('div');
      det.className = 'item-detalhe';
      var base = document.createElement('p');
      base.className = 'detalhe-base';
      // Numa rede por 100 g a porção também é "100 g": repetir os dois só polui.
      var rotulo = 'Valores ' + rotuloBase(rede.slug);
      if (normaliza(item.porcao) !== normaliza(rotuloBase(rede.slug).replace('por ', ''))) {
        rotulo += ' · ' + item.porcao;
      }
      base.textContent = rotulo;
      det.appendChild(base);
      var dl = document.createElement('dl');
      dl.className = 'macros';
      [
        ['Carbo.', item.carb, 'g'],
        ['Açúcares', item.acucar, 'g'],
        ['Proteína', item.prot, 'g'],
        ['Gordura', item.gord, 'g'],
        ['Saturada', item.gordSat, 'g'],
        ['Fibra', item.fibra, 'g'],
        ['Sódio', item.sodio, 'mg'],
      ].forEach(function (par) {
        var bloco = document.createElement('div');
        bloco.className = 'macro';
        var dt = document.createElement('dt');
        dt.textContent = par[0];
        var dd = document.createElement('dd');
        dd.textContent = par[1] === null || par[1] === undefined ? '—' : fmt(par[1]) + ' ' + par[2];
        bloco.appendChild(dt);
        bloco.appendChild(dd);
        dl.appendChild(bloco);
      });
      det.appendChild(dl);
      if (item.alerta) {
        var al = document.createElement('p');
        al.className = 'item-alerta';
        al.textContent = '⚠ ' + item.alerta;
        det.appendChild(al);
      }
      li.appendChild(det);
    }
    return li;
  }

  function pintaCardapio() {
    var rede = estado.redeAtual;
    if (!rede) return;
    var dados = estado.cardapios[rede.slug];
    if (!dados) return;

    $('redeNome').textContent = dados.nome;
    pintaBadge($('redeBadge'), rede);

    var total = dados.categorias.reduce(function (s, c) { return s + c.itens.length; }, 0);
    $('redeMeta').textContent = total + ' itens · verificado em ' + dataBr(dados.verificadoEm);

    // chips de categoria
    var chips = $('chips');
    chips.innerHTML = '';
    var todas = document.createElement('button');
    todas.type = 'button';
    todas.className = 'chip';
    todas.textContent = 'Tudo';
    todas.setAttribute('aria-pressed', estado.catAtual ? 'false' : 'true');
    todas.addEventListener('click', function () { vaiPara(rede.slug, null); });
    chips.appendChild(todas);

    dados.categorias.forEach(function (cat) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = nomeCategoria(cat.slug) + ' (' + cat.itens.length + ')';
      b.setAttribute('aria-pressed', estado.catAtual === cat.slug ? 'true' : 'false');
      b.addEventListener('click', function () { vaiPara(rede.slug, cat.slug); });
      chips.appendChild(b);
    });

    // lista
    var alvo = $('cardapio');
    alvo.innerHTML = '';
    var grupos = itensVisiveis(dados);
    $('cardapioVazio').hidden = grupos.length > 0;

    grupos.forEach(function (g) {
      var sec = document.createElement('section');
      sec.className = 'grupo';
      var h = document.createElement('h3');
      h.className = 'grupo-titulo';
      h.textContent = nomeCategoria(g.slug);
      var ul = document.createElement('ul');
      ul.className = 'lista';
      g.itens.forEach(function (it) { ul.appendChild(criaItem(rede, g.slug, it)); });
      sec.appendChild(h);
      sec.appendChild(ul);
      alvo.appendChild(sec);
    });

    // fonte
    var f = $('fonte');
    f.innerHTML = '';
    var p = document.createElement('p');
    p.style.margin = '0 0 0.5rem';
    p.appendChild(document.createTextNode('Fonte: '));
    var a = document.createElement('a');
    a.href = dados.fonte.url;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = dados.fonte.tipo + ' do ' + dados.nome;
    p.appendChild(a);
    p.appendChild(document.createTextNode(' · atualizada pela rede em ' + dataBr(dados.fonte.atualizadoEm) + '.'));
    f.appendChild(p);
    if (dados.observacoes) {
      var obs = document.createElement('p');
      obs.style.margin = '0';
      obs.textContent = dados.observacoes;
      f.appendChild(obs);
    }
  }

  // ---------- refeição montada ----------

  function achaItem(entrada) {
    var dados = estado.cardapios[entrada.rede];
    if (!dados) return null;
    for (var i = 0; i < dados.categorias.length; i++) {
      var cat = dados.categorias[i];
      if (cat.slug !== entrada.categoria) continue;
      for (var j = 0; j < cat.itens.length; j++) {
        if (cat.itens[j].nome === entrada.nome) return cat.itens[j];
      }
    }
    return null;
  }

  function alternaNoPrato(rede, catSlug, item) {
    var i = noPrato(rede.slug, catSlug, item.nome);
    if (i === -1) {
      var entrada = { rede: rede.slug, redeNome: rede.nome, categoria: catSlug, nome: item.nome };
      // Item cujos valores são por 100 g precisa de uma quantidade para somar.
      // Começa em 100 g (o próprio rótulo) e o painel deixa ajustar.
      if (baseDaRede(rede.slug) === '100g') entrada.gramas = 100;
      estado.prato.push(entrada);
    } else estado.prato.splice(i, 1);
    guarda(CHAVE_PRATO, JSON.stringify(estado.prato));
    pintaCardapio();
    pintaPrato();
  }

  function somaPrato() {
    var campos = ['kcal', 'carb', 'prot', 'gord', 'gordSat', 'fibra', 'sodio'];
    var soma = {};
    var parcial = {};
    campos.forEach(function (c) { soma[c] = 0; parcial[c] = false; });

    estado.prato.forEach(function (entrada) {
      var item = achaItem(entrada);
      if (!item) return;
      // valores por 100 g escalam pela quantidade; por porção entram inteiros
      var fator = baseDaRede(entrada.rede) === '100g' ? (Number(entrada.gramas) || 0) / 100 : 1;
      campos.forEach(function (c) {
        if (typeof item[c] === 'number') soma[c] += item[c] * fator;
        else parcial[c] = true;
      });
    });
    return { soma: soma, parcial: parcial };
  }

  function pintaPrato() {
    var barra = $('pratoBarra');
    barra.hidden = estado.prato.length === 0;
    if (estado.prato.length === 0 && !$('pratoPainel').hidden) fechaPainel();

    var r = somaPrato();
    $('pratoContagem').textContent = estado.prato.length + (estado.prato.length === 1 ? ' item' : ' itens');
    $('pratoKcal').textContent = fmt(r.soma.kcal, 0) + ' kcal';

    var lista = $('pratoLista');
    lista.innerHTML = '';
    estado.prato.forEach(function (entrada, idx) {
      var item = achaItem(entrada);
      var li = document.createElement('li');

      var nome = document.createElement('span');
      nome.className = 'pl-nome';
      nome.textContent = entrada.nome;
      var rede = document.createElement('span');
      rede.className = 'pl-rede';
      rede.textContent = entrada.redeNome;
      nome.appendChild(rede);

      var kcal = document.createElement('span');
      kcal.className = 'pl-kcal';
      var porGrama = baseDaRede(entrada.rede) === '100g';
      var fator = porGrama ? (Number(entrada.gramas) || 0) / 100 : 1;
      kcal.textContent = item ? fmt(item.kcal * fator, 0) + ' kcal' : '—';

      // Quantidade só existe onde a rede publica por 100 g: sem ela não há
      // como somar, e inventar um valor seria pior que perguntar.
      if (porGrama) {
        var qtd = document.createElement('span');
        qtd.className = 'pl-qtd';
        var inp = document.createElement('input');
        inp.type = 'number';
        inp.min = '1';
        inp.max = '2000';
        inp.step = '10';
        inp.value = entrada.gramas;
        inp.setAttribute('aria-label', 'Quantidade de ' + entrada.nome + ' em gramas');
        // Só os totais e o kcal desta linha são repintados: redesenhar a lista
        // inteira a cada tecla tiraria o foco do campo no meio da digitação.
        inp.addEventListener('input', function (e) {
          entrada.gramas = Math.max(0, Number(e.target.value) || 0);
          guarda(CHAVE_PRATO, JSON.stringify(estado.prato));
          var it = achaItem(entrada);
          if (it) kcal.textContent = fmt(it.kcal * (entrada.gramas / 100), 0) + ' kcal';
          pintaTotais();
        });
        qtd.appendChild(inp);
        var g = document.createElement('span');
        g.textContent = 'g';
        qtd.appendChild(g);
        nome.appendChild(qtd);
      }

      var rem = document.createElement('button');
      rem.type = 'button';
      rem.className = 'btn-remover';
      rem.textContent = '×';
      rem.setAttribute('aria-label', 'Remover ' + entrada.nome);
      rem.addEventListener('click', function () {
        estado.prato.splice(idx, 1);
        guarda(CHAVE_PRATO, JSON.stringify(estado.prato));
        pintaCardapio();
        pintaPrato();
      });

      li.appendChild(nome);
      li.appendChild(kcal);
      li.appendChild(rem);
      lista.appendChild(li);
    });

    pintaTotais();
  }

  // Separado de pintaPrato de propósito: o campo de gramas repinta só isto a
  // cada tecla, e redesenhar a lista tiraria o foco do input no meio da digitação.
  function pintaTotais() {
    var r = somaPrato();
    $('pratoContagem').textContent = estado.prato.length + (estado.prato.length === 1 ? ' item' : ' itens');
    $('pratoKcal').textContent = fmt(r.soma.kcal, 0) + ' kcal';

    var totais = $('pratoTotais');
    totais.innerHTML = '';
    [
      ['Calorias', r.soma.kcal, 'kcal', 0],
      ['Carbo.', r.soma.carb, 'g', 1],
      ['Proteína', r.soma.prot, 'g', 1],
      ['Gordura', r.soma.gord, 'g', 1],
      ['Sódio', r.soma.sodio, 'mg', 0],
    ].forEach(function (par) {
      var bloco = document.createElement('div');
      bloco.className = 'macro';
      var dt = document.createElement('div');
      dt.style.cssText = 'color:var(--text-dim);font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em';
      dt.textContent = par[0];
      var dd = document.createElement('div');
      dd.style.cssText = 'font-family:var(--font-display);font-weight:700';
      dd.textContent = fmt(par[1], par[3]) + ' ' + par[2];
      bloco.appendChild(dt);
      bloco.appendChild(dd);
      totais.appendChild(bloco);
    });

    var faltando = Object.keys(r.parcial).filter(function (c) { return r.parcial[c]; });
    if (faltando.length) {
      var nota = document.createElement('p');
      nota.className = 'prato-parcial';
      nota.textContent = 'Total parcial: algum item somado não tem todos os valores publicados pela rede.';
      totais.appendChild(nota);
    }

    pintaGasto(r.soma.kcal);
  }

  function pintaGasto(kcal) {
    var gasto = parseFloat($('gastoDiario').value);
    var alvo = $('gastoResultado');
    if (!gasto || gasto <= 0 || !kcal) { alvo.textContent = ''; return; }
    var pct = Math.round((kcal / gasto) * 100);
    alvo.innerHTML = '';
    alvo.appendChild(document.createTextNode('Esta refeição é '));
    var forte = document.createElement('strong');
    forte.textContent = pct + '%';
    alvo.appendChild(forte);
    alvo.appendChild(document.createTextNode(' do seu gasto diário de ' + fmt(gasto, 0) + ' kcal.'));
  }

  function abrePainel() {
    $('pratoPainel').hidden = false;
    $('pratoScrim').hidden = false;
    $('btnPrato').setAttribute('aria-expanded', 'true');
    $('btnFecharPrato').focus();
  }

  function fechaPainel() {
    $('pratoPainel').hidden = true;
    $('pratoScrim').hidden = true;
    $('btnPrato').setAttribute('aria-expanded', 'false');
  }

  // ---------- rotas ----------

  function vaiPara(redeSlug, catSlug) {
    location.hash = redeSlug ? '#/' + redeSlug + (catSlug ? '/' + catSlug : '') : '#/';
  }

  function aplicaRota() {
    var partes = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
    var redeSlug = partes[0] || null;
    var catSlug = partes[1] || null;

    if (!redeSlug) {
      estado.redeAtual = null;
      $('telaRedes').hidden = false;
      $('telaCardapio').hidden = true;
      return;
    }

    var rede = estado.redes.filter(function (r) { return r.slug === redeSlug; })[0];
    if (!rede) { vaiPara(null); return; }

    // Trocar de rede zera a busca: o termo da rede anterior filtraria o cardápio
    // novo e ele abriria vazio, sem que nada na tela explicasse por quê.
    if (!estado.redeAtual || estado.redeAtual.slug !== rede.slug) {
      estado.busca = '';
      $('busca').value = '';
    }
    estado.redeAtual = rede;
    estado.catAtual = catSlug;
    estado.expandido = null;
    $('telaRedes').hidden = true;
    $('telaCardapio').hidden = false;

    carregaCardapio(rede.slug).then(function () {
      pintaCardapio();
      pintaPrato();
      window.scrollTo(0, 0);
    }).catch(function (e) {
      $('cardapio').innerHTML = '';
      var p = $('cardapioVazio');
      p.hidden = false;
      p.textContent = 'Não foi possível carregar o cardápio (' + e.message + ').';
    });
  }

  // ---------- ligação ----------

  function ligaEventos() {
    $('btnTheme').addEventListener('click', function () {
      var proximo = temaAtual() === 'light' ? 'dark' : 'light';
      aplicaTema(proximo);
      guarda(CHAVE_TEMA, proximo);
    });

    $('btnVoltar').addEventListener('click', function () { vaiPara(null); });

    $('busca').addEventListener('input', function (e) {
      estado.busca = e.target.value;
      estado.expandido = null;
      pintaCardapio();
    });

    $('btnOrdem').addEventListener('click', function () {
      estado.ordem = estado.ordem === 'nome' ? 'kcal' : 'nome';
      $('btnOrdem').textContent = estado.ordem === 'nome' ? 'A–Z' : 'kcal';
      $('btnOrdem').setAttribute('aria-label', estado.ordem === 'nome' ? 'Ordenado por nome; alternar para calorias' : 'Ordenado por calorias; alternar para nome');
      pintaCardapio();
    });

    $('btnPrato').addEventListener('click', function () {
      if ($('pratoPainel').hidden) abrePainel(); else fechaPainel();
    });
    $('btnFecharPrato').addEventListener('click', fechaPainel);
    $('pratoScrim').addEventListener('click', fechaPainel);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !$('pratoPainel').hidden) fechaPainel();
    });

    $('btnLimpar').addEventListener('click', function () {
      estado.prato = [];
      guarda(CHAVE_PRATO, '[]');
      pintaCardapio();
      pintaPrato();
    });

    $('gastoDiario').addEventListener('input', function (e) {
      guarda(CHAVE_GASTO, e.target.value);
      pintaGasto(somaPrato().soma.kcal);
    });

    window.addEventListener('hashchange', aplicaRota);
  }

  // ---------- início ----------

  function inicia() {
    aplicaTema(temaAtual());
    ligaEventos();

    var gasto = lembra(CHAVE_GASTO);
    if (gasto) $('gastoDiario').value = gasto;

    try {
      var salvo = JSON.parse(lembra(CHAVE_PRATO) || '[]');
      if (Array.isArray(salvo)) estado.prato = salvo;
    } catch (e) { estado.prato = []; }

    // fetch de arquivo local não funciona em file:// — avisa em vez de falhar calado
    if (location.protocol === 'file:') {
      $('avisoFile').hidden = false;
      $('telaRedes').hidden = true;
      return;
    }

    Promise.all([buscaJson('data/index.json'), buscaJson('data/categorias.json')])
      .then(function (res) {
        estado.redes = res[0].redes || [];
        estado.categorias = res[1] || [];
        pintaRedes();

        // os cardápios das redes com item no prato precisam estar carregados
        // para a soma aparecer certa já na abertura
        var pendentes = {};
        estado.prato.forEach(function (e) { pendentes[e.rede] = true; });
        return Promise.all(Object.keys(pendentes).map(carregaCardapio));
      })
      .then(function () {
        aplicaRota();
        pintaPrato();
      })
      .catch(function (e) {
        var p = $('redesVazio');
        p.hidden = false;
        p.textContent = 'Não foi possível carregar os cardápios (' + e.message + ').';
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inicia);
  else inicia();

  window.refeicaoLivre = { estado: estado, aplicaTema: aplicaTema, somaPrato: somaPrato };
})();
