/* =====================================================================
 * lancar.js — LANÇAMENTOS NO QUARTO (frigobar, consumos, diárias extras)
 * ---------------------------------------------------------------------
 * Localiza a estadia pelo número do quarto ou pelo hóspede (CPF, nome ou
 * celular), monta um carrinho com os produtos do cadastro (frigobar,
 * restaurante, bar…) ou com lançamentos avulsos (diária extra, pessoa
 * adicional, taxas, desconto) e grava tudo na conta do quarto.
 * Também exporta a busca de hóspede usada no check-in e na reserva.
 * ===================================================================== */

const LANCAR = (function () {
  const { $, $$, esc, brl, icone, opcoes, dataCurta } = APP;
  const st = { reserva: null, grupo: 'Frigobar', carrinho: [], data: null, busca: '' };

  /* ===================================================================
   * Busca de hóspede por CPF, nome ou celular
   * =================================================================== */
  function normalizar(t) {
    return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  /** Hóspedes que casam com o termo (nome, CPF/documento ou telefone). */
  function buscarHospedes(d, termo, limite) {
    const t = normalizar(termo);
    const dig = APP.soDigitos(termo);
    if (t.length < 2 && dig.length < 3) return [];
    const l = d.hospedes.filter(h => {
      if (normalizar(h.nome).indexOf(t) !== -1) return true;
      if (dig.length >= 3) {
        if (APP.soDigitos(h.cpf).indexOf(dig) !== -1) return true;
        if (APP.soDigitos(h.documento).indexOf(dig) !== -1) return true;
        if (APP.soDigitos(h.telefone).indexOf(dig) !== -1) return true;
      }
      return false;
    });
    l.sort((a, b) => String(a.nome).localeCompare(String(b.nome), 'pt-BR'));
    return l.slice(0, limite || 8);
  }

  /** Estadia ativa (hospedado) do hóspede, se houver. */
  function estadiaDoHospede(d, h) {
    return d.reservas.find(r => r.status === 'hospedado' && (r.hospede_id === h.id ||
      (!r.hospede_id && normalizar(r.hospede_nome) === normalizar(h.nome))));
  }

  /**
   * Liga uma lista suspensa de sugestões a um campo de texto.
   * Ao escolher, chama aoEscolher(hospede).
   */
  function ligarBuscaHospede(d, input, aoEscolher) {
    const pai = input.parentElement;
    pai.style.position = 'relative';
    const box = document.createElement('div');
    box.className = 'resultados'; box.hidden = true; box.style.top = 'calc(100% + 4px)';
    pai.appendChild(box);
    const desenhar = () => {
      const l = buscarHospedes(d, input.value, 6);
      if (!l.length || document.activeElement !== input) { box.hidden = true; return; }
      box.innerHTML = l.map(h => '<button type="button" data-h="' + esc(h.id) + '"><span><b>' + esc(h.nome) + '</b><br><small>' +
        esc([h.cpf ? 'CPF ' + h.cpf : (h.documento || ''), h.telefone || '', h.cidade || ''].filter(Boolean).join(' · ') || 'Sem documento') + '</small></span></button>').join('');
      box.hidden = false;
      $$('[data-h]', box).forEach(b => b.onmousedown = (e) => {
        e.preventDefault();
        const h = d.hospedes.find(x => x.id === b.dataset.h);
        box.hidden = true;
        aoEscolher(h);
      });
    };
    input.setAttribute('autocomplete', 'off');
    input.removeAttribute('list');
    input.addEventListener('input', desenhar);
    input.addEventListener('focus', desenhar);
    input.addEventListener('blur', () => setTimeout(() => { box.hidden = true; }, 150));
  }

  /* ===================================================================
   * Tela
   * =================================================================== */
  function quartoTxt(d, id) { const q = d.quartoPorId[id]; return q ? q.numero : '—'; }

  async function montar(params) {
    params = params || {};
    const d = await APP.dados();
    if (params.reserva) { st.reserva = params.reserva; st.carrinho = []; }
    if (!st.data) st.data = DB.hoje();
    const r = st.reserva ? d.reservas.find(x => x.id === st.reserva && x.status === 'hospedado') : null;
    if (!r) st.reserva = null;
    const el = $('#tela-lancar');
    const casa = d.reservas.filter(x => x.status === 'hospedado')
      .sort((a, b) => String(quartoTxt(d, a.quarto_id)).localeCompare(String(quartoTxt(d, b.quarto_id)), 'pt-BR', { numeric: true }));

    el.innerHTML =
      '<header class="cab-pagina"><div><h1>Lançar no quarto</h1><p>Frigobar, consumos, diárias extras e taxas direto na conta do hóspede</p></div>' +
      '<div class="acoes" style="flex:1 1 360px;justify-content:flex-end"><div class="busca-global" style="max-width:520px"><label class="busca">' + icone('busca', 18, 1.8) +
      '<span class="sr">Buscar</span><input type="search" id="lc-busca" placeholder="Quarto, CPF, nome ou celular do hóspede" autocomplete="off" value="' + esc(st.busca) + '"></label>' +
      '<div class="resultados" id="lc-resultados" hidden></div></div></div></header>' +
      (r ? '' : '<section class="card pilha" style="gap:12px"><div class="linha-topo"><h2>Quartos ocupados (' + casa.length + ')</h2><span class="apoio" style="font-size:13px">Toque no quarto para lançar</span></div>' +
        (casa.length ? '<div class="grade-quartos">' + casa.map(x => {
          const c = DB.conta(d, x);
          return '<button type="button" class="cartao-quarto" data-r="' + esc(x.id) + '"><span class="topo"><span class="numero">' + esc(quartoTxt(d, x.quarto_id)) + '</span>' +
            '<span class="badge b-ocp">OCP</span></span><span class="l1">' + esc(x.hospede_nome) + '</span>' +
            '<span class="l2">' + (x.contratante_nome && x.contratante_id !== 'direto' ? esc(x.contratante_nome) + ' · ' : '') + 'saída ' + dataCurta(x.saida) + '</span>' +
            '<span class="l2" style="font-weight:700;color:#231F20">Saldo ' + brl(c.saldo) + '</span></button>';
        }).join('') + '</div>' : '<p class="vazio">Nenhum hóspede na casa. Os lançamentos são feitos em estadias com check-in.</p>') + '</section>') +
      (r ? '<div class="duas-colunas" id="lc-painel"></div>' : '');

    ligarBusca(d);
    $$('[data-r]', el).forEach(b => b.onclick = () => { st.reserva = b.dataset.r; st.carrinho = []; montar(); });
    if (r) desenharPainel(d, r);
  }

  function ligarBusca(d) {
    const inp = $('#lc-busca'), res = $('#lc-resultados');
    const desenhar = () => {
      st.busca = inp.value;
      const t = inp.value.trim();
      if (!t) { res.hidden = true; return; }
      const itens = [];
      // Quarto pelo número
      d.quartos.filter(q => q.ativo !== false && String(q.numero).toLowerCase() === t.toLowerCase().replace(/^q(uarto)?\s*/, '')).forEach(q => {
        const at = DB.estadiaAtiva(d, q.id);
        itens.push({ r: at, rot: 'Quarto ' + q.numero, sub: at ? at.hospede_nome : 'Sem hóspede (livre)' });
      });
      buscarHospedes(d, t, 8).forEach(h => {
        const at = estadiaDoHospede(d, h);
        itens.push({ r: at, h: h, rot: h.nome, sub: (at ? 'Quarto ' + quartoTxt(d, at.quarto_id) + ' · hospedado' : 'Sem hospedagem ativa') +
          (h.cpf ? ' · CPF ' + h.cpf : '') + (h.telefone ? ' · ' + h.telefone : '') });
      });
      if (!itens.length) { res.innerHTML = '<p class="vazio" style="padding:10px;margin:0">Nada encontrado.</p>'; res.hidden = false; return; }
      res.innerHTML = itens.map((x, i) => '<button type="button" data-i="' + i + '"' + (x.r ? '' : ' style="opacity:.7"') + '><span><b>' + esc(x.rot) + '</b><br><small>' + esc(x.sub) + '</small></span>' +
        (x.r ? '<span class="badge b-ocp">Lançar</span>' : (x.h && AUTH.podeEditar('movimento') ? '<span class="badge b-res">Check-in</span>' : '')) + '</button>').join('');
      res.hidden = false;
      $$('[data-i]', res).forEach(b => b.onmousedown = (e) => {
        e.preventDefault();
        const x = itens[Number(b.dataset.i)];
        res.hidden = true;
        if (x.r) { st.reserva = x.r.id; st.carrinho = []; st.busca = ''; montar(); return; }
        if (x.h && AUTH.podeEditar('movimento')) { APP.ir('tela-movimento', { walkin: true, hospede: x.h.id }); return; }
        APP.aviso('Este hóspede não está hospedado. Faça o check-in antes de lançar.', 'alerta');
      });
    };
    inp.addEventListener('input', desenhar);
    inp.addEventListener('focus', desenhar);
    inp.addEventListener('blur', () => setTimeout(() => { res.hidden = true; }, 150));
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('[data-i]', res); if (b) b.dispatchEvent(new MouseEvent('mousedown')); } });
  }

  /* ---------------- Painel da estadia ---------------- */
  function desenharPainel(d, r) {
    const box = $('#lc-painel');
    const edita = AUTH.podeEditar('movimento');
    const q = d.quartoPorId[r.quarto_id];
    const cat = q && d.catPorId[q.categoria_id];
    const c = DB.conta(d, r);
    const grupos = CONFIG.gruposProduto.filter(g => d.produtos.some(p => p.grupo === g && p.ativo !== false));
    if (st.grupo !== 'Avulso' && grupos.indexOf(st.grupo) === -1) st.grupo = grupos[0] || 'Avulso';
    const produtos = d.produtos.filter(p => p.grupo === st.grupo && p.ativo !== false);

    let catalogo;
    if (st.grupo === 'Avulso') {
      catalogo = '<div class="grade-campos">' +
        '<label class="fld">Lançamento<select id="lc-av-tipo">' + opcoes(CONFIG.lancamentosAvulsos, 'Diária extra') + '</select></label>' +
        '<label class="fld">Quantidade<input type="number" id="lc-av-qtd" min="1" value="1"></label>' +
        '<label class="fld">Valor unitário (R$)<input id="lc-av-valor" data-dinheiro inputmode="decimal" value="' + APP.numBR(r.diaria, 2) + '"></label>' +
        '<label class="fld">Descrição (opcional)<input id="lc-av-desc" maxlength="80" placeholder="Ex.: 1 pessoa a mais"></label></div>' +
        '<p class="apoio" style="margin:0;font-size:13px">As diárias do período já entram na conta automaticamente (' + c.noites + ' × ' + brl(r.diaria) + '). Use "Diária extra" para cobranças fora do período (ex.: meia diária, saída tardia). "Desconto" entra com valor negativo.</p>' +
        '<button type="button" class="btn btn-escuro" id="lc-av-add">' + icone('mais2', 18, 2) + 'Adicionar ao lançamento</button>';
    } else if (produtos.length) {
      catalogo = '<div class="grade-produtos">' + produtos.map(p => {
        const saldo = DB.saldoProduto(d, p);
        const noCarr = st.carrinho.filter(i => i.produto_id === p.id).reduce((s, i) => s + i.quantidade, 0);
        const baixo = saldo !== null && saldo - noCarr <= DB.num(p.estoque_minimo);
        return '<button type="button" class="produto-btn" data-p="' + esc(p.id) + '"' + (edita ? '' : ' disabled') + '><b>' + esc(p.nome) + '</b>' +
          '<span class="preco">' + brl(p.preco) + '</span>' +
          (saldo !== null ? '<small class="' + (baixo ? 'vermelho' : 'apoio') + '">Estoque: ' + APP.numBR(saldo - noCarr) + ' ' + esc(p.unidade || 'un') + '</small>' : '') +
          (noCarr ? '<span class="qtd-carrinho">' + noCarr + '</span>' : '') + '</button>';
      }).join('') + '</div>';
    } else {
      catalogo = '<p class="vazio">Nenhum produto cadastrado' + (AUTH.podeVer('configuracoes') ? '. Cadastre em Configurações › Produtos e frigobar.' : '.') + '</p>';
    }

    const itensCarr = st.carrinho.map((i, k) => '<div class="par" style="align-items:center"><span style="color:#231F20">' + esc(i.descricao) + '<br><small class="apoio">' + brl(i.valor) + ' cada</small></span>' +
      '<span style="display:flex;align-items:center;gap:6px"><button type="button" class="btn btn-peq" data-menos="' + k + '" aria-label="Diminuir">−</button><b style="min-width:22px;text-align:center">' + i.quantidade + '</b>' +
      '<button type="button" class="btn btn-peq" data-mais="' + k + '" aria-label="Aumentar">+</button><b style="min-width:86px;text-align:right">' + brl(i.valor * i.quantidade) + '</b></span></div>').join('');
    const totalCarr = st.carrinho.reduce((s, i) => s + i.valor * i.quantidade, 0);

    const ultimos = c.consumos.slice().sort((a, b) => String(b.criado_em).localeCompare(String(a.criado_em))).slice(0, 8);

    box.innerHTML =
      '<section class="card larga pilha" style="gap:14px">' +
      '<div class="linha-topo"><div class="pilha" style="gap:2px"><span class="kl">Lançar na conta</span><span class="titulo-serif" style="font-size:26px">Quarto ' + esc(q ? q.numero : '—') + '</span>' +
      '<span class="kpi-sub" style="font-size:14px">' + esc(r.hospede_nome) + (cat ? ' · ' + esc(cat.nome) : '') + ' · ' + dataCurta(r.entrada) + ' a ' + dataCurta(r.saida) + '</span>' +
      '<span class="kpi-sub">' + esc(r.contratante_nome || 'Hóspede direto') + ' · ' + esc(r.codigo || '') + '</span></div>' +
      '<button type="button" class="btn btn-peq" id="lc-trocar">Trocar quarto</button></div>' +
      '<div class="chips" role="tablist">' + grupos.concat(['Avulso']).map(g => '<button type="button" class="chip" data-g="' + esc(g) + '" aria-pressed="' + (st.grupo === g) + '">' +
        esc(g === 'Avulso' ? 'Diárias e taxas' : g) + '</button>').join('') + '</div>' + catalogo + '</section>' +
      '<section class="card estreita pilha" style="gap:14px"><span class="kl">Itens a lançar</span>' +
      (itensCarr || '<p class="vazio" style="margin:0">Toque nos produtos para adicionar.</p>') +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:12px 14px;border-radius:10px;background:#231F20;color:#F4EFE6"><span style="font-weight:700">Total a lançar</span>' +
      '<span style="font-size:22px;font-weight:800;color:#F1D08A">' + brl(totalCarr) + '</span></div>' +
      (edita ? '<label class="fld">Data do consumo<input type="date" id="lc-data" value="' + st.data + '" max="' + DB.hoje() + '"></label>' +
        '<button type="button" class="btn btn-ouro" style="min-height:48px;font-size:15px" id="lc-lancar"' + (st.carrinho.length ? '' : ' disabled') + '>Lançar na conta do quarto</button>' +
        (st.carrinho.length ? '<button type="button" class="btn btn-texto" id="lc-limpar">Limpar itens</button>' : '') : '') +
      '<div class="pilha" style="gap:8px;margin-top:4px"><span class="kl">Conta atual</span>' +
      '<div class="par"><span>Diárias (' + c.noites + ' × ' + brl(r.diaria) + ')</span><span>' + brl(c.diarias) + '</span></div>' +
      '<div class="par"><span>Consumos e taxas</span><span>' + brl(c.totalConsumo) + '</span></div>' +
      '<div class="par"><span>Pagamentos</span><span class="verde">- ' + brl(c.pago) + '</span></div>' +
      '<div class="par"><span style="color:#231F20;font-weight:700">Saldo</span><span style="font-size:17px">' + brl(c.saldo) + '</span></div></div>' +
      (ultimos.length ? '<div class="pilha" style="gap:6px"><span class="kl">Últimos lançamentos</span>' + ultimos.map(x =>
        '<div class="par" style="font-size:13px"><span>' + esc(x.descricao) + (DB.num(x.quantidade) > 1 ? ' (' + APP.numBR(x.quantidade) + '×)' : '') + ' · ' + dataCurta(x.data) + '</span><span>' +
        brl(DB.num(x.valor) * (DB.num(x.quantidade) || 1)) + (edita ? ' <button type="button" class="btn-texto" style="min-height:0;padding:0 0 0 6px;text-decoration:none" data-del="' + esc(x.id) + '" aria-label="Remover lançamento">×</button>' : '') +
        '</span></div>').join('') + '</div>' : '') +
      '<button type="button" class="btn" id="lc-conta">Ver conta / fechar check-out</button></section>';

    APP.aplicarMascaras(box);
    const go = (id, fn) => { const b = $(id, box); if (b) b.onclick = fn; };
    go('#lc-trocar', () => { st.reserva = null; st.carrinho = []; montar(); });
    go('#lc-conta', () => APP.ir('tela-movimento', { reserva: r.id }));
    go('#lc-limpar', () => { st.carrinho = []; desenharPainel(d, r); });
    go('#lc-lancar', () => lancar(d, r));
    const dt = $('#lc-data'); if (dt) dt.onchange = () => { st.data = dt.value || DB.hoje(); };
    $$('[data-g]', box).forEach(b => b.onclick = () => { st.grupo = b.dataset.g; desenharPainel(d, r); });
    $$('[data-p]', box).forEach(b => b.onclick = () => {
      const p = d.produtoPorId[b.dataset.p];
      const it = st.carrinho.find(i => i.produto_id === p.id);
      if (it) it.quantidade++;
      else st.carrinho.push({ produto_id: p.id, grupo: p.grupo, descricao: p.nome, valor: DB.num(p.preco), quantidade: 1 });
      desenharPainel(d, r);
    });
    $$('[data-mais]', box).forEach(b => b.onclick = () => { st.carrinho[Number(b.dataset.mais)].quantidade++; desenharPainel(d, r); });
    $$('[data-menos]', box).forEach(b => b.onclick = () => {
      const k = Number(b.dataset.menos);
      st.carrinho[k].quantidade--;
      if (st.carrinho[k].quantidade < 1) st.carrinho.splice(k, 1);
      desenharPainel(d, r);
    });
    go('#lc-av-add', () => {
      const tipo = $('#lc-av-tipo').value;
      const qtd = Math.max(1, parseInt($('#lc-av-qtd').value, 10) || 1);
      let valor = APP.lerValor($('#lc-av-valor').value);
      const desc = $('#lc-av-desc').value.trim();
      if (!valor) { APP.aviso('Informe o valor.', 'erro'); return; }
      if (tipo === 'Desconto') valor = -Math.abs(valor);
      st.carrinho.push({ produto_id: null, grupo: tipo === 'Diária extra' || tipo === 'Pessoa adicional' ? 'Hospedagem' : (tipo === 'Desconto' ? 'Desconto' : 'Serviços'),
        descricao: tipo + (desc ? ' — ' + desc : ''), valor: valor, quantidade: qtd });
      desenharPainel(d, r);
    });
    const tipoAv = $('#lc-av-tipo');
    if (tipoAv) tipoAv.onchange = () => {
      const v = $('#lc-av-valor');
      if (tipoAv.value === 'Diária extra') v.value = APP.numBR(r.diaria, 2);
      else if (tipoAv.value === 'Taxa de late check-out' || tipoAv.value === 'Taxa de early check-in') v.value = APP.numBR(DB.num(r.diaria) / 2, 2);
      else v.value = '';
    };
    $$('[data-del]', box).forEach(b => b.onclick = async () => {
      const x = c.consumos.find(k => k.id === b.dataset.del);
      const ok = await APP.confirmar('Remover lançamento', 'Remover "' + x.descricao + '" (' + brl(DB.num(x.valor) * (DB.num(x.quantidade) || 1)) + ') da conta do quarto ' + (q ? q.numero : '') + '?', { rotuloOk: 'Remover', perigo: true });
      if (!ok.ok) return;
      await DB.excluir('consumos', x.id);
      montar();
    });
  }

  async function lancar(d, r) {
    if (!st.carrinho.length) return;
    const total = st.carrinho.reduce((s, i) => s + i.valor * i.quantidade, 0);
    const q = d.quartoPorId[r.quarto_id];
    // Aviso de estoque insuficiente (não impede: o estoque pode estar desatualizado)
    const faltas = st.carrinho.filter(i => i.produto_id).map(i => {
      const p = d.produtoPorId[i.produto_id]; const s = DB.saldoProduto(d, p);
      return (s !== null && s < i.quantidade) ? p.nome + ' (saldo ' + APP.numBR(s) + ')' : null;
    }).filter(Boolean);
    if (faltas.length) {
      const ok = await APP.confirmar('Estoque insuficiente', 'Pelo controle, falta estoque de: ' + faltas.join(', ') + '. Lançar mesmo assim?', { rotuloOk: 'Lançar' });
      if (!ok.ok) return;
    }
    const data = st.data || DB.hoje();
    for (const i of st.carrinho) {
      await DB.salvar('consumos', { reserva_id: r.id, data: data, descricao: i.descricao, quantidade: i.quantidade, valor: i.valor, produto_id: i.produto_id, grupo: i.grupo });
    }
    APP.aviso(st.carrinho.length + ' item(ns) lançados no quarto ' + (q ? q.numero : '') + ': ' + brl(total) + '.', 'sucesso');
    st.carrinho = [];
    st.data = DB.hoje();
    montar();
  }

  return { montar: montar, buscarHospedes: buscarHospedes, ligarBuscaHospede: ligarBuscaHospede, estadiaDoHospede: estadiaDoHospede };
})();

window.LANCAR = LANCAR;
