/* =====================================================================
 * pdf.js — DOCUMENTOS EM PDF (jsPDF, vetorial)
 * Voucher de hospedagem, extrato da estadia e relatórios.
 * Mede antes de desenhar (mesma fonte/estilo), quebra página sem
 * deixar título órfão, faixas de cabeçalho e rodapé com "Página x de y".
 * Evita glifos fora da fonte padrão (usa "-" em vez de "−").
 * ===================================================================== */

const PDFGEN = (function () {

  const COR = { escuro: [35, 31, 32], ouro: [201, 160, 79], ouroClaro: [241, 208, 138], creme: [247, 244, 238], creme2: [250, 246, 236],
    borda: [232, 225, 212], apoio: [94, 87, 80], texto: [35, 31, 32], cinza: [207, 200, 190], verde: [31, 94, 63], verdeFundo: [220, 239, 227],
    vermelho: [142, 47, 37], vermelhoFundo: [246, 222, 218], azulFundo: [221, 230, 240], azul: [36, 71, 110], neutro: [239, 232, 218] };

  let logoCache = null;
  async function logo() {
    if (logoCache) return logoCache;
    try {
      const r = await fetch('assets/logo.png');
      const b = await r.blob();
      logoCache = await new Promise((res, rej) => { const f = new FileReader(); f.onload = () => res(f.result); f.onerror = rej; f.readAsDataURL(b); });
    } catch (e) { logoCache = null; }
    return logoCache;
  }
  const LOGO_RAZAO = 600 / 192.43; // largura / altura do assets/logo.png

  function brl(v) { const n = Number(v) || 0; return (n < 0 ? '- ' : '') + 'R$ ' + Math.abs(n).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function dataBR(iso) { if (!iso) return '-'; const p = String(iso).slice(0, 10).split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function limpar(t) { return String(t === null || t === undefined ? '' : t).replace(/−/g, '-').replace(/[▲▼]/g, '').replace(/[^\x00-\xFF–—…•€]/g, ''); }

  function novoDoc(orient) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: orient || 'portrait', compress: true });
    doc.setLineHeightFactor(1.25);
    return doc;
  }
  const fill = (doc, c) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (doc, c) => doc.setDrawColor(c[0], c[1], c[2]);
  const txt = (doc, c) => doc.setTextColor(c[0], c[1], c[2]);
  function fonte(doc, estilo, tam, cor) { doc.setFont('helvetica', estilo || 'normal'); doc.setFontSize(tam || 10); if (cor) txt(doc, cor); }
  /** Corta o texto para caber na largura (com "..."), medindo com a fonte atual. */
  function caber(doc, t, w) {
    t = limpar(t);
    if (doc.getTextWidth(t) <= w) return t;
    while (t.length > 1 && doc.getTextWidth(t + '...') > w) t = t.slice(0, -1);
    return t + '...';
  }
  function etiqueta(doc, x, y, texto, bg, fg, alinhaDir) {
    fonte(doc, 'bold', 8.5);
    const w = doc.getTextWidth(limpar(texto)) + 7;
    const x0 = alinhaDir ? x - w : x;
    fill(doc, bg); doc.roundedRect(x0, y - 4.2, w, 6.4, 3.2, 3.2, 'F');
    txt(doc, fg); doc.text(limpar(texto), x0 + 3.5, y);
    return w;
  }

  /* ===================================================================
   * VOUCHER
   * =================================================================== */
  async function voucher(p, textoQR) {
    const doc = novoDoc('portrait');
    const W = 210, M = 16, h = p.hotel || {};
    const lg = await logo();
    // Cabeçalho
    fill(doc, COR.escuro); doc.rect(0, 0, W, 38, 'F');
    if (lg) doc.addImage(lg, 'PNG', M, 9, 60, 60 / LOGO_RAZAO);
    doc.setFont('times', 'normal'); doc.setFontSize(18); txt(doc, COR.ouroClaro);
    doc.text('VOUCHER DE HOSPEDAGEM', W - M, 18, { align: 'right' });
    fonte(doc, 'normal', 9, COR.cinza);
    doc.text(limpar('Nº ' + p.codigo + '  -  emitido em ' + p.emitido), W - M, 25, { align: 'right' });
    fill(doc, COR.ouro); doc.rect(0, 38, W, 1.4, 'F');

    let y = 52;
    fonte(doc, 'bold', 7.5, COR.apoio); doc.text('HÓSPEDE', M, y);
    const stl = { reservada: ['Reserva confirmada', COR.verdeFundo, COR.verde], hospedado: ['Hóspede na casa', COR.azulFundo, COR.azul],
      finalizada: ['Estadia concluída', COR.neutro, COR.apoio], cancelada: ['Reserva cancelada', COR.vermelhoFundo, COR.vermelho] }[p.status] || ['Reserva confirmada', COR.verdeFundo, COR.verde];
    etiqueta(doc, W - M, y + 2, stl[0], stl[1], stl[2], true);
    fonte(doc, 'bold', 17, COR.texto); doc.text(caber(doc, p.nome, W - 2 * M - 50), M, y + 8);
    fonte(doc, 'normal', 9.5, COR.apoio); doc.text(limpar('Documento: ' + p.doc), M, y + 14);

    // Período (3 colunas)
    y = 74;
    const pw = W - 2 * M, ch = 22, cw = pw / 3;
    fill(doc, COR.creme2); doc.rect(M + 2 * cw, y, cw, ch, 'F');
    draw(doc, COR.borda); doc.setLineWidth(0.3); doc.roundedRect(M, y, pw, ch, 3, 3, 'S');
    doc.line(M + cw, y, M + cw, y + ch); doc.line(M + 2 * cw, y, M + 2 * cw, y + ch);
    [['ENTRADA', dataBR(p.entrada), 'a partir das ' + (h.horaCheckin || '14:00')], ['SAÍDA', dataBR(p.saida), 'até as ' + (h.horaCheckout || '12:00')],
     ['NOITES', String(p.noites), p.pessoas]].forEach((c, i) => {
      const x = M + i * cw + 5;
      fonte(doc, 'bold', 7.5, COR.apoio); doc.text(c[0], x, y + 6.5);
      fonte(doc, 'bold', 12, COR.texto); doc.text(limpar(c[1]), x, y + 13);
      fonte(doc, 'normal', 8.5, COR.apoio); doc.text(caber(doc, c[2], cw - 8), x, y + 18.5);
    });

    // Acomodação / regime / pagamento
    y = 106;
    [['ACOMODAÇÃO', 'Quarto ' + p.quarto + ' - ' + p.tipo], ['REGIME', p.regime], ['PAGAMENTO', p.pagamento]].forEach((c, i) => {
      const x = M + i * cw;
      fonte(doc, 'bold', 7.5, COR.apoio); doc.text(c[0], x, y);
      fonte(doc, 'bold', 10.5, COR.texto);
      const l = doc.splitTextToSize(limpar(c[1]), cw - 6).slice(0, 2);
      doc.text(l, x, y + 6);
    });

    // Valores + QR
    y = 124;
    const vw = pw - 48, vh = 40;
    fill(doc, COR.creme); doc.roundedRect(M, y, vw, vh, 3, 3, 'F');
    const linhaV = (rot, val, yy, negrito, cor) => {
      fonte(doc, 'normal', 10, cor || COR.texto); doc.text(limpar(rot), M + 5, yy);
      fonte(doc, negrito ? 'bold' : 'normal', 10, cor || COR.texto); doc.text(limpar(val), M + vw - 5, yy, { align: 'right' });
    };
    linhaV('Diária (' + p.tipo + ')', brl(p.diaria), y + 8, true);
    linhaV(p.noites + ' noite(s)', brl(p.total), y + 15, true);
    linhaV('Taxas e ISS', 'inclusos', y + 22, false, COR.apoio);
    draw(doc, [226, 218, 203]); doc.line(M + 5, y + 26, M + vw - 5, y + 26);
    fonte(doc, 'bold', 11, COR.texto); doc.text('Total da reserva', M + 5, y + 34);
    fonte(doc, 'bold', 17, COR.texto); doc.text(brl(p.total), M + vw - 5, y + 35, { align: 'right' });
    // QR
    const qx = M + vw + 6, qw = 42;
    draw(doc, [201, 185, 152]); doc.setLineDashPattern([1.2, 1], 0); doc.roundedRect(qx, y, qw, vh, 3, 3, 'S'); doc.setLineDashPattern([], 0);
    try {
      const qr = qrcode(0, 'M'); qr.addData(unescape(encodeURIComponent(textoQR || p.codigo))); qr.make();
      const n = qr.getModuleCount(), lado = 28, cel = lado / n, x0 = qx + (qw - lado) / 2, y0 = y + 3;
      fill(doc, COR.escuro);
      for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) doc.rect(x0 + c * cel, y0 + r * cel, cel + 0.02, cel + 0.02, 'F');
    } catch (e) {}
    fonte(doc, 'normal', 7, COR.apoio); doc.text('QR code de validação', qx + qw / 2, y + vh - 4, { align: 'center' });

    // Observações
    y = 176;
    fonte(doc, 'bold', 7.5, COR.apoio); doc.text('OBSERVAÇÕES', M, y);
    fonte(doc, 'normal', 9.5, [59, 53, 50]);
    let yy = y + 6;
    [p.obs, h.politica].filter(Boolean).forEach(par => {
      const l = doc.splitTextToSize(limpar(par), pw);
      l.forEach(li => { if (yy < 270) { doc.text(li, M, yy); yy += 4.8; } });
      yy += 2;
    });

    // Rodapé
    fill(doc, COR.escuro); doc.rect(0, 280, W, 17, 'F');
    fonte(doc, 'normal', 8, COR.cinza);
    const end = [h.endereco, [h.cidade, h.uf].filter(Boolean).join('/')].filter(Boolean).join(' - ') || h.nome || '';
    const cont = [h.telefone, h.email, h.cnpj ? 'CNPJ ' + h.cnpj : ''].filter(Boolean).join(' - ');
    doc.text(caber(doc, end, 88), M, 290);
    doc.text(caber(doc, cont, 92), W - M, 290, { align: 'right' });
    return doc.output('blob');
  }

  /* ===================================================================
   * Estrutura comum de documentos com várias páginas
   * =================================================================== */
  async function cabecalhoPagina(doc, titulo, subtitulo, W) {
    const M = 14, lg = await logo();
    fill(doc, COR.escuro); doc.rect(0, 0, W, 24, 'F');
    if (lg) doc.addImage(lg, 'PNG', M, 5, 44, 44 / LOGO_RAZAO);
    doc.setFont('times', 'normal'); doc.setFontSize(15); txt(doc, COR.ouroClaro);
    doc.text(limpar(titulo).toUpperCase(), W - M, 11.5, { align: 'right' });
    fonte(doc, 'normal', 8, COR.cinza);
    doc.text(caber(doc, subtitulo, W - 2 * M - 60), W - M, 17.5, { align: 'right' });
    fill(doc, COR.ouro); doc.rect(0, 24, W, 1, 'F');
    return 34;
  }
  function rodapes(doc, W, H, hotelNome) {
    const n = doc.getNumberOfPages();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i);
      draw(doc, COR.borda); doc.setLineWidth(0.3); doc.line(14, H - 12, W - 14, H - 12);
      fonte(doc, 'normal', 7.5, COR.apoio);
      doc.text(limpar((hotelNome || 'Hotel Estilo Fino') + ' - Sistema de Gestão - emitido em ' + new Date().toLocaleString('pt-BR').slice(0, 17)), 14, H - 7);
      doc.text('Página ' + i + ' de ' + n, W - 14, H - 7, { align: 'right' });
    }
  }

  /** Tabela com quebra de página, cabeçalho repetido e colunas medidas. */
  function tabela(doc, y, colunas, linhas, opc) {
    const W = opc.W, H = opc.H, M = 14, util = W - 2 * M, lh = 7;
    fonte(doc, 'normal', 8.5);
    const larg = colunas.map((c, i) => {
      fonte(doc, 'bold', 7.5); let w = doc.getTextWidth(limpar(c.t).toUpperCase()) + 4;
      fonte(doc, 'normal', 8.5);
      linhas.forEach(l => { w = Math.max(w, doc.getTextWidth(limpar(l[i])) + 4); });
      return Math.min(w, c.max || 70);
    });
    const soma = larg.reduce((a, b) => a + b, 0);
    const fator = util / soma;
    const ws = larg.map(w => w * fator);
    const desenharCab = () => {
      fill(doc, COR.creme); doc.rect(M, y, util, lh, 'F');
      fonte(doc, 'bold', 7.5, COR.apoio);
      let x = M;
      colunas.forEach((c, i) => { const t = caber(doc, limpar(c.t).toUpperCase(), ws[i] - 3); doc.text(t, c.d ? x + ws[i] - 2 : x + 2, y + 4.8, c.d ? { align: 'right' } : undefined); x += ws[i]; });
      y += lh;
    };
    desenharCab();
    linhas.forEach((l, k) => {
      const total = opc.totalIndex === k;
      if (y + lh > H - 16) { doc.addPage(); y = opc.novaPagina(); desenharCab(); }
      if (total) { fill(doc, COR.creme2); doc.rect(M, y, util, lh, 'F'); }
      fonte(doc, total ? 'bold' : 'normal', 8.5, COR.texto);
      let x = M;
      colunas.forEach((c, i) => {
        const cor = typeof l[i] === 'string' && /^- R\$/.test(l[i]) ? COR.vermelho : COR.texto; txt(doc, cor);
        const t = caber(doc, l[i], ws[i] - 3);
        doc.text(t, c.d ? x + ws[i] - 2 : x + 2, y + 4.8, c.d ? { align: 'right' } : undefined); x += ws[i];
      });
      draw(doc, COR.borda); doc.setLineWidth(0.2); doc.line(M, y + lh, M + util, y + lh);
      y += lh;
    });
    return y;
  }

  /* ===================================================================
   * EXTRATO DA ESTADIA
   * =================================================================== */
  async function extrato(d, r) {
    const doc = novoDoc('portrait');
    const W = 210, H = 297, M = 14;
    const q = d.quartoPorId[r.quarto_id], cat = q && d.catPorId[q.categoria_id];
    const c = DB.conta(d, r);
    const sub = r.codigo + ' - ' + r.hospede_nome;
    const novaPagina = () => { cabecalhoPaginaSinc(); return 34; };
    let cabSinc = null;
    const cabecalhoPaginaSinc = () => cabSinc();
    await cabecalhoPagina(doc, 'Extrato da estadia', sub, W);
    const lg = await logo();
    cabSinc = () => {
      fill(doc, COR.escuro); doc.rect(0, 0, W, 24, 'F');
      if (lg) doc.addImage(lg, 'PNG', M, 5, 44, 44 / LOGO_RAZAO);
      doc.setFont('times', 'normal'); doc.setFontSize(15); txt(doc, COR.ouroClaro); doc.text('EXTRATO DA ESTADIA', W - M, 11.5, { align: 'right' });
      fonte(doc, 'normal', 8, COR.cinza); doc.text(limpar(sub), W - M, 17.5, { align: 'right' });
      fill(doc, COR.ouro); doc.rect(0, 24, W, 1, 'F');
    };
    let y = 36;
    const info = [['Hóspede', r.hospede_nome], ['Documento', r.documento || '-'], ['Quarto', (q ? q.numero : '-') + (cat ? ' - ' + cat.nome : '')],
      ['Período', dataBR(r.entrada) + ' a ' + dataBR(r.saida) + ' (' + c.noites + ' noite(s))'], ['Check-in', r.checkin_em ? new Date(r.checkin_em).toLocaleString('pt-BR').slice(0, 17) : '-'],
      ['Check-out', r.checkout_em ? new Date(r.checkout_em).toLocaleString('pt-BR').slice(0, 17) : '-'], ['Voucher', r.codigo], ['Regime', r.regime || '-']];
    fill(doc, COR.creme); doc.roundedRect(M, y, W - 2 * M, 34, 3, 3, 'F');
    info.forEach((it, i) => {
      const col = i % 2, lin = Math.floor(i / 2), x = M + 5 + col * ((W - 2 * M) / 2), yy = y + 8 + lin * 7.5;
      fonte(doc, 'normal', 8.5, COR.apoio); doc.text(it[0], x, yy);
      fonte(doc, 'bold', 9.5, COR.texto); doc.text(caber(doc, it[1], (W - 2 * M) / 2 - 32), x + 24, yy);
    });
    y += 42;
    fonte(doc, 'bold', 11, COR.texto); doc.text('Lançamentos da conta', M, y); y += 4;
    const linhas = [[dataBR(r.entrada), 'Diárias (' + c.noites + ' x ' + brl(r.diaria) + ')', brl(c.diarias)]];
    c.consumos.slice().sort((a, b) => a.data < b.data ? -1 : 1).forEach(x => linhas.push([dataBR(x.data), x.descricao + (Number(x.quantidade) > 1 ? ' (' + x.quantidade + ' x ' + brl(x.valor) + ')' : ''), brl(Number(x.valor) * (Number(x.quantidade) || 1))]));
    c.pagamentos.slice().sort((a, b) => a.data < b.data ? -1 : 1).forEach(x => linhas.push([dataBR(x.data), 'Pagamento - ' + (x.forma || '') + (x.status === 'a_receber' ? ' (faturado, vence ' + dataBR(x.vencimento) + ')' : ''), '- ' + brl(x.valor)]));
    linhas.push(['', 'Saldo', brl(c.saldo)]);
    y = tabela(doc, y, [{ t: 'Data', max: 26 }, { t: 'Descrição', max: 200 }, { t: 'Valor', d: 1, max: 36 }], linhas, { W, H, totalIndex: linhas.length - 1, novaPagina: novaPagina });
    y += 8;
    if (y > H - 50) { doc.addPage(); y = novaPagina(); }
    fill(doc, COR.escuro); doc.roundedRect(W - M - 80, y, 80, 16, 3, 3, 'F');
    fonte(doc, 'bold', 10, [244, 239, 230]); doc.text(c.saldo < -0.009 ? 'Crédito do hóspede' : (c.saldo > 0.009 ? 'Saldo a receber' : 'Conta quitada'), W - M - 76, y + 10);
    fonte(doc, 'bold', 14, COR.ouroClaro); doc.text(brl(Math.abs(c.saldo)), W - M - 4, y + 10.5, { align: 'right' });
    rodapes(doc, W, H, d.hotel.nome);
    return doc.output('blob');
  }

  /* ===================================================================
   * RELATÓRIO (A4 paisagem)
   * =================================================================== */
  async function relatorio(r, fmt) {
    const doc = novoDoc('landscape');
    const W = 297, H = 210, M = 14;
    const lg = await logo();
    const cab = () => {
      fill(doc, COR.escuro); doc.rect(0, 0, W, 24, 'F');
      if (lg) doc.addImage(lg, 'PNG', M, 5, 44, 44 / LOGO_RAZAO);
      doc.setFont('times', 'normal'); doc.setFontSize(15); txt(doc, COR.ouroClaro); doc.text(limpar(r.titulo).toUpperCase(), W - M, 11.5, { align: 'right' });
      fonte(doc, 'normal', 8, COR.cinza); doc.text(caber(doc, r.subtitulo, W - 2 * M - 60), W - M, 17.5, { align: 'right' });
      fill(doc, COR.ouro); doc.rect(0, 24, W, 1, 'F');
      return 34;
    };
    let y = cab();
    // Indicadores
    const n = r.kpis.length, gap = 4, kw = (W - 2 * M - gap * (n - 1)) / n;
    r.kpis.forEach((k, i) => {
      const x = M + i * (kw + gap);
      fill(doc, COR.creme); doc.roundedRect(x, y, kw, 20, 3, 3, 'F');
      fonte(doc, 'bold', 7, COR.apoio); doc.text(caber(doc, limpar(k.rot).toUpperCase(), kw - 8), x + 4, y + 6);
      fonte(doc, 'bold', k.peq ? 11 : 15, COR.texto); const v = caber(doc, k.val, kw - 8); doc.text(v, x + 4, y + 15);
      if (k.sub) { const vw = doc.getTextWidth(v); fonte(doc, 'normal', 8, COR.apoio); doc.text(caber(doc, k.sub, kw - vw - 12), x + 6 + vw, y + 15); }
    });
    y += 28;
    if (r.linhas.length) {
      const linhas = r.linhas.map(l => l.map((v, i) => fmt(v, r.formatos[i])));
      if (r.total) linhas.push(r.total.map((v, i) => fmt(v, r.formatos[i])));
      y = tabela(doc, y, r.colunas.map(c => ({ t: c.t, d: c.d || c.barra, max: c.d ? 42 : 80 })), linhas, { W, H, totalIndex: r.total ? linhas.length - 1 : -1, novaPagina: cab });
    } else {
      fonte(doc, 'normal', 10, COR.apoio); doc.text('Sem dados para o período e os filtros escolhidos.', M, y + 6); y += 10;
    }
    y += 6;
    if (y > H - 22) { doc.addPage(); y = cab(); }
    fonte(doc, 'normal', 8, COR.apoio);
    doc.text(doc.splitTextToSize(limpar(r.nota || ''), W - 2 * M), M, y);
    rodapes(doc, W, H, (r.hotel || {}).nome);
    return doc.output('blob');
  }

  return { voucher, extrato, relatorio, dataBR };
})();

window.PDFGEN = PDFGEN;
