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
  version: 6,
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
      name: 'usuarios',
      columns: [
        { name: 'nome',       type: 'string' },
        { name: 'senha',      type: 'string' },
        { name: 'ativo',      type: 'boolean' },
        { name: 'created_at', type: 'number' },
        { name: 'updated_at', type: 'number' },
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

  ],
});
