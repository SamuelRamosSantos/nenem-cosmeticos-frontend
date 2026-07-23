import { appSchema, tableSchema } from '@nozbe/watermelondb';

// =============================================================================
// WatermelonDB Schema — Nenem Cosméticos
//
// Regras:
//   - id é gerenciado automaticamente pelo WatermelonDB (não declarado aqui)
//   - created_at / updated_at são number (Unix ms) — WatermelonDB os preenche
//     automaticamente e o mecanismo de sync os atualiza na sincronização
//   - deleted NÃO existe aqui: soft delete é tratado pelo protocolo de sync
//     (o servidor retorna IDs deletados no array "deleted" do pull)
//   - Decimais do Prisma (Decimal) → number
//   - Enums do Prisma → string
// =============================================================================

export default appSchema({
  version: 14,
  tables: [

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'pessoas',
      columns: [
        { name: 'nome',     type: 'string' },
        { name: 'telefone', type: 'string', isOptional: true },
        { name: 'tipo',     type: 'string' }, // 'C' (Cliente) | 'F' (Fornecedor)
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'marcas',
      columns: [
        { name: 'nome',                type: 'string' },
        { name: 'percentual_comissao', type: 'number' },
        { name: 'ativo',              type: 'boolean' }, // soft delete
        { name: 'created_at',         type: 'number' },
        { name: 'updated_at',         type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'formas_pagamento',
      columns: [
        { name: 'descricao',  type: 'string' },
        { name: 'tipo',       type: 'string' }, // 'V' à vista | 'C' cartão | 'P' a prazo
        // NC-72 — só usados quando tipo = 'P'
        { name: 'intervalo_dias',          type: 'number', isOptional: true },
        { name: 'limite_parcelas',         type: 'number', isOptional: true },
        { name: 'juros_percentual_padrao', type: 'number', isOptional: true },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // NC-71 — taxas de cartão (Débito/Crédito por parcela), só para
    // formas_pagamento com tipo = 'C'.
    tableSchema({
      name: 'forma_pagamento_taxas',
      columns: [
        { name: 'forma_pagamento_id', type: 'string', isIndexed: true },
        { name: 'modalidade',         type: 'string' }, // 'D' débito | 'C' crédito
        { name: 'parcelas',           type: 'number' },
        { name: 'taxa_percentual',    type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'produtos',
      columns: [
        { name: 'descricao',      type: 'string' },
        { name: 'marca_id',       type: 'string', isOptional: true, isIndexed: true },
        { name: 'preco_venda',    type: 'number' },
        { name: 'custo_preco',    type: 'number' },
        { name: 'cod_barras',     type: 'string', isOptional: true },
        { name: 'codigo_interno', type: 'string', isOptional: true },
        { name: 'tipo_baixa',       type: 'string' },  // 'I' (Individual) | 'M' (Master/Kit)
        { name: 'qtd_estoque',    type: 'number' },
        { name: 'movimenta_estoque', type: 'boolean' }, // default true
        { name: 'ativo',          type: 'boolean' }, // soft delete
        { name: 'created_at',     type: 'number' },
        { name: 'updated_at',     type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'produto_kit_itens',
      columns: [
        { name: 'produto_mestre_id',     type: 'string', isIndexed: true },
        { name: 'produto_individual_id', type: 'string', isIndexed: true },
        { name: 'quantidade_necessaria', type: 'number' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'estoque_movimentacoes',
      columns: [
        { name: 'produto_id',        type: 'string', isIndexed: true },
        { name: 'tipo_movimentacao', type: 'string' },
        { name: 'quantidade',        type: 'number' },
        { name: 'referencia_id',     type: 'string', isOptional: true },
        { name: 'pessoa_id',         type: 'string', isOptional: true, isIndexed: true },
        { name: 'data_movimentacao', type: 'number' },
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'vendas',
      columns: [
        { name: 'cliente_id',  type: 'string', isOptional: true, isIndexed: true },
        { name: 'status',      type: 'string' }, // 'aberta' | 'finalizada' | 'cancelada'
        { name: 'total',       type: 'number' },
        { name: 'data_venda',  type: 'number' }, // Unix ms — permite lançamento retroativo
        { name: 'created_at',  type: 'number' },
        { name: 'updated_at',  type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'vendas_itens',
      columns: [
        { name: 'venda_id',               type: 'string', isIndexed: true },
        { name: 'produto_id',             type: 'string', isIndexed: true },
        { name: 'quantidade',             type: 'number' },
        { name: 'preco_unitario',         type: 'number' },
        { name: 'custo_unitario_gravado', type: 'number' },
        { name: 'created_at',             type: 'number' },
        { name: 'updated_at',             type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'vendas_pagamentos',
      columns: [
        { name: 'venda_id',           type: 'string', isIndexed: true },
        { name: 'forma_pagamento_id', type: 'string', isIndexed: true },
        { name: 'valor',              type: 'number' },
        { name: 'created_at',         type: 'number' },
        { name: 'updated_at',         type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // NC-73/74/75 — Títulos (Contas a Receber), gerados na finalização da venda.
    tableSchema({
      name: 'titulos',
      columns: [
        { name: 'venda_id',          type: 'string', isIndexed: true },
        { name: 'cliente_id',        type: 'string', isOptional: true, isIndexed: true },
        { name: 'parcela_numero',    type: 'number' }, // ex.: 1 em "1/3"
        { name: 'parcelas_total',    type: 'number' }, // ex.: 3 em "1/3"
        { name: 'valor_original',    type: 'number' },
        { name: 'valor_taxa_cartao', type: 'number' },
        { name: 'valor_liquido',     type: 'number' },
        { name: 'data_vencimento',   type: 'number' },
        { name: 'status',           type: 'string' }, // 'Aberto' | 'Baixado' | 'Parcial'
        { name: 'reclassificado',   type: 'boolean' }, // true se a forma de pagamento foi alterada num estorno
        { name: 'created_at',        type: 'number' },
        { name: 'updated_at',        type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    // NC-78 — recebimentos contra um título (só forma tipo 'V' ou 'C').
    tableSchema({
      name: 'titulos_baixas',
      columns: [
        { name: 'titulo_id',          type: 'string', isIndexed: true },
        { name: 'forma_pagamento_id', type: 'string', isIndexed: true },
        { name: 'valor_pago',         type: 'number' },
        { name: 'valor_desconto',     type: 'number' }, // NC-77
        { name: 'valor_juros',        type: 'number' }, // NC-77 — juros/mora
        { name: 'valor_taxa_cartao',  type: 'number' }, // taxa da adquirente nessa baixa (cartão)
        { name: 'data_baixa',         type: 'number' },
        { name: 'created_at',         type: 'number' },
        { name: 'updated_at',         type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'compras',
      columns: [
        { name: 'fornecedor_id', type: 'string', isOptional: true, isIndexed: true },
        { name: 'status',        type: 'string' }, // 'aberta' | 'finalizada' | 'cancelada'
        { name: 'total',         type: 'number' },
        { name: 'created_at',    type: 'number' },
        { name: 'updated_at',    type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'compras_itens',
      columns: [
        { name: 'compra_id',     type: 'string', isIndexed: true },
        { name: 'produto_id',    type: 'string', isIndexed: true },
        { name: 'quantidade',    type: 'number' },
        { name: 'custo_unitario',type: 'number' },
        { name: 'created_at',    type: 'number' },
        { name: 'updated_at',    type: 'number' },
      ],
    }),

    // -------------------------------------------------------------------------
    tableSchema({
      name: 'compras_pagamentos',
      columns: [
        { name: 'compra_id',          type: 'string', isIndexed: true },
        { name: 'forma_pagamento_id', type: 'string', isIndexed: true },
        { name: 'valor',              type: 'number' },
        { name: 'created_at',         type: 'number' },
        { name: 'updated_at',         type: 'number' },
      ],
    }),


    // -------------------------------------------------------------------------
    // Tabelas locais de Balanço de Estoque (rascunho — não sincronizadas)
    // -------------------------------------------------------------------------
    tableSchema({
      name: 'coletas',
      columns: [
        { name: 'nome',         type: 'string' },           // ex: "Corredor A"
        { name: 'data_criacao', type: 'number' },           // Unix ms
      ],
    }),

    tableSchema({
      name: 'coleta_itens',
      columns: [
        { name: 'coleta_id',  type: 'string', isIndexed: true },
        { name: 'produto_id', type: 'string', isIndexed: true },
        { name: 'quantidade', type: 'number' },
      ],
    }),

  ],
});
