import { Q } from '@nozbe/watermelondb';

// Classificação de sinal por tipo de movimentação (enum documentado em
// database/schema.js, tabela estoque_movimentacoes).
const TIPOS_ENTRADA = new Set(['entrada_compra', 'ajuste_positivo', 'devolucao_cliente']);
const TIPOS_SAIDA   = new Set(['saida_venda', 'ajuste_negativo', 'devolucao_fornecedor']);

// =============================================================================
// calcularDivergencias
//
// Soma o histórico de estoque_movimentacoes de cada produto (entradas -
// saídas) e confronta com o valor estático produto.qtdEstoque. Retorna
// apenas os produtos cujo saldo real calculado diverge do saldo gravado.
//
// filtros:
//   dataInicial, dataFinal {Date}  — escopo: só entram na análise produtos
//     que tiveram ao menos uma movimentação nesse período. O saldo REAL de
//     cada produto incluído continua somando TODO o histórico dele — um
//     saldo contábil não pode ser calculado sobre uma janela parcial, senão
//     o resultado não reflete o estoque físico verdadeiro.
//   marcaId    {string} — filtra produtos por marca ("categoria" do ticket;
//     o schema não tem campo categoria próprio, marca é o equivalente real).
//   produtoId  {string} — um produto específico; omitido/null = todos.
// =============================================================================
export async function calcularDivergencias(database, filtros = {}) {
  const { dataInicial, dataFinal, marcaId, produtoId } = filtros;

  const condicoesProduto = [Q.where('ativo', true)];
  if (produtoId)      condicoesProduto.push(Q.where('id', produtoId));
  else if (marcaId)   condicoesProduto.push(Q.where('marca_id', marcaId));

  const produtos = await database.get('produtos').query(...condicoesProduto).fetch();
  if (produtos.length === 0) return [];

  let produtosAlvo = produtos;

  if (dataInicial || dataFinal) {
    const condicoesData = [Q.where('produto_id', Q.oneOf(produtos.map(p => p.id)))];
    if (dataInicial) condicoesData.push(Q.where('data_movimentacao', Q.gte(dataInicial.getTime())));
    if (dataFinal)   condicoesData.push(Q.where('data_movimentacao', Q.lte(dataFinal.getTime())));

    const movsNoPeriodo = await database
      .get('estoque_movimentacoes')
      .query(...condicoesData)
      .fetch();

    const idsComMovNoPeriodo = new Set(movsNoPeriodo.map(m => m.produtoId));
    produtosAlvo = produtos.filter(p => idsComMovNoPeriodo.has(p.id));
  }

  if (produtosAlvo.length === 0) return [];

  const todasMovs = await database
    .get('estoque_movimentacoes')
    .query(Q.where('produto_id', Q.oneOf(produtosAlvo.map(p => p.id))))
    .fetch();

  const saldoPorProduto = new Map();
  for (const mov of todasMovs) {
    const sinal = TIPOS_ENTRADA.has(mov.tipoMovimentacao) ? 1
                : TIPOS_SAIDA.has(mov.tipoMovimentacao)   ? -1
                : 0;
    saldoPorProduto.set(
      mov.produtoId,
      (saldoPorProduto.get(mov.produtoId) ?? 0) + sinal * mov.quantidade
    );
  }

  const divergencias = [];
  for (const produto of produtosAlvo) {
    const saldoReal = saldoPorProduto.get(produto.id) ?? 0;
    if (saldoReal !== produto.qtdEstoque) {
      divergencias.push({
        produto,
        saldoAtual: produto.qtdEstoque,
        saldoReal,
        diferenca: saldoReal - produto.qtdEstoque,
      });
    }
  }
  return divergencias;
}

// =============================================================================
// aplicarCorrecoes
//
// Efetiva as correções calculadas: para cada divergência, grava uma
// movimentação de ajuste (positivo/negativo) e atualiza qtd_estoque na
// mesma transação — nenhuma alteração de saldo sem gerar histórico (NC-58).
// =============================================================================
export async function aplicarCorrecoes(database, divergencias) {
  if (!divergencias?.length) return;

  await database.write(async () => {
    const ops = [];
    for (const { produto, saldoReal, diferenca } of divergencias) {
      ops.push(
        database.get('estoque_movimentacoes').prepareCreate(m => {
          m.produtoId        = produto.id;
          m.tipoMovimentacao = diferenca > 0 ? 'ajuste_positivo' : 'ajuste_negativo';
          m.quantidade       = Math.abs(diferenca);
          m.dataMovimentacao = new Date();
        })
      );
      ops.push(produto.prepareUpdate(p => { p.qtdEstoque = saldoReal; }));
    }
    await database.batch(...ops);
  });
}
