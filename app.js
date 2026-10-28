/* =====================================================================
 * app.js — NÚCLEO DA INTERFACE
 * ---------------------------------------------------------------------
 * Navegação (mostrarTela), telas de acesso, menu lateral / inferior
 * conforme as permissões, avisos, janelas (modal próprio — confirm() é
 * bloqueado em PWA no iOS), entrega de arquivos, CSV e utilidades.
 * Cada tela do sistema é um módulo próprio (inicio.js, quartos.js…)
 * com montar(params); aqui só se decide qual mostrar.
 * ===================================================================== */

const APP = (function () {

  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));

  /* ===================================================================
   * Ícones (traço 1.6, 24×24 — mesmo desenho do layout)
   * =================================================================== */
  const ICONES = {
    inicio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    quartos: '<path d="M3 19V6"/><path d="M3 14h18v5"/><path d="M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="2"/>',
    hospedes: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    voucher: '<path d="M3 7h18v3a2 2 0 0 0 0 4v3H3v-3a2 2 0 0 0 0-4z"/><path d="M14 7v10" stroke-dasharray="2 2.5"/>',
    movimento: '<path d="M4 8h13"/><path d="M13 4l4 4-4 4"/><path d="M20 16H7"/><path d="M11 12l-4 4 4 4"/>',
    financeiro: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/><circle cx="16.5" cy="14.5" r="1.2"/>',
    relatorios: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 16v-5"/><path d="M12 16V8"/><path d="M16 16v-3"/>',
    acessos: '<circle cx="12" cy="8" r="3.5"/><path d="M5 20a7 7 0 0 1 14 0"/><path d="M18.5 4.5l1.5 1.5 3-3"/>',
    configuracoes: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    mais: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    mais2: '<path d="M12 5v14M5 12h14"/>',
    busca: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
    sino: '<path d="M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/>',
    baixar: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    entrar: '<path d="M10 17l5-5-5-5"/><path d="M15 12H3"/><path d="M14 3h5a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-5"/>',
    sair: '<path d="M14 17l5-5-5-5"/><path d="M19 12H7"/><path d="M10 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
    pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/>',
    nuvem: '<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.6 1.5A3.8 3.8 0 0 1 17.5 18z"/><path d="M12 11v6M9 14l3 3 3-3"/>'
  };
  function icone(nome, tam, traco) {
    return '<svg width="' + (tam || 20) + '" height="' + (tam || 20) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' +
      (traco || 1.6) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONES[nome] || '') + '</svg>';
  }

  /* Itens de navegação: telas de módulo + gestão */
  const NAV = [
    { tela: 'tela-inicio', modulo: 'inicio', nome: 'Início', curto: 'Início', ic: 'inicio' },
    { tela: 'tela-quartos', modulo: 'quartos', nome: 'Controle de quartos', curto: 'Quartos', ic: 'quartos' },
    { tela: 'tela-hospedes', modulo: 'hospedes', nome: 'Cadastro de hóspedes', curto: 'Hóspedes', ic: 'hospedes' },
    { tela: 'tela-voucher', modulo: 'voucher', nome: 'Emissão de voucher', curto: 'Voucher', ic: 'voucher' },
    { tela: 'tela-movimento', modulo: 'movimento', nome: 'Entradas e saídas', curto: 'Entradas', ic: 'movimento' },
    { tela: 'tela-financeiro', modulo: 'financeiro', nome: 'Financeiro', curto: 'Financeiro', ic: 'financeiro' },
    { tela: 'tela-relatorios', modulo: 'relatorios', nome: 'Relatórios', curto: 'Relatórios', ic: 'relatorios' }
  ];
  const GESTAO = [
    { tela: 'tela-acessos', modulo: '_admin', nome: 'Acessos', curto: 'Acessos', ic: 'acessos' },
    { tela: 'tela-config', modulo: 'configuracoes', nome: 'Configurações', curto: 'Config.', ic: 'configuracoes' }
  ];
  const PRIORIDADE_MOVEL = ['tela-inicio', 'tela-quartos', 'tela-movimento', 'tela-hospedes', 'tela-voucher', 'tela-financeiro', 'tela-relatorios'];
  const MODULOS_JS = {
    'tela-inicio': 'INICIO', 'tela-quartos': 'QUARTOS', 'tela-hospedes': 'HOSPEDES', 'tela-voucher': 'VOUCHER',
    'tela-movimento': 'MOVIMENTO', 'tela-financeiro': 'FINANCEIRO', 'tela-relatorios': 'RELATORIOS',
    'tela-acessos': 'ACESSOS', 'tela-config': 'AJUSTES'
  };
  const TELAS_PUBLICAS = ['tela-login', 'tela-cadastro', 'tela-recuperar', 'tela-pendente', 'tela-novasenha'];

  const estado = { tela: null, params: {}, pendentesAcesso: 0, cacheDados: null, sujo: false };

  /* ===================================================================
   * Utilidades
   * =================================================================== */
  function esc(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function brl(v) {
    const n = Number(v) || 0;
    return (n < 0 ? '- ' : '') + 'R$ ' + Math.abs(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function numBR(v, casas) {
    return (Number(v) || 0).toFixed(casas || 0).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  }
  function pct(v, casas) { return numBR(v * 100, casas === undefined ? 0 : casas) + '%'; }
  function lerValor(txt) {
    if (typeof txt === 'number') return txt;
    const s = String(txt || '').replace(/[^\d,.-]/g, '');
    if (!s) return 0;
    const n = s.indexOf(',') !== -1 ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }
  function dataBR(iso) { if (!iso) return '—'; const p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function dataCurta(iso) { if (!iso) return '—'; const p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1]; }
  function horaBR(isoTs) {
    if (!isoTs) return '—';
    const d = new Date(isoTs);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function dataHoraBR(isoTs) { if (!isoTs) return '—'; const d = new Date(isoTs); return d.toLocaleDateString('pt-BR') + ' ' + horaBR(isoTs); }
  function dataLocalDeTs(isoTs) {
    if (!isoTs) return null;
    const d = new Date(isoTs);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }
  const DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function dataExtenso(iso) {
    const d = new Date(iso + 'T12:00:00');
    return DIAS[d.getDay()].charAt(0).toUpperCase() + DIAS[d.getDay()].slice(1) + ', ' + d.getDate() + ' de ' + MESES[d.getMonth()] + ' de ' + d.getFullYear();
  }
  function iniciais(nome) {
    const p = String(nome || '').trim().split(/\s+/).filter(Boolean);
    if (!p.length) return '--';
    return ((p[0][0] || '') + (p.length > 1 ? p[p.length - 1][0] : (p[0][1] || ''))).toUpperCase();
  }
  function opcoes(lista, atual, vazio) {
    let h = vazio !== undefined ? '<option value="">' + esc(vazio) + '</option>' : '';
    lista.forEach(o => {
      const v = typeof o === 'object' ? o.v : o;
      const t = typeof o === 'object' ? o.t : o;
      h += '<option value="' + esc(v) + '"' + (String(v) === String(atual === null || atual === undefined ? '' : atual) ? ' selected' : '') +
           (typeof o === 'object' && o.desab ? ' disabled' : '') + '>' + esc(t) + '</option>';
    });
    return h;
  }
  function soDigitos(s) { return String(s || '').replace(/\D/g, ''); }
  function mascaraCPF(s) {
    const d = soDigitos(s).slice(0, 11);
    return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3').replace(/(\d{3})\.(\d{3})\.(\d{3})(\d)/, '$1.$2.$3-$4');
  }
  function mascaraTelefone(s) {
    const d = soDigitos(s).slice(0, 11);
    if (d.length <= 2) return d.length ? '(' + d : '';
    if (d.length <= 6) return '(' + d.slice(0, 2) + ') ' + d.slice(2);
    if (d.length <= 10) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 6) + '-' + d.slice(6);
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7);
  }
  function mascaraCEP(s) { const d = soDigitos(s).slice(0, 8); return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d; }
  function cpfValido(cpf) {
    const d = soDigitos(cpf);
    if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
    let s = 0; for (let i = 0; i < 9; i++) s += Number(d[i]) * (10 - i);
    let r = (s * 10) % 11; if (r === 10) r = 0; if (r !== Number(d[9])) return false;
    s = 0; for (let i = 0; i < 10; i++) s += Number(d[i]) * (11 - i);
    r = (s * 10) % 11; if (r === 10) r = 0; return r === Number(d[10]);
  }
  /** Liga as máscaras nos campos com data-mascara dentro do elemento. */
  function aplicarMascaras(el) {
    $$('[data-mascara]', el).forEach(inp => {
      const f = { cpf: mascaraCPF, tel: mascaraTelefone, cep: mascaraCEP }[inp.dataset.mascara];
      if (!f) return;
      inp.addEventListener('input', () => { inp.value = f(inp.value); });
    });
    $$('[data-dinheiro]', el).forEach(inp => {
      inp.addEventListener('blur', () => { if (inp.value.trim()) inp.value = numBR(lerValor(inp.value), 2); });
    });
  }
  function whatsLink(telefone, texto) {
    let d = soDigitos(telefone);
    if (d && d.length <= 11) d = '55' + d;
    return 'https://wa.me/' + d + '?text=' + encodeURIComponent(texto || '');
  }
  /** Lê os campos [name] de um elemento para um objeto. */
  function lerForm(el) {
    const o = {};
    $$('[name]', el).forEach(i => {
      if (i.type === 'checkbox') o[i.name] = i.checked;
      else o[i.name] = typeof i.value === 'string' ? i.value.trim() : i.value;
    });
    return o;
  }

  /* ===================================================================
   * Avisos, carregando, confirmação e janelas
   * =================================================================== */
  function aviso(msg, tipo, segundos) {
    const div = document.createElement('div');
    div.className = 'aviso ' + (tipo || '');
    div.innerHTML = '<span></span><button type="button" aria-label="Fechar">×</button>';
    div.querySelector('span').textContent = msg;
    div.querySelector('button').onclick = () => div.remove();
    $('#avisos').appendChild(div);
    if (segundos !== 0) setTimeout(() => div.remove(), (segundos || 5) * 1000);
  }
  function carregando(ligado, texto) {
    $('#txt-carregando').textContent = texto || 'Processando…';
    $('#carregando').hidden = !ligado;
  }

  /**
   * Janela genérica. botoes: [{rotulo, classe, acao(corpo) -> false mantém aberta}]
   * Retorna {el, corpo, fechar}.
   */
  function janela(opc) {
    const fundo = document.createElement('div');
    fundo.className = 'modal-fundo';
    fundo.innerHTML =
      '<div class="modal' + (opc.largo ? ' largo' : '') + '" role="dialog" aria-modal="true">' +
      '<div class="modal-cab"><h3></h3><button type="button" class="fechar" aria-label="Fechar">×</button></div>' +
      '<div class="modal-corpo"></div><div class="modal-rodape"></div></div>';
    $('h3', fundo).textContent = opc.titulo || '';
    const corpo = $('.modal-corpo', fundo);
    if (typeof opc.html === 'string') corpo.innerHTML = opc.html; else if (opc.html) corpo.appendChild(opc.html);
    const rod = $('.modal-rodape', fundo);
    let fechada = false;
    const fechar = () => { if (fechada) return; fechada = true; fundo.remove(); if (opc.aoFechar) opc.aoFechar(); };
    $('.fechar', fundo).onclick = fechar;
    (opc.botoes || [{ rotulo: 'Fechar', classe: '' }]).forEach(b => {
      const bt = document.createElement('button');
      bt.type = 'button'; bt.className = 'btn ' + (b.classe || ''); bt.textContent = b.rotulo;
      bt.onclick = async () => {
        if (!b.acao) return fechar();
        bt.disabled = true;
        try { const r = await b.acao(corpo, fechar); if (r !== false) fechar(); }
        catch (e) { aviso(e.message || String(e), 'erro', 7); }
        finally { bt.disabled = false; }
      };
      rod.appendChild(bt);
    });
    if (!rod.children.length) rod.hidden = true;
    $('#modais').appendChild(fundo);
    aplicarMascaras(corpo);
    setTimeout(() => { const f = $('input:not([type=hidden]):not([readonly]), select, textarea', corpo); if (f && !('ontouchstart' in window)) f.focus(); }, 60);
    return { el: fundo, corpo: corpo, fechar: fechar };
  }

  function confirmar(titulo, texto, opc) {
    opc = opc || {};
    return new Promise(resolve => {
      let resp = { ok: false, valor: '' };
      const html = '<p style="margin:0">' + esc(texto) + '</p>' +
        (opc.campo ? '<label class="fld">' + esc(opc.campo) + '<input type="text" id="conf-campo"></label>' : '');
      janela({
        titulo: titulo, html: html,
        aoFechar: () => resolve(resp),
        botoes: [
          { rotulo: 'Cancelar', classe: '' },
          { rotulo: opc.rotuloOk || 'Confirmar', classe: opc.perigo ? 'btn-perigo' : 'btn-escuro', acao: (c) => {
            const v = opc.campo ? $('#conf-campo', c).value.trim() : '';
            if (opc.campo && opc.campoObrigatorio && !v) { aviso('Preencha: ' + opc.campo, 'erro'); return false; }
            resp = { ok: true, valor: v };
          } }
        ]
      });
    });
  }

  /* ===================================================================
   * Entrega de arquivos (PDF, planilha) — no celular, por toque
   * =================================================================== */
  const UA = navigator.userAgent || '';
  const EH_IOS = /iPhone|iPad|iPod/i.test(UA) || (/Macintosh/i.test(UA) && navigator.maxTouchPoints > 1);
  const EH_MOVEL = EH_IOS || /Android/i.test(UA);

  function downloadDireto(blob, nome) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nome; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 120000);
  }
  function entregarArquivo(blob, nome, tipo) {
    tipo = tipo || blob.type || 'application/octet-stream';
    carregando(false);
    if (!EH_MOVEL) { downloadDireto(blob, nome); aviso('Arquivo gerado: ' + nome, 'sucesso'); return Promise.resolve('download'); }
    const arquivo = new File([blob], nome, { type: tipo, lastModified: Date.now() });
    let compartilha = false;
    try { compartilha = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [arquivo] })); } catch (e) {}
    return new Promise(resolve => {
      const botoes = [];
      if (compartilha) botoes.push({ rotulo: 'Salvar / Compartilhar', classe: 'btn-escuro', acao: async () => {
        try { await navigator.share({ files: [arquivo], title: nome }); resolve('compartilhado'); }
        catch (e) { if (e && e.name === 'AbortError') return false; downloadDireto(blob, nome); resolve('baixado'); }
      } });
      botoes.push({ rotulo: 'Baixar', classe: compartilha ? '' : 'btn-escuro', acao: () => { downloadDireto(blob, nome); resolve('baixado'); } });
      janela({
        titulo: /pdf/i.test(tipo) ? 'PDF pronto' : 'Arquivo pronto',
        html: '<p style="margin:0"><b>' + esc(nome) + '</b></p><p class="apoio" style="margin:0">' +
          (compartilha ? 'Compartilhe (WhatsApp, e-mail, Drive) ou salve no aparelho.' : 'O arquivo vai para a pasta de downloads.') + '</p>',
        botoes: botoes, aoFechar: () => resolve('fechado')
      });
    });
  }

  /** Planilha para o Excel: CSV com ";" e BOM UTF-8. */
  function baixarCSV(nome, linhas) {
    const csv = linhas.map(l => l.map(c => {
      let v = c === null || c === undefined ? '' : (typeof c === 'number' ? String(c).replace('.', ',') : String(c));
      if (/[;"\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
      return v;
    }).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    return entregarArquivo(blob, nome, 'text/csv');
  }

  /* ===================================================================
   * Dados em cache (recarregados quando algo muda no banco local)
   * =================================================================== */
  async function dados() {
    if (!estado.cacheDados) estado.cacheDados = DB.carregarTudo();
    return estado.cacheDados;
  }
  DB.aoMudar((t) => {
    estado.cacheDados = null;
    if (t === '*') {
      // Chegou dado de outro aparelho: atualiza a tela se ninguém estiver digitando
      clearTimeout(estado.timerRedesenho);
      estado.timerRedesenho = setTimeout(redesenharSeSeguro, 300);
    }
    atualizarIndicadores();
  });
  function redesenharSeSeguro() {
    const t = estado.tela;
    if (!t || TELAS_PUBLICAS.indexOf(t) !== -1) return;
    const ativo = document.activeElement;
    const digitando = ativo && /INPUT|TEXTAREA|SELECT/.test(ativo.tagName) && $('#' + t).contains(ativo);
    if ($('#modais').children.length || digitando) { estado.sujo = true; return; }
    const mod = window[MODULOS_JS[t]];
    if (mod && mod.atualizar) mod.atualizar();
    else if (mod && mod.montar) mod.montar(estado.params[t] || {});
  }

  /* ===================================================================
   * Permissões e navegação
   * =================================================================== */
  function podeTela(tela) {
    if (tela === 'tela-acessos') return AUTH.ehAdmin();
    if (tela === 'tela-config') return AUTH.podeVer('configuracoes');
    if (['tela-mais', 'tela-conta', 'tela-semacesso'].indexOf(tela) !== -1) return true;
    const m = CONFIG.moduloDaTela(tela);
    return m ? AUTH.podeVer(m) : false;
  }
  function telasPermitidas() { return NAV.concat(GESTAO).filter(n => podeTela(n.tela)); }
  function primeiraTela() { const l = telasPermitidas(); return l.length ? l[0].tela : 'tela-semacesso'; }

  function montarMenus() {
    const itens = NAV.filter(n => podeTela(n.tela));
    const gest = GESTAO.filter(n => podeTela(n.tela));
    let h = '<span class="menu-rotulo">MENU</span>';
    itens.forEach(n => {
      h += '<button type="button" class="menu-item" data-ir="' + n.tela + '">' + icone(n.ic) + '<span>' + esc(n.nome) + '</span>' +
        (n.tela === 'tela-movimento' ? '<span class="contador alerta" data-cont="movimento" hidden></span>' : '') + '</button>';
    });
    if (gest.length) {
      h += '<span class="menu-rotulo" style="padding-top:14px">GESTÃO</span>';
      gest.forEach(n => {
        h += '<button type="button" class="menu-item" data-ir="' + n.tela + '">' + icone(n.ic) + '<span>' + esc(n.nome) + '</span>' +
          (n.tela === 'tela-acessos' ? '<span class="contador alerta" data-cont="acessos" hidden></span>' : '') + '</button>';
      });
    }
    $('#menu-lateral').innerHTML = h;

    // Inferior: até 5 telas + "Mais"
    const prior = PRIORIDADE_MOVEL.filter(t => podeTela(t)).slice(0, 5);
    let b = '';
    prior.forEach(t => {
      const n = NAV.find(x => x.tela === t);
      b += '<button type="button" data-ir="' + t + '">' + icone(n.ic, 22) + '<span>' + esc(n.curto) + '</span>' +
        (t === 'tela-movimento' ? '<span class="contador alerta" data-cont="movimento" hidden></span>' : '') + '</button>';
    });
    b += '<button type="button" data-ir="tela-mais">' + icone('mais', 22) + '<span>Mais</span><span class="contador alerta" data-cont="acessos" hidden></span></button>';
    $('#nav-inferior').innerHTML = b;
    $('#nav-inferior').style.setProperty('--itens', prior.length + 1);
    $$('[data-ir]', $('#app')).forEach(bt => bt.onclick = () => mostrarTela(bt.dataset.ir));

    const p = AUTH.perfil() || {};
    $('#usuario-ini').textContent = iniciais(p.nome);
    $('#usuario-nome').textContent = String(p.nome || 'Usuário').split(' ')[0] + (String(p.nome || '').split(' ').length > 1 ? ' ' + String(p.nome).split(' ').slice(-1)[0] : '');
    $('#usuario-cargo').textContent = (p.perfil === 'admin' ? 'Administrador' : (p.cargo || 'Usuário'));
  }

  function mostrarTela(id, params) {
    if (TELAS_PUBLICAS.indexOf(id) !== -1) return mostrarPublica(id);
    if (!AUTH.autenticado()) return mostrarPublica('tela-login');
    if (!podeTela(id)) { aviso('Seu acesso não inclui esta tela.', 'alerta'); id = primeiraTela(); }
    document.body.classList.remove('publico');
    $('#acesso').hidden = true;
    estado.tela = id;
    if (params) estado.params[id] = params;
    $$('#principal > .tela').forEach(t => { t.hidden = (t.id !== id); });
    $$('[data-ir]', $('#app')).forEach(b => b.classList.toggle('ativa', b.dataset.ir === id ||
      (b.dataset.ir === 'tela-mais' && ['tela-mais', 'tela-conta', 'tela-acessos', 'tela-config', 'tela-financeiro', 'tela-relatorios', 'tela-hospedes', 'tela-voucher'].indexOf(id) !== -1 &&
       !$('#nav-inferior [data-ir="' + id + '"]'))));
    window.scrollTo(0, 0);
    estado.sujo = false;
    const mod = window[MODULOS_JS[id]];
    try {
      if (mod && mod.montar) mod.montar(params || estado.params[id] || {});
      if (id === 'tela-mais') montarMais();
      if (id === 'tela-conta') montarConta();
    } catch (e) { console.error(e); aviso('Erro ao abrir a tela: ' + e.message, 'erro', 8); }
    if (params) delete estado.params[id];
  }

  function mostrarPublica(id) {
    document.body.classList.add('publico');
    $('#acesso').hidden = false;
    TELAS_PUBLICAS.forEach(t => { $('#' + t).hidden = (t !== id); });
    estado.tela = id;
    if (id === 'tela-login') {
      $('#aviso-modo-local').hidden = !AUTH.modoLocal();
      $('#aviso-offline-login').hidden = navigator.onLine || AUTH.modoLocal();
      const e = AUTH.estado();
      if (e.emailUltimaConta && !$('#login-email').value) $('#login-email').value = e.emailUltimaConta;
    }
    window.scrollTo(0, 0);
  }

  /* ===================================================================
   * Telas de acesso
   * =================================================================== */
  function ligarAcesso() {
    $('#cad-cargo').innerHTML = opcoes(CONFIG.auth.cargos, '', 'Selecione');
    aplicarMascaras($('#tela-cadastro'));
    $('#cad-telefone').dataset.mascara = 'tel';
    $('#cad-telefone').addEventListener('input', e => { e.target.value = mascaraTelefone(e.target.value); });
    $$('[data-ir-publico]').forEach(b => b.onclick = () => mostrarPublica(b.dataset.irPublico));
    $('#link-cadastro').onclick = () => mostrarPublica('tela-cadastro');
    $('#link-esqueci').onclick = () => { $('#rec-email').value = $('#login-email').value; mostrarPublica('tela-recuperar'); };
    $('#login-senha').addEventListener('keydown', e => { if (e.key === 'Enter') $('#btn-login').click(); });

    $('#btn-login').onclick = async () => {
      const email = $('#login-email').value.trim(), senha = $('#login-senha').value;
      $('#login-erro').textContent = '';
      if (!email || !senha) { $('#login-erro').textContent = 'Informe e-mail e senha.'; return; }
      carregando(true, 'Entrando…');
      try {
        await AUTH.entrarAuto(email, senha);
        $('#login-senha').value = '';
        await entrarNoSistema();
      } catch (e) {
        if (String(e.message) === 'PENDENTE') mostrarPendente();
        else $('#login-erro').textContent = e.message;
      } finally { carregando(false); }
    };

    $('#btn-cadastrar').onclick = async () => {
      $('#cad-erro').textContent = '';
      const d = {
        nome: $('#cad-nome').value, telefone: $('#cad-telefone').value, cargo: $('#cad-cargo').value,
        email: $('#cad-email').value.trim(), senha: $('#cad-senha').value, confirmacao: $('#cad-confirmacao').value
      };
      carregando(true, 'Enviando cadastro…');
      try {
        const r = await AUTH.cadastrar(d);
        if (r.entrou) { aviso('Conta de administrador criada neste aparelho.', 'sucesso'); await entrarNoSistema(); return; }
        $('#login-email').value = d.email;
        mostrarPendente(r.precisaConfirmarEmail
          ? 'Cadastro enviado. Abra o e-mail que enviamos para ' + d.email + ' e confirme o endereço. Depois disso, o administrador libera o seu acesso.'
          : null);
      } catch (e) { $('#cad-erro').textContent = e.message; }
      finally { carregando(false); }
    };

    $('#btn-recuperar').onclick = async () => {
      $('#rec-erro').textContent = '';
      carregando(true, 'Enviando…');
      try {
        await AUTH.recuperarSenha($('#rec-email').value);
        aviso('Se o e-mail estiver cadastrado, o link de nova senha chegará em instantes.', 'sucesso', 8);
        mostrarPublica('tela-login');
      } catch (e) { $('#rec-erro').textContent = e.message; }
      finally { carregando(false); }
    };

    $('#btn-novasenha').onclick = async () => {
      const s = $('#ns-senha').value, c = $('#ns-confirmacao').value;
      $('#ns-erro').textContent = '';
      if (!AUTH.validarSenha(s)) { $('#ns-erro').textContent = 'Mínimo de ' + CONFIG.auth.minimoSenha + ' caracteres, com letra e número.'; return; }
      if (s !== c) { $('#ns-erro').textContent = 'A confirmação não confere.'; return; }
      carregando(true, 'Salvando…');
      try {
        const base = String(CONFIG.supabase.url).replace(/\/+$/, '');
        const r = await fetch(base + '/auth/v1/user', {
          method: 'PUT', headers: { apikey: CONFIG.supabase.anonKey, Authorization: 'Bearer ' + estado.tokenRecuperacao, 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: s })
        });
        if (!r.ok) throw new Error('O link expirou ou já foi usado. Peça um novo em "Esqueci minha senha".');
        aviso('Senha alterada. Entre com a nova senha.', 'sucesso', 8);
        mostrarPublica('tela-login');
      } catch (e) { $('#ns-erro').textContent = e.message; }
      finally { carregando(false); }
    };
  }

  function mostrarPendente(texto) {
    const a = CONFIG.administrador;
    $('#pendente-texto').textContent = texto || 'Seu cadastro foi recebido e está aguardando a liberação do administrador. Assim que ele liberar, entre com o seu e-mail e senha.';
    $('#pendente-contato').innerHTML = 'Administrador: <b>' + esc(a.nome) + '</b><br>WhatsApp: <b>' + esc(a.telefone) + '</b>';
    const nome = $('#cad-nome').value || '';
    $('#pendente-whats').href = whatsLink(a.whatsapp, 'Olá, ' + a.nome.split(' ')[0] + '! Fiz meu cadastro no Sistema de Gestão do ' + CONFIG.app.hotel +
      (nome ? ' (' + nome + ', ' + ($('#login-email').value || $('#cad-email').value) + ')' : '') + ' e aguardo a liberação do acesso.');
    mostrarPublica('tela-pendente');
  }

  /** Volta de links do Supabase (#access_token=...&type=signup|recovery). */
  function tratarRetornoAuth() {
    const h = window.location.hash || '';
    if (h.indexOf('access_token=') === -1 && h.indexOf('error') === -1) return false;
    const p = new URLSearchParams(h.slice(1));
    history.replaceState(null, '', window.location.pathname);
    if (p.get('error')) { aviso('O link do e-mail expirou ou já foi usado. ' + (p.get('error_description') || ''), 'erro', 10); return false; }
    if (p.get('type') === 'recovery') { estado.tokenRecuperacao = p.get('access_token'); mostrarPublica('tela-novasenha'); return true; }
    aviso('E-mail confirmado. Entre com sua senha — se ainda não foi liberado, o administrador será avisado.', 'sucesso', 10);
    return false;
  }

  /* ===================================================================
   * Entrada no sistema, sincronização e indicadores
   * =================================================================== */
  async function entrarNoSistema() {
    montarMenus();
    $('#faixa-local').hidden = !AUTH.modoLocal();
    SYNC.iniciar();
    await atualizarIndicadores();
    mostrarTela(primeiraTela());
    if (AUTH.ehAdmin()) setTimeout(verificarPendentesAcesso, 1200);
  }

  async function verificarPendentesAcesso() {
    try {
      estado.pendentesAcesso = await AUTH.admin.contarPendentes();
      $$('[data-cont="acessos"]').forEach(c => { c.textContent = estado.pendentesAcesso; c.hidden = !estado.pendentesAcesso; });
      if (estado.pendentesAcesso && !estado.avisouPendentes) {
        estado.avisouPendentes = true;
        aviso(estado.pendentesAcesso + ' cadastro(s) aguardando sua liberação em Acessos.', 'alerta', 8);
      }
    } catch (e) {}
  }

  async function atualizarIndicadores() {
    if (!AUTH.autenticado()) return;
    let pend = 0;
    try { pend = await DB.contarPendentes(); } catch (e) {}
    const local = AUTH.modoLocal();
    let txt, cls;
    if (local) { txt = 'Modo local'; cls = 'local'; }
    else if (!navigator.onLine) { txt = pend ? 'Sem internet · ' + pend + ' na fila' : 'Sem internet'; cls = 'off'; }
    else if (pend) { txt = pend + ' na fila'; cls = 'fila'; }
    else { txt = 'Sincronizado'; cls = 'on'; }
    ['', '-movel'].forEach(s => {
      $('#txt-sync' + s).textContent = txt;
      $('#ponto-sync' + s).className = 'ponto ' + cls;
    });
    $('#faixa-fila').hidden = local || !pend;
    $('#faixa-fila-qtd').textContent = pend + (pend === 1 ? ' registro aguardando envio' : ' registros aguardando envio');
    const aus = SYNC.tabelasAusentes ? SYNC.tabelasAusentes() : [];
    $('#faixa-tabela').hidden = !aus.length;
    if (aus.length) $('#faixa-tabela').innerHTML = '<span><b>Base central incompleta:</b> faltam as tabelas ' + esc(aus.join(', ')) +
      '. Os dados ficam guardados no aparelho e serão enviados depois que o script banco/01-estrutura.sql for executado no Supabase.</span>';
    // Contador de saídas vencidas / chegadas pendentes
    try {
      const d = await dados();
      const hoje = DB.hoje();
      const vencidas = d.reservas.filter(r => r.status === 'hospedado' && r.saida < hoje).length;
      const chegadas = d.reservas.filter(r => r.status === 'reservada' && r.entrada <= hoje).length;
      const n = vencidas + chegadas;
      $$('[data-cont="movimento"]').forEach(c => { c.textContent = n; c.hidden = !n; c.classList.toggle('alerta', vencidas > 0); });
    } catch (e) {}
  }

  async function sincronizarAgora() {
    if (AUTH.modoLocal()) { aviso('Modo local: não há base central configurada.', 'alerta'); return; }
    carregando(true, 'Sincronizando…');
    try {
      const r = await SYNC.sincronizar(true);
      if (r.offline) aviso('Sem conexão com a base. Os dados continuam guardados no aparelho.', 'alerta');
      else if (r.sessaoExpirada) aviso('Sessão expirada: saia e entre novamente com internet.', 'erro', 8);
      else if (r.erro) aviso('Falha na sincronização: ' + r.erro, 'erro', 8);
      else aviso('Sincronizado: ' + (r.enviados || 0) + ' enviado(s), ' + (r.recebidos || 0) + ' recebido(s).', 'sucesso');
    } finally { carregando(false); atualizarIndicadores(); }
  }

  /* ===================================================================
   * Telas "Mais" (celular) e "Minha conta"
   * =================================================================== */
  function montarMais() {
    const naBarra = $$('#nav-inferior [data-ir]').map(b => b.dataset.ir);
    const resto = telasPermitidas().filter(n => naBarra.indexOf(n.tela) === -1);
    let h = '<header class="cab-pagina"><div><h1>Mais opções</h1><p>Demais telas, sincronização e conta</p></div></header><div class="card pilha">';
    resto.forEach(n => {
      h += '<button type="button" class="btn btn-bloco" style="justify-content:flex-start" data-ir2="' + n.tela + '">' + icone(n.ic) + esc(n.nome) +
        (n.tela === 'tela-acessos' && estado.pendentesAcesso ? ' <span class="contador alerta" style="margin-left:auto">' + estado.pendentesAcesso + '</span>' : '') + '</button>';
    });
    h += '<button type="button" class="btn btn-bloco" style="justify-content:flex-start" data-ir2="tela-conta">' + icone('pessoas') + 'Minha conta e sincronização</button></div>';
    $('#tela-mais').innerHTML = h;
    $$('[data-ir2]', $('#tela-mais')).forEach(b => b.onclick = () => mostrarTela(b.dataset.ir2));
  }

  async function montarConta() {
    const p = AUTH.perfil() || {};
    const ult = await SYNC.ultimaSincronizacao();
    const pend = await DB.contarPendentes();
    const niveis = { nenhum: 'Sem acesso', ver: 'Consulta', editar: 'Edição' };
    let acessos = '';
    CONFIG.modulos.forEach(m => { acessos += '<tr><td>' + esc(m.nome) + '</td><td>' + esc(niveis[AUTH.nivel(m.id)]) + '</td></tr>'; });
    $('#tela-conta').innerHTML =
      '<header class="cab-pagina"><div><h1>Minha conta</h1><p>' + esc(p.email || '') + '</p></div>' +
      '<div class="acoes"><button type="button" class="btn btn-perigo" id="conta-sair">' + icone('sair', 18) + 'Sair</button></div></header>' +
      '<div class="grade-2">' +
      '<section class="card pilha"><h2>Dados</h2>' +
      '<label class="fld">Nome<input name="nome" value="' + esc(p.nome) + '"></label>' +
      '<label class="fld">Telefone / WhatsApp<input name="telefone" data-mascara="tel" value="' + esc(p.telefone || '') + '"></label>' +
      '<div class="par"><span>Perfil</span><span>' + (p.perfil === 'admin' ? 'Administrador' : esc(p.cargo || 'Usuário')) + '</span></div>' +
      '<div class="rodape-form"><button type="button" class="btn btn-escuro" id="conta-salvar">Salvar dados</button></div></section>' +
      '<section class="card pilha"><h2>Sincronização</h2>' +
      '<div class="par"><span>Base central</span><span>' + (AUTH.modoLocal() ? 'Não configurada (modo local)' : 'Supabase') + '</span></div>' +
      '<div class="par"><span>Última sincronização</span><span>' + (ult ? dataHoraBR(ult) : '—') + '</span></div>' +
      '<div class="par"><span>Aguardando envio</span><span>' + pend + '</span></div>' +
      '<div class="par"><span>Tempo real</span><span>' + (SYNC.tempoRealAtivo() ? 'Conectado' : 'Desligado') + '</span></div>' +
      '<div class="par"><span>Versão</span><span>' + esc(CONFIG.app.versao) + '</span></div>' +
      '<button type="button" class="btn btn-escuro" id="conta-sync"' + (AUTH.modoLocal() ? ' disabled' : '') + '>' + icone('nuvem', 18) + 'Sincronizar agora</button></section>' +
      '<section class="card pilha"><h2>Meu acesso</h2><div class="rolagem"><table><thead><tr><th>Módulo</th><th>Nível</th></tr></thead><tbody>' + acessos + '</tbody></table></div></section>' +
      '</div>';
    aplicarMascaras($('#tela-conta'));
    $('#conta-sair').onclick = sair;
    $('#conta-sync').onclick = sincronizarAgora;
    $('#conta-salvar').onclick = async () => {
      const d = lerForm($('#tela-conta'));
      if (d.nome.split(/\s+/).length < 2) { aviso('Informe nome e sobrenome.', 'erro'); return; }
      try { await AUTH.atualizarMeusDados({ nome: d.nome, telefone: d.telefone }); montarMenus(); aviso('Dados atualizados.', 'sucesso'); }
      catch (e) { aviso(e.message, 'erro'); }
    };
  }

  async function sair() {
    const pend = await DB.contarPendentes();
    const r = await confirmar('Sair do sistema', pend && !AUTH.modoLocal()
      ? 'Há ' + pend + ' registro(s) ainda não enviados. Eles continuam guardados neste aparelho e serão enviados no próximo acesso. Sair mesmo assim?'
      : 'Deseja sair agora?', { rotuloOk: 'Sair' });
    if (!r.ok) return;
    await AUTH.sair();
    mostrarPublica('tela-login');
  }

  /* ===================================================================
   * Inicialização
   * =================================================================== */
  async function iniciar() {
    $('#rodape-versao').textContent = CONFIG.app.nome + ' · versão ' + CONFIG.app.versao;
    ligarAcesso();
    $('#pilula-sync').onclick = () => mostrarTela('tela-conta');
    $('#pilula-sync-movel').onclick = () => mostrarTela('tela-conta');
    $('#cartao-usuario').onclick = () => mostrarTela('tela-conta');
    $('#btn-faixa-enviar').onclick = sincronizarAgora;
    window.addEventListener('online', atualizarIndicadores);
    window.addEventListener('offline', atualizarIndicadores);
    SYNC.aoMudar((ev, r) => {
      if (ev === 'fim') {
        atualizarIndicadores();
        if (r && r.bloqueado) { aviso('Seu acesso foi bloqueado ou alterado pelo administrador.', 'erro', 10); AUTH.sair().then(() => mostrarPublica('tela-login')); }
        if (AUTH.ehAdmin()) verificarPendentesAcesso();
      }
    });
    AUTH.aoMudar(() => {
      // Permissões podem ter mudado (revalidação): refaz os menus
      if (AUTH.autenticado() && TELAS_PUBLICAS.indexOf(estado.tela) === -1) {
        const assinatura = JSON.stringify([AUTH.perfil() && AUTH.perfil().permissoes, AUTH.ehAdmin()]);
        if (estado.assinaturaMenu && estado.assinaturaMenu !== assinatura) { montarMenus(); if (!podeTela(estado.tela)) mostrarTela(primeiraTela()); }
        estado.assinaturaMenu = assinatura;
      }
    });

    try { await DB.cargaInicial(); } catch (e) { aviso('Não foi possível abrir o banco do aparelho: ' + e.message, 'erro', 0); }
    await AUTH.iniciar();
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('service-worker.js').catch(() => {});
    }
    if (tratarRetornoAuth()) return;
    if (AUTH.autenticado()) await entrarNoSistema();
    else mostrarPublica('tela-login');
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  return {
    $, $$, icone, esc, brl, numBR, pct, lerValor, dataBR, dataCurta, horaBR, dataHoraBR, dataLocalDeTs, dataExtenso, iniciais,
    opcoes, soDigitos, mascaraCPF, mascaraTelefone, cpfValido, aplicarMascaras, whatsLink, lerForm,
    aviso, carregando, janela, confirmar, entregarArquivo, baixarCSV,
    dados, mostrarTela, ir: mostrarTela, podeTela, atualizarIndicadores, sincronizarAgora, sair,
    MESES: MESES, DIAS: DIAS, EH_MOVEL: EH_MOVEL,
    tela: () => estado.tela
  };
})();

window.APP = APP;
