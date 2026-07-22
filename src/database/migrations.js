import {
  schemaMigrations,
  addColumns,
  createTable,
  unsafeExecuteSql,
} from '@nozbe/watermelondb/Schema/migrations';

export default schemaMigrations({
  migrations: [
    // v1 → v2: converte enums para código curto
    {
      toVersion: 2,
      steps: [
        unsafeExecuteSql("UPDATE produtos SET tipo_baixa = 'I' WHERE tipo_baixa = 'individual';"),
        unsafeExecuteSql("UPDATE produtos SET tipo_baixa = 'M' WHERE tipo_baixa = 'mestre';"),
        unsafeExecuteSql("UPDATE pessoas SET tipo = 'C' WHERE tipo = 'cliente';"),
        unsafeExecuteSql("UPDATE pessoas SET tipo = 'F' WHERE tipo = 'fornecedor';"),
      ],
    },
    // v2 → v3: adiciona campo movimenta_estoque
    {
      toVersion: 3,
      steps: [
        addColumns({
          table: 'produtos',
          columns: [{ name: 'movimenta_estoque', type: 'boolean' }],
        }),
        unsafeExecuteSql('UPDATE produtos SET movimenta_estoque = 1 WHERE movimenta_estoque IS NULL OR movimenta_estoque = 0;'),
      ],
    },
    // v3 → v4: soft delete (ativo) em marcas e produtos; data_venda em vendas
    {
      toVersion: 4,
      steps: [
        addColumns({
          table: 'marcas',
          columns: [{ name: 'ativo', type: 'boolean' }],
        }),
        addColumns({
          table: 'produtos',
          columns: [{ name: 'ativo', type: 'boolean' }],
        }),
        addColumns({
          table: 'vendas',
          columns: [{ name: 'data_venda', type: 'number' }],
        }),
        // Ativa todos os registros existentes
        unsafeExecuteSql('UPDATE marcas   SET ativo = 1 WHERE ativo IS NULL OR ativo = 0;'),
        unsafeExecuteSql('UPDATE produtos SET ativo = 1 WHERE ativo IS NULL OR ativo = 0;'),
        // Retroativamente usa created_at como data_venda
        unsafeExecuteSql('UPDATE vendas SET data_venda = created_at WHERE data_venda IS NULL;'),
      ],
    },
    // v4 → v5: marca_id passa a ser opcional (isOptional: true)
    // Não exige alteração de SQL — apenas anotação no schema WatermelonDB
    {
      toVersion: 5,
      steps: [],
    },
    // v5 → v6: adiciona tabela usuarios para autenticação local
    {
      toVersion: 6,
      steps: [
        createTable({
          name: 'usuarios',
          columns: [
            { name: 'nome',       type: 'string' },
            { name: 'senha',      type: 'string' },
            { name: 'ativo',      type: 'boolean' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    // v6 → v7: tabelas locais de Balanço de Estoque (Contagem Cega)
    // Não sincronizadas — são rascunhos de inventário descartáveis
    {
      toVersion: 7,
      steps: [
        createTable({
          name: 'coletas',
          columns: [
            { name: 'nome',         type: 'string' },
            { name: 'data_criacao', type: 'number' },
          ],
        }),
        createTable({
          name: 'coleta_itens',
          columns: [
            { name: 'coleta_id',  type: 'string', isIndexed: true },
            { name: 'produto_id', type: 'string', isIndexed: true },
            { name: 'quantidade', type: 'number' },
          ],
        }),
      ],
    },
    // v7 → v8: remove a tabela usuarios do app — autenticação passa a ser
    // sempre em nuvem (JWT), sem fallback local. Senha nunca mais fica
    // armazenada no aparelho.
    {
      toVersion: 8,
      steps: [
        unsafeExecuteSql('DROP TABLE IF EXISTS usuarios;'),
      ],
    },
    // v8 → v9: Novo Motor de Formas de Pagamento (NC-70/71/72) — tipo
    // (V/C/P), campos de prazo, e tabela de taxas de cartão por parcela.
    {
      toVersion: 9,
      steps: [
        addColumns({
          table: 'formas_pagamento',
          columns: [
            { name: 'tipo', type: 'string' },
            { name: 'intervalo_dias', type: 'number', isOptional: true },
            { name: 'limite_parcelas', type: 'number', isOptional: true },
            { name: 'juros_percentual_padrao', type: 'number', isOptional: true },
          ],
        }),
        unsafeExecuteSql("UPDATE formas_pagamento SET tipo = 'V' WHERE tipo IS NULL;"),
        createTable({
          name: 'forma_pagamento_taxas',
          columns: [
            { name: 'forma_pagamento_id', type: 'string', isIndexed: true },
            { name: 'modalidade',         type: 'string' },
            { name: 'parcelas',           type: 'number' },
            { name: 'taxa_percentual',    type: 'number' },
            { name: 'created_at', type: 'number' },
            { name: 'updated_at', type: 'number' },
          ],
        }),
      ],
    },
    // v9 → v10: Geração de Títulos no PDV (NC-73/74/75) e motor de baixa
    // parcial (NC-78).
    {
      toVersion: 10,
      steps: [
        createTable({
          name: 'titulos',
          columns: [
            { name: 'venda_id',          type: 'string', isIndexed: true },
            { name: 'cliente_id',        type: 'string', isOptional: true, isIndexed: true },
            { name: 'parcela_numero',    type: 'number' },
            { name: 'parcelas_total',    type: 'number' },
            { name: 'valor_original',    type: 'number' },
            { name: 'valor_taxa_cartao', type: 'number' },
            { name: 'valor_liquido',     type: 'number' },
            { name: 'data_vencimento',   type: 'number' },
            { name: 'status',           type: 'string' },
            { name: 'created_at',        type: 'number' },
            { name: 'updated_at',        type: 'number' },
          ],
        }),
        createTable({
          name: 'titulos_baixas',
          columns: [
            { name: 'titulo_id',          type: 'string', isIndexed: true },
            { name: 'forma_pagamento_id', type: 'string', isIndexed: true },
            { name: 'valor_pago',         type: 'number' },
            { name: 'data_baixa',         type: 'number' },
            { name: 'created_at',         type: 'number' },
            { name: 'updated_at',         type: 'number' },
          ],
        }),
      ],
    },
  ],
});
