/* =====================================================================
 * movimento.js — ENTRADAS E SAÍDAS (check-in, check-out e contas)
 * Chegadas, saídas e hospedados do dia; check-in de reserva e walk-in;
 * conta da estadia (diárias + consumos − pagamentos), lançamento de
 * consumo, recebimento, troca de quarto / prorrogação e check-out.
 * ===================================================================== */

const MOVIMENTO = (function () {
  const { $, $$, esc, brl, icone, opcoes, dataBR, dataCurta } = APP;
  const st = { aba: 'chegadas', dia: null, conta: null };

  function quartoTxt(d, id) {
    const q = d.quartoPorId[id]; const c = q && d.catPorId[q.categoria_id];
    return q ? q.numero + (c ? ' · ' + c.nome : '') : '—';
  }

  function listas(d, dia) {
    const hoje = DB.hoje();
    const chegadas = d.reservas.filter(r => (r.status === 'reservada' && (r.entrada === dia || (dia === hoje && r.entrada < hoje))) ||
      ((r.status === 'hospedado' || r.status === 'finalizada') && APP.dataLocalDeTs(r.checkin_em) === dia));
    const saidas = d.reservas.filter(r => (r.status === 'hospedado' && (r.saida === dia || (dia === hoje && r.saida < hoje))) ||
      (r.status === 'finalizada' && APP.dataLocalDeTs(r.checkout_em) === dia));
    const casa = d.reservas.filter(r => r.status === 'hospedado');
    const ordem = (a, b) => (a._p - b._p) || String(a.hospede_nome).localeCompare(String(b.hospede_nome), 'pt-BR');
    chegadas.forEach(r => { r._p = r.status === 'reservada' ? 0 : 1; }); chegadas.sort(ordem);
    saidas.forEach(r => { r._p = r.status === 'hospedado' ? 0 : 1; }); saidas.sort(ordem);
    casa.forEach(r => { r._p = 0; }); casa.sort((a, b) => a.saida < b.saida ? -1 : 1);
    return { chegadas, saidas, casa };
  }

  async function montar(params) {
    params = params || {};
    const d = await APP.dados();
    if (params.aba) st.aba = params.aba;
    if (!st.dia) st.dia = DB.hoje();
    if (params.reserva) {
      const r = d.reservas.find(x => x.id === params.reserva);
      if (r) {
        st.conta = r.id;
        st.aba = r.status === 'reservada' ? 'chegadas' : (r.status === 'hospedado' ? (r.saida <= DB.hoje() ? 'saidas' : 'casa') : 'saidas');
        if (r.status === 'reservada' && r.entrada > DB.hoje()) st.dia = r.entrada;
      }
    }
    const el = $('#tela-movimento');
    const L = listas(d, st.dia);
    const edita = AUTH.podeEditar('movimento');
    const hoje = DB.hoje();
    const pessoasCasa = L.casa.reduce((s, r) => s + DB.num(r.adultos) + DB.num(r.criancas), 0);
    const chegFeitas = L.chegadas.filter(r => r.status !== 'reservada').length;
    const saiFeitas = L.saidas.filter(r => r.status === 'finalizada').length;
    if (!st.conta || !d.reservas.find(r => r.id === st.conta)) {
      const pri = L.saidas.find(r => r.status === 'hospedado') || L.casa[0] || L.chegadas[0];
      st.conta = pri ? pri.id : null;
    }

    const abas = [['chegadas', 'Chegadas · ' + L.chegadas.length], ['saidas', 'Saídas · ' + L.saidas.length], ['casa', 'Hospedados · ' + L.casa.length]];
    const linhas = L[st.aba].map(r => {
      let sit, cls, acao, prim = false;
      if (r.status === 'reservada') { sit = r.entrada < hoje ? 'Atrasada' : 'Aguardando'; cls = r.entrada < hoje ? 'b-pd' : 'b-ag'; acao = 'Fazer check-in'; prim = true; }
      else if (r.status === 'hospedado') {
        if (st.aba === 'saidas') { sit = r.saida < hoje ? 'Saída vencida' : 'Pendente'; cls = 'b-pd'; acao = 'Fechar conta'; prim = true; }
        else if (st.aba === 'chegadas') { sit = 'Check-in feito'; cls = 'b-ok'; acao = 'Ver conta'; }
        else { sit = r.saida < hoje ? 'Saída vencida' : 'Hospedado'; cls = r.saida < hoje ? 'b-pd' : 'b-ocp'; acao = 'Ver conta'; }
      } else { sit = 'Concluído'; cls = 'b-ok'; acao = 'Ver extrato'; }
      const c = DB.conta(d, r);
      let hora, det;
      if (st.aba === 'chegadas') { hora = r.status === 'reservada' ? (r.entrada === st.dia ? (d.hotel.horaCheckin || '14:00') : dataCurta(r.entrada)) : APP.horaBR(r.checkin_em); det = c.noites + ' diária(s) · ' + (r.codigo || '') + (r.pagamento ? ' · ' + r.pagamento.split(' — ')[0] : ''); }
      else if (st.aba === 'saidas') { hora = r.status === 'finalizada' ? APP.horaBR(r.checkout_em) : (r.saida === st.dia ? (d.hotel.horaCheckout || '12:00') : dataCurta(r.saida)); det = r.status === 'finalizada' ? 'Conta quitada' : (c.saldo > 0.009 ? 'Saldo ' + brl(c.saldo) : 'Sem saldo'); }
      else { hora = dataCurta(r.saida); det = 'Entrou ' + dataCurta(APP.dataLocalDeTs(r.checkin_em) || r.entrada) + ' · ' + (DB.num(r.adultos) + DB.num(r.criancas)) + ' pessoa(s)'; }
      const podeAcao = edita || acao.indexOf('Ver') === 0;
      return '<tr' + (r.id === st.conta ? ' style="background:#FAF6EC"' : '') + '><td class="forte">' + esc(r.hospede_nome) + '</td><td>' + esc(quartoTxt(d, r.quarto_id)) + '</td><td>' + esc(hora) + '</td>' +
        '<td class="apoio">' + esc(det) + '</td><td><span class="badge ' + cls + '">' + sit + '</span></td>' +
        '<td class="dir">' + (podeAcao ? '<button type="button" class="btn btn-peq ' + (prim ? 'btn-escuro' : '') + '" data-acao="' + esc(r.id) + '">' + acao + '</button>' : '') + '</td></tr>';
    }).join('');

    el.innerHTML =
      '<header class="cab-pagina"><div><h1>Entradas e saídas</h1><p>Check-in e check-out · ' + esc(APP.dataExtenso(st.dia).toLowerCase()) + '</p></div>' +
      '<div class="acoes"><label class="fld" style="flex-direction:row;align-items:center;gap:8px"><span class="sr">Dia</span><input type="date" id="mv-dia" value="' + st.dia + '" style="width:auto"></label>' +
      (st.dia !== hoje ? '<button type="button" class="btn" id="mv-hoje">Hoje</button>' : '') +
      (AUTH.podeEditar('voucher') ? '<button type="button" class="btn" id="mv-reserva">Nova reserva</button>' : '') +
      (edita ? '<button type="button" class="btn btn-escuro" id="mv-walkin">' + icone('mais2', 18, 2) + 'Novo check-in (walk-in)</button>' : '') + '</div></header>' +
      '<section aria-label="Resumo" class="grade-kpis" style="grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr))">' +
      kpi('#DCEFE3', '#1F5E3F', 'entrar', 'Check-ins previstos', L.chegadas.length, chegFeitas + ' feitos') +
      kpi('#F6DEDA', '#8E2F25', 'sair', 'Check-outs previstos', L.saidas.length, saiFeitas + ' feitos') +
      kpi('#DDE6F0', '#24476E', 'pessoas', 'Hóspedes na casa', pessoasCasa, L.casa.length + ' quarto(s)') + '</section>' +
      '<div class="duas-colunas"><section class="card larga pilha" style="gap:14px">' +
      '<div class="segmento" role="tablist" aria-label="Movimentação">' + abas.map(a => '<button type="button" role="tab" aria-selected="' + (st.aba === a[0]) + '" data-aba="' + a[0] + '">' + a[1] + '</button>').join('') + '</div>' +
      (linhas ? '<div class="rolagem"><table><thead><tr><th>Hóspede</th><th>Quarto</th><th>' + (st.aba === 'casa' ? 'Saída prevista' : 'Horário') + '</th><th>Detalhe</th><th>Situação</th><th><span class="sr">Ação</span></th></tr></thead><tbody>' + linhas + '</tbody></table></div>'
              : '<p class="vazio">' + ({ chegadas: 'Nenhuma chegada para este dia.', saidas: 'Nenhuma saída para este dia.', casa: 'Nenhum hóspede na casa.' }[st.aba]) + '</p>') +
      '</section><section class="card estreita pilha" aria-label="Fechamento de conta" id="mv-conta" style="gap:14px"></section></div>';

    $('#mv-dia').onchange = (e) => { st.dia = e.target.value || DB.hoje(); montar(); };
    const go = (id, fn) => { const b = $(id, el); if (b) b.onclick = fn; };
    go('#mv-hoje', () => { st.dia = DB.hoje(); montar(); });
    go('#mv-reserva', () => APP.ir('tela-voucher', { novo: true }));
    go('#mv-walkin', () => walkin(d, {}));
    $$('[data-aba]', el).forEach(b => b.onclick = () => { st.aba = b.dataset.aba; montar(); });
    $$('[data-acao]', el).forEach(b => b.onclick = () => {
      const r = d.reservas.find(x => x.id === b.dataset.acao);
      st.conta = r.id;
      if (r.status === 'reservada' && edita) { checkin(d, r); return; }
      desenharConta(d);
      if (window.innerWidth < 1024) $('#mv-conta').scrollIntoView({ behavior: 'smooth' });
      $$('tbody tr', el).forEach(tr => tr.style.background = '');
      b.closest('tr').style.background = '#FAF6EC';
    });
    desenharConta(d);
    if (params.walkin && edita) walkin(d, { hospede: params.hospede, quarto: params.quarto });
    if (params.fazerCheckin && edita) { const r = d.reservas.find(x => x.id === params.reserva); if (r && r.status === 'reservada') checkin(d, r); }
  }

  function kpi(bg, fg, ic, rot, valor, sub) {
    return '<div class="card" style="display:flex;align-items:center;gap:14px"><span aria-hidden="true" style="width:48px;height:48px;flex:0 0 48px;border-radius:12px;background:' + bg + ';color:' + fg + ';display:flex;align-items:center;justify-content:center">' +
      icone(ic, 22, 1.8) + '</span><span style="display:flex;flex-direction:column;gap:2px"><span class="kpi-sub">' + rot + '</span><span style="font-size:26px;font-weight:800">' + valor +
      ' <span style="font-size:14px;font-weight:600;color:#5E5750">· ' + sub + '</span></span></span></div>';
  }

  /* ---------------- Conta da estadia ---------------- */
  function desenharConta(d) {
    const box = $('#mv-conta');
    const r = d.reservas.find(x => x.id === st.conta);
    if (!r) { box.innerHTML = '<span class="kl">Fechamento de conta</span><p class="vazio">Selecione uma estadia na lista.</p>'; return; }
    const c = DB.conta(d, r);
    const edita = AUTH.podeEditar('movimento');
    const aberta = r.status === 'hospedado' || r.status === 'reservada';
    const q = d.quartoPorId[r.quarto_id];
    let itens = '<div class="par"><span>Diárias (' + c.noites + ' × ' + brl(r.diaria) + ')</span><span>' + brl(c.diarias) + '</span></div>';
    c.consumos.sort((a, b) => a.data < b.data ? -1 : 1).forEach(x => {
      itens += '<div class="par"><span>' + esc(x.descricao) + (DB.num(x.quantidade) > 1 ? ' (' + APP.numBR(x.quantidade) + ' × ' + brl(x.valor) + ')' : '') + ' · ' + dataCurta(x.data) + '</span><span>' + brl(DB.num(x.valor) * (DB.num(x.quantidade) || 1)) +
        (edita && aberta ? ' <button type="button" class="btn-texto" style="min-height:0;padding:0 0 0 6px;text-decoration:none" data-del-cons="' + esc(x.id) + '" aria-label="Remover consumo">×</button>' : '') + '</span></div>';
    });
    const pagos = c.pagamentos.map(p => '<div class="par" style="font-size:13px"><span>' + esc(p.forma || 'Pagamento') + ' · ' + dataCurta(p.data) + (p.status === 'a_receber' ? ' (faturado)' : '') + '</span><span class="verde">- ' + brl(p.valor) + '</span></div>').join('');
    const formas = CONFIG.formasPagamento.filter(f => f !== 'Boleto');
    const formaPadrao = /faturad/i.test(r.pagamento || '') ? 'Faturar à empresa' : (/cart[aã]o/i.test(r.pagamento || '') ? 'Cartão de crédito' : (/dinheiro/i.test(r.pagamento || '') ? 'Dinheiro' : 'Pix'));
    const periodo = dataCurta(r.entrada) + ' a ' + dataCurta(r.saida) + ' · ' + c.noites + ' noite(s)';
    box.innerHTML =
      '<div class="pilha" style="gap:2px"><span class="kl">' + (r.status === 'finalizada' ? 'Extrato da estadia' : 'Fechamento de conta') + '</span>' +
      '<span class="titulo-serif" style="font-size:26px">Quarto ' + esc(q ? q.numero : '—') + '</span>' +
      '<span class="kpi-sub" style="font-size:14px">' + esc(r.hospede_nome) + ' · ' + periodo + '</span>' +
      '<span class="kpi-sub">' + esc(r.codigo || '') + ' · ' + esc({ reservada: 'Reserva', hospedado: 'Hospedado', finalizada: 'Finalizada', cancelada: 'Cancelada' }[r.status]) + '</span></div>' +
      '<div class="pilha" style="gap:8px">' + itens +
      '<div class="par" style="color:#1F5E3F"><span style="color:#1F5E3F">Pagamentos recebidos</span><span>- ' + brl(c.pago) + '</span></div>' + pagos + '</div>' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;padding:14px;border-radius:10px;background:#231F20;color:#F4EFE6"><span style="font-weight:700">' +
      (c.saldo < -0.009 ? 'Crédito do hóspede' : 'Saldo a receber') + '</span><span style="font-size:24px;font-weight:800;color:#F1D08A">' + brl(Math.abs(c.saldo)) + '</span></div>' +
      (edita && r.status === 'hospedado' ?
        '<label class="fld">Forma de pagamento<select id="mv-forma">' + opcoes(formas, formaPadrao) + '</select></label>' +
        '<button type="button" class="btn btn-ouro" style="min-height:48px;font-size:15px" id="mv-checkout">Receber e finalizar check-out</button>' +
        '<div class="grade-botoes"><button type="button" class="btn btn-peq" id="mv-consumo">Lançar consumo</button><button type="button" class="btn btn-peq" id="mv-pagamento">Registrar pagamento</button>' +
        '<button type="button" class="btn btn-peq" id="mv-estadia">Prorrogar / trocar quarto</button><button type="button" class="btn btn-peq" id="mv-extrato">Imprimir extrato</button></div>' : '') +
      (edita && r.status === 'reservada' ?
        '<button type="button" class="btn btn-escuro" style="min-height:48px" id="mv-fazer-checkin">Fazer check-in</button>' +
        '<div class="grade-botoes"><button type="button" class="btn btn-peq" id="mv-pagamento">Pagamento antecipado</button><button type="button" class="btn btn-peq" id="mv-voucher">Abrir voucher</button></div>' : '') +
      ((!edita || r.status === 'finalizada' || r.status === 'cancelada') ? '<button type="button" class="btn" id="mv-extrato">Imprimir extrato</button>' : '') +
      (r.status !== 'reservada' && AUTH.podeVer('hospedes') && r.hospede_id ? '<button type="button" class="btn btn-texto" id="mv-ficha">Ver ficha do hóspede</button>' : '');

    const go = (id, fn) => { const b = $(id, box); if (b) b.onclick = fn; };
    go('#mv-checkout', () => checkout(d, r));
    go('#mv-consumo', () => consumo(d, r));
    go('#mv-pagamento', () => pagamento(d, r));
    go('#mv-estadia', () => alterarEstadia(d, r));
    go('#mv-extrato', () => extrato(d, r));
    go('#mv-fazer-checkin', () => checkin(d, r));
    go('#mv-voucher', () => APP.ir('tela-voucher', { reserva: r.id }));
    go('#mv-ficha', () => APP.ir('tela-hospedes', { hospede: r.hospede_id }));
    $$('[data-del-cons]', box).forEach(b => b.onclick = async () => {
      const x = c.consumos.find(k => k.id === b.dataset.delCons);
      const ok = await APP.confirmar('Remover consumo', 'Remover "' + x.descricao + '" (' + brl(DB.num(x.valor) * (DB.num(x.quantidade) || 1)) + ') da conta?', { rotuloOk: 'Remover', perigo: true });
      if (!ok.ok) return;
      await DB.excluir('consumos', x.id); montar();
    });
  }

  /* ---------------- Opções de quarto livre ---------------- */
  function quartosLivres(d, entrada, saida, ignorarReserva, atual) {
    return d.quartos.filter(q => q.ativo !== false).map(q => {
      const c = d.catPorId[q.categoria_id];
      const conf = DB.conflitos(d, q.id, entrada, saida, ignorarReserva).length;
      const ocupado = DB.estadiaAtiva(d, q.id) && (!ignorarReserva || DB.estadiaAtiva(d, q.id).id !== ignorarReserva);
      const mnt = q.status_manual === 'mnt';
      const lmp = q.status_manual === 'lmp';
      const indisp = conf || ocupado || mnt;
      return { v: q.id, t: q.numero + ' · ' + (c ? c.nome : 'Sem categoria') + (indisp ? (mnt ? ' (manutenção)' : ' (ocupado)') : (lmp ? ' (em limpeza)' : '')), desab: indisp && q.id !== atual };
    });
  }

  /* ---------------- Check-in de reserva ---------------- */
  function checkin(d, r) {
    const hoje = DB.hoje();
    const h = r.hospede_id ? d.hospedes.find(x => x.id === r.hospede_id) : null;
    const faltaDoc = !h || (!h.cpf && !h.documento);
    const entradaSug = r.entrada;
    const html =
      '<p style="margin:0"><b>' + esc(r.hospede_nome) + '</b> · ' + esc(r.codigo) + '<br><span class="apoio">Reserva de ' + dataBR(r.entrada) + ' a ' + dataBR(r.saida) + '</span></p>' +
      (r.entrada !== hoje ? '<div class="aviso-embutido">' + (r.entrada > hoje ? 'Chegada antecipada: a reserva começa em ' + dataBR(r.entrada) + '.' : 'Chegada após a data reservada (' + dataBR(r.entrada) + ').') + ' Ajuste a data de entrada se necessário — ela define as diárias.</div>' : '') +
      (faltaDoc ? '<div class="aviso-embutido">A ficha do hóspede está sem CPF/documento (FNRH). Complete em Cadastro de hóspedes.</div>' : '') +
      '<div class="grade-campos">' +
      '<label class="fld">Quarto<select name="quarto_id">' + opcoes(quartosLivres(d, r.entrada < hoje ? hoje : r.entrada, r.saida, r.id, r.quarto_id), r.quarto_id) + '</select></label>' +
      '<label class="fld">Entrada<input type="date" name="entrada" value="' + (r.entrada < hoje ? entradaSug : (r.entrada > hoje ? hoje : r.entrada)) + '"></label>' +
      '<label class="fld">Saída<input type="date" name="saida" value="' + r.saida + '"></label>' +
      '<label class="fld">Adultos<input type="number" name="adultos" min="1" value="' + (DB.num(r.adultos) || 1) + '"></label>' +
      '<label class="fld">Crianças<input type="number" name="criancas" min="0" value="' + DB.num(r.criancas) + '"></label>' +
      '<label class="fld">Diária (R$)<input name="diaria" data-dinheiro inputmode="decimal" value="' + APP.numBR(r.diaria, 2) + '"></label></div>';
    APP.janela({
      titulo: 'Check-in', html: html,
      botoes: [{ rotulo: 'Cancelar' }, {
        rotulo: 'Confirmar check-in', classe: 'btn-escuro', acao: async (c) => {
          const v = APP.lerForm(c);
          if (!v.entrada || !v.saida || v.saida <= v.entrada) throw new Error('A saída precisa ser depois da entrada.');
          const conf = DB.conflitos(d, v.quarto_id, v.entrada, v.saida, r.id);
          if (conf.length) throw new Error('Quarto indisponível no período: ' + conf[0].hospede_nome + ' (' + dataCurta(conf[0].entrada) + ' a ' + dataCurta(conf[0].saida) + ').');
          const at = DB.estadiaAtiva(d, v.quarto_id);
          if (at && at.id !== r.id) throw new Error('O quarto está ocupado por ' + at.hospede_nome + '.');
          const q = d.quartoPorId[v.quarto_id];
          if (q.status_manual === 'lmp') {
            const ok = await APP.confirmar('Quarto em limpeza', 'O quarto ' + q.numero + ' está marcado como "em limpeza". Confirmar o check-in mesmo assim?', { rotuloOk: 'Confirmar' });
            if (!ok.ok) return false;
          }
          await DB.salvar('reservas', Object.assign({}, r, {
            quarto_id: v.quarto_id, entrada: v.entrada, saida: v.saida, adultos: parseInt(v.adultos, 10) || 1, criancas: parseInt(v.criancas, 10) || 0,
            diaria: APP.lerValor(v.diaria), status: 'hospedado', checkin_em: DB.agoraISO()
          }));
          if (q.status_manual !== 'liv') await DB.salvar('quartos', Object.assign({}, q, { status_manual: 'liv' }));
          st.conta = r.id; st.aba = 'casa';
          APP.aviso('Check-in de ' + r.hospede_nome + ' no quarto ' + q.numero + ' realizado.', 'sucesso');
          montar();
        }
      }]
    });
  }

  /* ---------------- Walk-in (sem reserva) ---------------- */
  function walkin(d, opc) {
    const hoje = DB.hoje();
    const h = opc.hospede ? d.hospedes.find(x => x.id === opc.hospede) : null;
    const saida = DB.somarDias(hoje, 1);
    const html =
      '<label class="fld">Hóspede<input name="hospede_nome" list="mv-hosp" value="' + esc(h ? h.nome : '') + '" placeholder="Digite para buscar ou cadastrar"></label>' +
      '<datalist id="mv-hosp">' + d.hospedes.map(x => '<option value="' + esc(x.nome) + '">').join('') + '</datalist>' +
      '<div class="grade-campos">' +
      '<label class="fld">Documento (CPF / RG)<input name="documento" value="' + esc(h ? (h.cpf || h.documento || '') : '') + '"></label>' +
      '<label class="fld">Telefone<input name="telefone" type="tel" data-mascara="tel" value="' + esc(h ? (h.telefone || '') : '') + '"></label>' +
      '<label class="fld">Quarto<select name="quarto_id"><option value="">Selecione</option>' + opcoes(quartosLivres(d, hoje, saida, null, null), opc.quarto || '') + '</select></label>' +
      '<label class="fld">Saída<input type="date" name="saida" value="' + saida + '" min="' + DB.somarDias(hoje, 1) + '"></label>' +
      '<label class="fld">Adultos<input type="number" name="adultos" min="1" value="1"></label>' +
      '<label class="fld">Crianças<input type="number" name="criancas" min="0" value="0"></label>' +
      '<label class="fld">Diária (R$)<input name="diaria" data-dinheiro inputmode="decimal" placeholder="0,00"></label>' +
      '<label class="fld">Regime<select name="regime">' + opcoes(CONFIG.regimes, CONFIG.regimes[0]) + '</select></label></div>' +
      '<label class="fld">Pagamento<select name="pagamento">' + opcoes(CONFIG.pagamentosReserva.map(p => p.replace('— pago antecipado', '— no check-in')).filter((v, i, a) => a.indexOf(v) === i), 'Pix — no check-in') + '</select></label>';
    const jan = APP.janela({
      titulo: 'Novo check-in (walk-in)', html: html, largo: true,
      botoes: [{ rotulo: 'Cancelar' }, {
        rotulo: 'Fazer check-in', classe: 'btn-escuro', acao: async (c) => {
          const v = APP.lerForm(c);
          if (!v.hospede_nome || v.hospede_nome.length < 3) throw new Error('Informe o hóspede.');
          if (!v.quarto_id) throw new Error('Selecione o quarto.');
          if (!v.saida || v.saida <= hoje) throw new Error('A saída precisa ser depois de hoje.');
          const conf = DB.conflitos(d, v.quarto_id, hoje, v.saida, null);
          if (conf.length) throw new Error('Quarto reservado no período para ' + conf[0].hospede_nome + ' (' + dataCurta(conf[0].entrada) + ' a ' + dataCurta(conf[0].saida) + ').');
          const diaria = APP.lerValor(v.diaria);
          if (!diaria) { const ok = await APP.confirmar('Diária zerada', 'Fazer o check-in sem valor de diária?', { rotuloOk: 'Confirmar' }); if (!ok.ok) return false; }
          let hosp = d.hospedes.find(x => String(x.nome).toLowerCase() === v.hospede_nome.toLowerCase());
          if (!hosp) {
            const dig = APP.soDigitos(v.documento);
            const ehCpf = dig.length === 11 && APP.cpfValido(dig);
            hosp = await DB.salvar('hospedes', { nome: v.hospede_nome, cpf: ehCpf ? APP.mascaraCPF(dig) : null, documento: ehCpf ? null : (v.documento || null), telefone: v.telefone || null, nacionalidade: 'Brasileira' });
          }
          const q = d.quartoPorId[v.quarto_id];
          const r = await DB.salvar('reservas', {
            codigo: DB.codigoVoucher(), hospede_id: hosp.id, hospede_nome: hosp.nome, documento: v.documento || hosp.cpf || hosp.documento, telefone: v.telefone || hosp.telefone,
            email: hosp.email, empresa: hosp.empresa, quarto_id: v.quarto_id, entrada: hoje, saida: v.saida,
            adultos: parseInt(v.adultos, 10) || 1, criancas: parseInt(v.criancas, 10) || 0, regime: v.regime, pagamento: v.pagamento,
            diaria: diaria, status: 'hospedado', checkin_em: DB.agoraISO(), voucher_status: 'aguardando'
          });
          if (q.status_manual !== 'liv') await DB.salvar('quartos', Object.assign({}, q, { status_manual: 'liv' }));
          st.conta = r.id; st.aba = 'casa'; st.dia = hoje;
          APP.aviso('Check-in de ' + hosp.nome + ' no quarto ' + q.numero + ' realizado.', 'sucesso');
          montar();
        }
      }]
    });
    // Diária automática pela categoria do quarto
    const sel = $('[name="quarto_id"]', jan.corpo);
    sel.onchange = () => {
      const q = d.quartoPorId[sel.value]; const cat = q && d.catPorId[q.categoria_id];
      if (cat) $('[name="diaria"]', jan.corpo).value = APP.numBR(cat.diaria, 2);
    };
    if (opc.quarto) sel.onchange();
    const nome = $('[name="hospede_nome"]', jan.corpo);
    nome.onchange = () => {
      const x = d.hospedes.find(k => String(k.nome).toLowerCase() === nome.value.trim().toLowerCase());
      if (x) { $('[name="documento"]', jan.corpo).value = x.cpf || x.documento || ''; $('[name="telefone"]', jan.corpo).value = x.telefone || ''; }
    };
  }

  /* ---------------- Consumo ---------------- */
  function consumo(d, r) {
    APP.janela({
      titulo: 'Lançar consumo', html:
        '<div class="grade-campos"><label class="fld">Item<select name="item">' + opcoes(CONFIG.itensConsumo, CONFIG.itensConsumo[0]) + '</select></label>' +
        '<label class="fld">Descrição (opcional)<input name="desc" maxlength="80" placeholder="Ex.: 2 águas, 1 refrigerante"></label>' +
        '<label class="fld">Quantidade<input type="number" name="qtd" min="1" value="1"></label>' +
        '<label class="fld">Valor unitário (R$)<input name="valor" data-dinheiro inputmode="decimal" placeholder="0,00"></label>' +
        '<label class="fld">Data<input type="date" name="data" value="' + DB.hoje() + '"></label></div>',
      botoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Lançar na conta', classe: 'btn-escuro', acao: async (c) => {
        const v = APP.lerForm(c);
        const valor = APP.lerValor(v.valor);
        if (valor <= 0) throw new Error('Informe o valor.');
        const qtd = Math.max(1, parseInt(v.qtd, 10) || 1);
        await DB.salvar('consumos', { reserva_id: r.id, data: v.data || DB.hoje(), descricao: v.item + (v.desc ? ' — ' + v.desc : ''), quantidade: qtd, valor: valor });
        APP.aviso('Consumo lançado: ' + brl(valor * qtd) + '.', 'sucesso');
        montar();
      } }]
    });
  }

  /* ---------------- Pagamento (parcial / antecipado) ---------------- */
  function pagamento(d, r) {
    const c = DB.conta(d, r);
    APP.janela({
      titulo: 'Registrar pagamento', html:
        '<p style="margin:0" class="apoio">Saldo atual: <b>' + brl(c.saldo) + '</b></p><div class="grade-campos">' +
        '<label class="fld">Valor (R$)<input name="valor" data-dinheiro inputmode="decimal" value="' + (c.saldo > 0 ? APP.numBR(c.saldo, 2) : '') + '"></label>' +
        '<label class="fld">Forma<select name="forma">' + opcoes(CONFIG.formasPagamento.filter(f => f !== 'Boleto'), 'Pix') + '</select></label>' +
        '<label class="fld">Data<input type="date" name="data" value="' + DB.hoje() + '"></label></div>',
      botoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Registrar', classe: 'btn-escuro', acao: async (k) => {
        const v = APP.lerForm(k);
        const valor = APP.lerValor(v.valor);
        if (valor <= 0) throw new Error('Informe o valor.');
        await lancarRecebimento(d, r, valor, v.forma, v.data || DB.hoje(), r.status === 'reservada' ? 'Pagamento antecipado' : 'Pagamento parcial');
        APP.aviso('Pagamento de ' + brl(valor) + ' registrado.', 'sucesso');
        montar();
      } }]
    });
  }

  async function lancarRecebimento(d, r, valor, forma, data, rotulo) {
    const q = d.quartoPorId[r.quarto_id];
    const faturar = forma === 'Faturar à empresa';
    return DB.salvar('lancamentos', {
      data: data, tipo: 'receita', descricao: rotulo + ' — quarto ' + (q ? q.numero : '') + ' · ' + r.hospede_nome + ' (' + r.codigo + ')',
      categoria: 'Hospedagem', forma: forma, valor: Math.round(valor * 100) / 100, status: faturar ? 'a_receber' : 'recebido',
      vencimento: faturar ? DB.somarDias(data, 30) : null, reserva_id: r.id, quarto: q ? q.numero : null, pessoa: faturar ? (r.empresa || r.hospede_nome) : r.hospede_nome
    });
  }

  /* ---------------- Prorrogar / trocar quarto ---------------- */
  function alterarEstadia(d, r) {
    APP.janela({
      titulo: 'Prorrogar ou trocar quarto', html:
        '<div class="grade-campos"><label class="fld">Quarto<select name="quarto_id">' + opcoes(quartosLivres(d, DB.hoje(), r.saida, r.id, r.quarto_id), r.quarto_id) + '</select></label>' +
        '<label class="fld">Saída<input type="date" name="saida" value="' + r.saida + '" min="' + DB.somarDias(r.entrada, 1) + '"></label>' +
        '<label class="fld">Diária (R$)<input name="diaria" data-dinheiro inputmode="decimal" value="' + APP.numBR(r.diaria, 2) + '"></label></div>' +
        '<p class="apoio" style="margin:0">Na troca de quarto, o quarto anterior vai para "em limpeza".</p>',
      botoes: [{ rotulo: 'Cancelar' }, { rotulo: 'Salvar', classe: 'btn-escuro', acao: async (c) => {
        const v = APP.lerForm(c);
        if (!v.saida || v.saida <= r.entrada) throw new Error('A saída precisa ser depois da entrada.');
        const conf = DB.conflitos(d, v.quarto_id, r.entrada > DB.hoje() ? r.entrada : DB.hoje(), v.saida, r.id);
        if (conf.length) throw new Error('Conflito com ' + conf[0].hospede_nome + ' (' + dataCurta(conf[0].entrada) + ' a ' + dataCurta(conf[0].saida) + ').');
        const trocou = v.quarto_id !== r.quarto_id;
        await DB.salvar('reservas', Object.assign({}, r, { quarto_id: v.quarto_id, saida: v.saida, diaria: APP.lerValor(v.diaria),
          observacoes: trocou ? (r.observacoes ? r.observacoes + ' | ' : '') + 'Troca do quarto ' + d.quartoPorId[r.quarto_id].numero + ' para ' + d.quartoPorId[v.quarto_id].numero + ' em ' + dataBR(DB.hoje()) : r.observacoes }));
        if (trocou) await DB.salvar('quartos', Object.assign({}, d.quartoPorId[r.quarto_id], { status_manual: 'lmp' }));
        APP.aviso('Estadia atualizada.', 'sucesso');
        montar();
      } }]
    });
  }

  /* ---------------- Check-out ---------------- */
  async function checkout(d, r) {
    const hoje = DB.hoje();
    const forma = $('#mv-forma').value;
    if (r.saida > hoje && hoje > r.entrada) {
      const escolha = await new Promise(res => {
        let v = null;
        APP.janela({
          titulo: 'Saída antecipada', aoFechar: () => res(v),
          html: '<p style="margin:0">A estadia ia até ' + dataBR(r.saida) + '. Como cobrar?</p>',
          botoes: [{ rotulo: 'Manter ' + DB.noites(r) + ' noite(s)', acao: () => { v = 'manter'; } },
                   { rotulo: 'Cobrar até hoje (' + DB.diasEntre(r.entrada, hoje) + ' noite(s))', classe: 'btn-escuro', acao: () => { v = 'ajustar'; } }]
        });
      });
      if (!escolha) return;
      if (escolha === 'ajustar') { r = await DB.salvar('reservas', Object.assign({}, r, { saida: hoje })); d = await APP.dados(); r = d.reservas.find(x => x.id === r.id); }
    }
    const c = DB.conta(d, r);
    const msg = c.saldo > 0.009
      ? 'Receber ' + brl(c.saldo) + ' via ' + forma + (forma === 'Faturar à empresa' ? ' (fica em Contas a receber, vencimento em 30 dias)' : '') + ' e finalizar a estadia de ' + r.hospede_nome + '?'
      : (c.saldo < -0.009 ? 'O hóspede tem crédito de ' + brl(-c.saldo) + ' (pagou a mais). Faça a devolução e registre-a no Financeiro. Finalizar a estadia?' : 'Conta quitada. Finalizar a estadia de ' + r.hospede_nome + '?');
    const ok = await APP.confirmar('Finalizar check-out', msg, { rotuloOk: 'Finalizar check-out' });
    if (!ok.ok) return;
    if (c.saldo > 0.009) await lancarRecebimento(d, r, c.saldo, forma, hoje, 'Check-out');
    await DB.salvar('reservas', Object.assign({}, r, { status: 'finalizada', checkout_em: DB.agoraISO() }));
    const q = d.quartoPorId[r.quarto_id];
    if (q) await DB.salvar('quartos', Object.assign({}, q, { status_manual: 'lmp' }));
    APP.aviso('Check-out concluído. Quarto ' + (q ? q.numero : '') + ' enviado para limpeza.', 'sucesso', 7);
    montar();
    const d2 = await APP.dados();
    const r2 = d2.reservas.find(x => x.id === r.id);
    const imp = await APP.confirmar('Extrato', 'Deseja gerar o extrato final da estadia em PDF?', { rotuloOk: 'Gerar extrato' });
    if (imp.ok) extrato(d2, r2);
  }

  async function extrato(d, r) {
    APP.carregando(true, 'Montando o extrato…');
    try {
      const blob = await PDFGEN.extrato(d, r);
      await APP.entregarArquivo(blob, 'Extrato-' + r.codigo + '.pdf', 'application/pdf');
    } catch (e) { APP.aviso('Falha ao gerar o extrato: ' + e.message, 'erro', 8); }
    finally { APP.carregando(false); }
  }

  return { montar: montar };
})();

window.MOVIMENTO = MOVIMENTO;
