/* =====================================================================
 * quartos.js — CONTROLE DE QUARTOS
 * Filtro por status, quartos agrupados por andar, painel do quarto
 * selecionado com dados da estadia e troca de status (livre, limpeza,
 * manutenção). Ocupado e reservado vêm das estadias, não da mão.
 * ===================================================================== */

const QUARTOS = (function () {
  const { $, $$, esc, brl, icone, dataCurta } = APP;
  const st = { filtro: 'todos', sel: null };

  async function montar(params) {
    if (params && params.sel) st.sel = params.sel;
    const el = $('#tela-quartos');
    const d = await APP.dados();
    const quartos = d.quartos.filter(q => q.ativo !== false);
    const edita = AUTH.podeEditar('quartos');
    const rooms = quartos.map(q => {
      const s = DB.statusQuarto(d, q);
      const est = DB.estadiaAtiva(d, q.id);
      const res = !est ? DB.reservaDoDia(d, q.id) : null;
      const r = est || res;
      const cat = d.catPorId[q.categoria_id];
      let l1, l2;
      if (r) { l1 = r.hospede_nome; l2 = est ? 'Saída ' + dataCurta(r.saida) : 'Chega ' + dataCurta(r.entrada); }
      else if (s === 'liv') { l1 = 'Disponível para venda'; l2 = q.observacao || ''; }
      else if (s === 'lmp') { l1 = 'Aguardando governança'; l2 = q.observacao || ''; }
      else { l1 = 'Bloqueado'; l2 = q.observacao || ''; }
      return { q, s, est, res, r, cat, l1, l2 };
    });
    if (!st.sel || !rooms.find(x => x.q.id === st.sel)) st.sel = rooms.length ? rooms[0].q.id : null;

    const cont = { todos: rooms.length, ocp: 0, liv: 0, res: 0, lmp: 0, mnt: 0 };
    rooms.forEach(x => cont[x.s]++);
    const chips = ['todos', 'ocp', 'liv', 'res', 'lmp', 'mnt'].map(id => {
      const nome = id === 'todos' ? 'Todos' : CONFIG.statusQuarto[id].label;
      const cor = id === 'todos' ? '#C9A04F' : CONFIG.statusQuarto[id].dot;
      return '<button type="button" class="chip" data-filtro="' + id + '" aria-pressed="' + (st.filtro === id) + '"><span class="bolinha" style="background:' + cor + '"></span>' + nome + ' · ' + cont[id] + '</button>';
    }).join('');

    const andares = {};
    rooms.forEach(x => { const a = x.q.andar || 'Quartos'; (andares[a] = andares[a] || []).push(x); });
    let grupos = '';
    Object.keys(andares).sort((a, b) => String(b).localeCompare(String(a), 'pt-BR', { numeric: true })).forEach(a => {
      const todos = andares[a];
      const vis = todos.filter(x => st.filtro === 'todos' || x.s === st.filtro);
      if (!vis.length) return;
      const oc = todos.filter(x => x.s === 'ocp').length;
      grupos += '<section class="card pilha" style="gap:14px"><div class="linha-topo"><h2>' + esc(a) + '</h2><span class="kpi-sub">' + oc + ' de ' + todos.length + ' ocupados</span></div><div class="grade-quartos">';
      vis.forEach(x => {
        const S = CONFIG.statusQuarto[x.s];
        grupos += '<button type="button" class="cartao-quarto" data-sel="' + esc(x.q.id) + '" aria-pressed="' + (x.q.id === st.sel) + '" aria-label="Quarto ' + esc(x.q.numero) + ', ' + S.label + '">' +
          '<span class="topo"><span class="numero">' + esc(x.q.numero) + '</span><span class="badge" style="background:' + S.bg + ';color:' + S.fg + '">' + S.label + '</span></span>' +
          '<span class="tipo">' + esc(x.cat ? x.cat.nome : 'Sem categoria') + '</span><span class="l1">' + esc(x.l1) + '</span><span class="l2">' + esc(x.l2 || ' ') + '</span></button>';
      });
      grupos += '</div></section>';
    });
    if (!grupos) grupos = '<div class="card"><p class="vazio">Nenhum quarto com este status.</p></div>';

    const x = rooms.find(r => r.q.id === st.sel);
    let painel = '<p class="vazio">Selecione um quarto.</p>';
    if (x) {
      const S = CONFIG.statusQuarto[x.s];
      const r = x.r;
      painel =
        '<div class="linha-topo"><div><span class="kl">Quarto selecionado</span><div class="numero-grande">' + esc(x.q.numero) + '</div></div>' +
        '<span class="badge" style="background:' + S.bg + ';color:' + S.fg + ';font-size:13px;padding:6px 12px">' + S.label + '</span></div>' +
        '<div class="caixa-creme">' +
        '<div><span>Categoria</span><b>' + esc(x.cat ? x.cat.nome : 'A definir') + '</b></div>' +
        '<div><span>Diária</span><b>' + (x.cat ? brl(x.cat.diaria) : 'A definir') + '</b></div>' +
        '<div><span>Andar</span><b>' + esc(x.q.andar || '—') + '</b></div>' +
        '<div><span>Capacidade</span><b>' + (x.cat ? x.cat.capacidade + ' pessoa(s)' : '—') + '</b></div></div>' +
        '<div class="pilha" style="gap:10px">' +
        '<div class="par"><span>Hóspede</span><span>' + esc(r ? r.hospede_nome : '—') + '</span></div>' +
        '<div class="par"><span>Entrada</span><span>' + (r ? dataCurta(r.entrada) : '—') + '</span></div>' +
        '<div class="par"><span>Saída prevista</span><span>' + (r ? dataCurta(r.saida) : '—') + '</span></div>' +
        '<div class="par"><span>Observação</span><span>' + esc(x.q.observacao || '—') + '</span></div></div>';
      if (edita) {
        const opcs = [{ v: 'liv', t: 'Livre' }, { v: 'lmp', t: 'Em limpeza' }, { v: 'mnt', t: 'Manutenção' }];
        painel +=
          '<label class="fld">Alterar status do quarto<select id="qt-status"' + (x.est ? ' disabled' : '') + '>' +
          (x.est ? '<option>Ocupado (estadia ativa)</option>' : APP.opcoes(opcs, x.q.status_manual || 'liv')) + '</select>' +
          (x.est ? '<span class="dica">Ocupado enquanto houver hóspede. Para liberar, faça o check-out em Entradas e saídas.</span>'
                 : (x.res ? '<span class="dica">Reservado para ' + esc(x.res.hospede_nome) + ' (' + dataCurta(x.res.entrada) + ' a ' + dataCurta(x.res.saida) + ').</span>' : '')) + '</label>' +
          '<label class="fld">Observação do quarto<input id="qt-obs" maxlength="140" value="' + esc(x.q.observacao || '') + '" placeholder="Ex.: ar-condicionado · libera 28/10"></label>' +
          '<button type="button" class="btn" id="qt-salvar">Salvar status e observação</button>';
      }
      painel += '<div class="grade-botoes">' +
        (AUTH.podeVer('movimento') ? '<button type="button" class="btn btn-escuro" id="qt-mov">Check-in / out</button>' : '') +
        (AUTH.podeEditar('voucher') ? '<button type="button" class="btn" id="qt-voucher">Emitir voucher</button>' : '') + '</div>' +
        '<div class="pilha" style="gap:8px;padding-top:4px"><span class="kl">Legenda</span><div class="chips" style="gap:6px">' +
        ['ocp', 'liv', 'res', 'lmp', 'mnt'].map(s => '<span class="badge b-' + s + '">' + CONFIG.statusQuarto[s].label + '</span>').join('') + '</div></div>';
    }

    const semCat = !d.categorias.length;
    el.innerHTML =
      '<header class="cab-pagina"><div><h1>Controle de quartos</h1><p>' + rooms.length + ' quartos · toque em um quarto para ver detalhes e alterar o status</p></div>' +
      '<div class="acoes">' + (AUTH.podeEditar('voucher') ? '<button type="button" class="btn" id="qt-nova">Nova reserva</button>' : '') +
      (AUTH.podeEditar('movimento') ? '<button type="button" class="btn btn-escuro" id="qt-checkin">' + icone('mais2', 18, 2) + 'Novo check-in</button>' : '') + '</div></header>' +
      (semCat ? '<div class="faixa"><span><b>Categorias e tarifas ainda não cadastradas.</b> Os quartos aparecem como "Sem categoria" até o cadastro em Configurações.</span>' +
        (AUTH.podeEditar('configuracoes') ? '<button type="button" class="btn btn-peq" id="qt-ir-config">Cadastrar agora</button>' : '') + '</div>' : '') +
      '<div class="chips" role="group" aria-label="Filtrar por status">' + chips + '</div>' +
      '<div class="duas-colunas"><div class="larga pilha-16" style="gap:20px">' + grupos + '</div>' +
      '<aside class="card estreita pilha-16" id="qt-painel" aria-label="Detalhes do quarto">' + painel + '</aside></div>';

    $$('[data-filtro]', el).forEach(b => b.onclick = () => { st.filtro = b.dataset.filtro; montar(); });
    $$('[data-sel]', el).forEach(b => b.onclick = () => {
      st.sel = b.dataset.sel; montar().then(() => {
        if (window.innerWidth < 1024) $('#qt-painel').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    const go = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
    go('#qt-nova', () => APP.ir('tela-voucher', { novo: true }));
    go('#qt-checkin', () => APP.ir('tela-movimento', { walkin: true }));
    go('#qt-ir-config', () => APP.ir('tela-config', { aba: 'categorias' }));
    if (x) {
      go('#qt-mov', () => APP.ir('tela-movimento', x.est ? { reserva: x.est.id } : (x.res ? { reserva: x.res.id } : { walkin: true, quarto: x.q.id })));
      go('#qt-voucher', () => APP.ir('tela-voucher', x.res ? { reserva: x.res.id } : { novo: true, quarto: x.q.id }));
      go('#qt-salvar', async () => {
        const novo = { observacao: $('#qt-obs').value.trim() };
        if (!x.est) novo.status_manual = $('#qt-status').value;
        await DB.salvar('quartos', Object.assign({}, x.q, novo));
        APP.aviso('Quarto ' + x.q.numero + ' atualizado.', 'sucesso');
        montar();
      });
    }
  }

  return { montar: montar };
})();

window.QUARTOS = QUARTOS;
