/* =====================================================================
 * config.js — ARQUIVO ÚNICO DE PARAMETRIZAÇÃO
 * ---------------------------------------------------------------------
 * Hotel Estilo Fino — Sistema de Gestão
 *
 * Aqui ficam: versão, base central (Supabase), módulos e níveis de
 * acesso, listas de apoio (formas de pagamento, regimes, categorias de
 * receita/despesa) e as cores do tema. Categorias de quarto, tarifas,
 * quartos e dados do hotel são cadastrados pelo próprio app
 * (Configurações), não aqui.
 * ===================================================================== */

const CONFIG = {

  app: {
    nome: 'Hotel Estilo Fino — Sistema de Gestão',
    nomeCurto: 'Estilo Fino',
    hotel: 'Hotel Estilo Fino',
    versao: '1.0.0',
    prefixoVoucher: 'HEF'
  },

  /* -------------------------------------------------------------------
   * BASE CENTRAL (Supabase)
   * Preencha "url" e "anonKey" (Supabase > Project Settings > API).
   * Enquanto estiver com os textos de exemplo, o app funciona no modo
   * local: os dados ficam somente neste aparelho.
   * NUNCA coloque aqui a chave service_role.
   * ----------------------------------------------------------------- */
  supabase: {
    url: 'https://SEUPROJETO.supabase.co',
    anonKey: 'COLOQUE-AQUI-A-CHAVE-ANON',
    tabelaUsuarios: 'usuarios'
  },

  sync: {
    intervaloSegundos: 30,
    maxTentativas: 5
  },

  auth: {
    diasSessaoOffline: 30,
    minimoSenha: 8,
    cargos: ['Recepção', 'Governança', 'Gerência', 'Financeiro', 'Manutenção', 'Outro']
  },

  /* Contato exibido para quem aguarda liberação de acesso. */
  administrador: {
    nome: 'Carlos Eduardo da Silva Ribeiro',
    telefone: '(89) 99909-9209',
    whatsapp: '5589999099209'
  },

  /* -------------------------------------------------------------------
   * MÓDULOS E NÍVEIS DE ACESSO
   * Cada usuário recebe, por módulo: nenhum | ver | editar.
   * O administrador tem tudo e ainda a tela de Acessos.
   * ----------------------------------------------------------------- */
  modulos: [
    { id: 'inicio',        nome: 'Início',               tela: 'tela-inicio' },
    { id: 'quartos',       nome: 'Controle de quartos',  tela: 'tela-quartos' },
    { id: 'hospedes',      nome: 'Cadastro de hóspedes', tela: 'tela-hospedes' },
    { id: 'voucher',       nome: 'Reservas e vouchers',  tela: 'tela-voucher' },
    { id: 'movimento',     nome: 'Entradas e saídas',    tela: 'tela-movimento' },
    { id: 'financeiro',    nome: 'Financeiro',           tela: 'tela-financeiro' },
    { id: 'relatorios',    nome: 'Relatórios',           tela: 'tela-relatorios' },
    { id: 'configuracoes', nome: 'Configurações',        tela: 'tela-config' }
  ],

  /* Modelos prontos oferecidos na liberação (o admin pode ajustar). */
  perfisModelo: {
    'Recepção':   { inicio: 'ver', quartos: 'editar', hospedes: 'editar', voucher: 'editar', movimento: 'editar', financeiro: 'nenhum', relatorios: 'nenhum', configuracoes: 'nenhum' },
    'Governança': { inicio: 'ver', quartos: 'editar', hospedes: 'nenhum', voucher: 'nenhum', movimento: 'ver',    financeiro: 'nenhum', relatorios: 'nenhum', configuracoes: 'nenhum' },
    'Financeiro': { inicio: 'ver', quartos: 'ver',    hospedes: 'ver',    voucher: 'ver',    movimento: 'ver',    financeiro: 'editar', relatorios: 'ver',    configuracoes: 'nenhum' },
    'Gerência':   { inicio: 'ver', quartos: 'editar', hospedes: 'editar', voucher: 'editar', movimento: 'editar', financeiro: 'editar', relatorios: 'ver',    configuracoes: 'ver' }
  },

  /* -------------------------------------------------------------------
   * TABELAS SINCRONIZADAS — colunas enviadas à base (lista fechada)
   * ----------------------------------------------------------------- */
  tabelas: {
    categorias:  ['nome', 'diaria', 'capacidade', 'descricao', 'ordem', 'ativo'],
    quartos:     ['numero', 'andar', 'categoria_id', 'status_manual', 'observacao', 'ativo', 'ordem'],
    hospedes:    ['nome', 'cpf', 'documento', 'nascimento', 'nacionalidade', 'telefone', 'email', 'cep',
                  'endereco', 'cidade', 'uf', 'empresa', 'placa', 'motivo', 'origem', 'observacoes'],
    reservas:    ['codigo', 'hospede_id', 'hospede_nome', 'documento', 'telefone', 'email', 'empresa',
                  'quarto_id', 'entrada', 'saida', 'adultos', 'criancas', 'regime', 'pagamento', 'diaria',
                  'observacoes', 'status', 'checkin_em', 'checkout_em', 'voucher_status', 'voucher_enviado_em'],
    consumos:    ['reserva_id', 'data', 'descricao', 'quantidade', 'valor'],
    lancamentos: ['data', 'tipo', 'descricao', 'categoria', 'forma', 'valor', 'status', 'vencimento',
                  'reserva_id', 'quarto', 'pessoa'],
    parametros:  ['dados']
  },
  colunasComuns: ['id', 'criado_em', 'atualizado_em', 'excluido'],

  /* -------------------------------------------------------------------
   * LISTAS DE APOIO
   * ----------------------------------------------------------------- */
  statusQuarto: {
    ocp: { label: 'Ocupado',    curto: 'OCP', bg: '#DDE6F0', fg: '#24476E', dot: '#2F4F73' },
    liv: { label: 'Livre',      curto: 'LIV', bg: '#DCEFE3', fg: '#1F5E3F', dot: '#3E8E63' },
    res: { label: 'Reservado',  curto: 'RES', bg: '#F3E4C2', fg: '#5C430F', dot: '#C9A04F' },
    lmp: { label: 'Limpeza',    curto: 'LMP', bg: '#ECE3F3', fg: '#4E2F63', dot: '#8A62A6' },
    mnt: { label: 'Manutenção', curto: 'MNT', bg: '#F6DEDA', fg: '#8E2F25', dot: '#B4443A' }
  },

  regimes: ['Café da manhã incluso', 'Meia pensão', 'Pensão completa', 'Somente hospedagem'],

  pagamentosReserva: ['Pix — pago antecipado', 'Cartão de crédito — no check-in', 'Faturado à empresa',
                      'Dinheiro — no check-in', 'Pix — no check-in'],

  formasPagamento: ['Pix', 'Cartão de crédito', 'Cartão de débito', 'Dinheiro', 'Faturar à empresa', 'Boleto', 'Transferência'],

  itensConsumo: ['Frigobar', 'Restaurante', 'Lavanderia', 'Café da manhã extra', 'Estacionamento', 'Taxa de early check-in', 'Taxa de late check-out', 'Outros'],

  categoriasReceita: ['Hospedagem', 'Consumo', 'Eventos', 'Serviços', 'Outras receitas'],
  categoriasDespesa: ['Alimentos', 'Lavanderia', 'Manutenção', 'Utilidades (água, luz, internet)', 'Pessoal',
                      'Comissões', 'Impostos e taxas', 'Material de limpeza', 'Enxoval', 'Marketing', 'Outras despesas'],

  motivosViagem: ['Trabalho', 'Turismo', 'Evento', 'Saúde', 'Estudos', 'Outro'],
  origensHospede: ['Indicação', 'Booking / OTA', 'Redes sociais', 'Empresa conveniada', 'Passante', 'Outro'],
  ufs: ['PI', 'MA', 'TO', 'CE', 'BA', 'PE', 'PA', 'GO', 'DF', 'SP', 'RJ', 'MG', 'AC', 'AL', 'AM', 'AP', 'ES',
        'MS', 'MT', 'PB', 'PR', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'Exterior'],

  /* Quantidade inicial de quartos (numeração e categoria ajustáveis em Configurações). */
  quartosIniciais: 20,

  cores: {
    escuro: '#231F20', escuro2: '#2E292A', ouro: '#C9A04F', ouroClaro: '#F1D08A', fundo: '#F7F4EE',
    borda: '#E8E1D4', texto: '#231F20', apoio: '#5E5750', verde: '#1F5E3F', vermelho: '#8E2F25'
  }
};

/* Nível de acesso válido? */
CONFIG.niveis = ['nenhum', 'ver', 'editar'];

/* Módulo pelo id da tela. */
CONFIG.moduloDaTela = function (tela) {
  const m = CONFIG.modulos.find(x => x.tela === tela);
  return m ? m.id : null;
};

window.CONFIG = CONFIG;
