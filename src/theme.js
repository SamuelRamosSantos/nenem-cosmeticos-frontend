// =============================================================================
// Identidade Visual — Neném Cosméticos
//   Header / Nav:  Verde Oliva  #3c4531
//   Primária:      Verde Oliva  #3c4531  (botões, FABs — contraste branco alto)
//   Acento:        Dourado      #f3d57f  (ativo, destaques, badges)
//   Acento Alt:    Verde Claro  #c5df9b  (chips, sucesso suave)
//   Texto:         #333333
// =============================================================================

export const COLORS = {
  // ── Primária: Verde Oliva ──────────────────────────────────────────────────
  primary:      '#3c4531',   // botões, FABs, header
  primaryDark:  '#2a3122',   // sombras, pressState
  primaryLight: '#e8ede0',   // backgrounds sutis (chips, cards)

  // ── Acento: Dourado Suave ─────────────────────────────────────────────────
  accent:       '#f3d57f',   // tab ativo, selecionado, highlight
  accentLight:  '#fdf5dc',   // fundo de badge dourada

  // ── Acento Alt: Verde Claro ───────────────────────────────────────────────
  accentAlt:    '#c5df9b',   // chips de sucesso, confirmação
  accentAltLight: '#eef7e4',

  // ── Semânticas ────────────────────────────────────────────────────────────
  success:      '#4CAF50',
  successLight: '#E8F5E9',
  error:        '#D32F2F',
  errorLight:   '#FFEBEE',
  warning:      '#F57C00',
  warningLight: '#FFF3E0',

  // ── Neutros ───────────────────────────────────────────────────────────────
  background:    '#f9f7ee',  // off-white quente
  surface:       '#FFFFFF',
  border:        '#D8D3C8',
  divider:       '#EDE8DD',
  text:          '#333333',
  textSecondary: '#666655',
  textLight:     '#999980',
};

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const RADIUS = {
  sm:   6,
  md:   10,
  lg:   16,
  xl:   24,
  full: 999,
};

export const FONT = {
  xs:  11,
  sm:  13,
  md:  15,
  lg:  18,
  xl:  22,
  xxl: 28,
};

export const SHADOW = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.10,
    shadowRadius: 6,
    elevation: 4,
  },
  lg: {
    shadowColor: '#3c4531',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.20,
    shadowRadius: 10,
    elevation: 8,
  },
};
