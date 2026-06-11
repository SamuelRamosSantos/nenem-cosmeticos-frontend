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
  ],
});
