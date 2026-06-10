import { Q } from '@nozbe/watermelondb';

// =============================================================================
// finalizarVenda
//
// Fluxo atômico:
//   1. VendaHeader  — com dataVenda e clienteId
//   2. VendaItens   — custoUnitarioGravado vem do carrinho (preço×comissão da marca)
//   3. Movimentações de estoque — respeitando movimenta_estoque e tipo_baixa
//   4. VendaPagamentos
//
// IDs gerados automaticamente pelo WatermelonDB (sem crypto.randomUUID).
//
// @param {Database} database
// @param {Object}  params
//   clienteId    {string|null}
//   dataVenda    {Date}
//   itens        [{produtoId, quantidade, precoUnitario, custoUnitario}]
//   pagamentos   [{formaPagamentoId, valor}]
// =============================================================================
export async function finalizarVenda(database, {
  clienteId   = null,
  dataVenda   = new Date(),
  itens,
  pagamentos,
}) {

  if (!itens?.length)      throw new Error('A venda precisa ter pelo menos um item.');
  if (!pagamentos?.length) throw new Error('A venda precisa ter pelo menos uma forma de pagamento.');

  // ── PRÉ-CARREGAMENTO ────────────────────────────────────────────────────────
  const produtoIds = [...new Set(itens.map(i => i.produtoId))];
  const produtosVendidos = await database
    .get('produtos')
    .query(Q.where('id', Q.oneOf(produtoIds)))
    .fetch();

  const produtoMap = new Map(produtosVendidos.map(p => [p.id, p]));

  for (const item of itens) {
    if (!produtoMap.has(item.produtoId)) {
      throw new Error(`Produto "${item.produtoId}" não encontrado.`);
    }
  }

  // Carrega kit items para produtos mestres
  const mestreIds = itens
    .map(i => i.produtoId)
    .filter(id => produtoMap.get(id)?.tipoBaixa === 'M');

  const kitItensMap = new Map();

  if (mestreIds.length > 0) {
    const todosKitItens = await database
      .get('produto_kit_itens')
      .query(Q.where('produto_mestre_id', Q.oneOf(mestreIds)))
      .fetch();

    for (const ki of todosKitItens) {
      if (!kitItensMap.has(ki.produtoMestreId)) {
        kitItensMap.set(ki.produtoMestreId, []);
      }
      kitItensMap.get(ki.produtoMestreId).push(ki);
    }

    for (const mestreId of mestreIds) {
      if (!kitItensMap.get(mestreId)?.length) {
        throw new Error(
          `Produto mestre "${produtoMap.get(mestreId).descricao}" sem itens de kit.`
        );
      }
    }

    // Carrega produtos filhos dos kits
    const individualIds = [...new Set(
      [...kitItensMap.values()].flat().map(ki => ki.produtoIndividualId)
    )];
    const individuais = await database
      .get('produtos')
      .query(Q.where('id', Q.oneOf(individualIds)))
      .fetch();
    for (const p of individuais) produtoMap.set(p.id, p);
  }

  const total = itens.reduce((acc, i) => acc + i.quantidade * i.precoUnitario, 0);

  // ── TRANSAÇÃO ATÔMICA ───────────────────────────────────────────────────────
  return database.write(async () => {
    const ops = [];

    // 1. VendaHeader
    const vendaHeaderRecord = database.get('vendas').prepareCreate(v => {
      v.clienteId = clienteId;
      v.status    = 'finalizada';
      v.total     = total;
      v.dataVenda = dataVenda;
    });
    ops.push(vendaHeaderRecord);
    const vendaId = vendaHeaderRecord.id;

    // 2. VendaItens + movimentações de estoque
    for (const item of itens) {
      const produto = produtoMap.get(item.produtoId);

      // Custo: vem do carrinho (calculado pela comissão da marca no PDV)
      // Se não informado, cai para custoPreco armazenado no produto
      const custoGravado = item.custoUnitario ?? produto.custoPreco;

      ops.push(
        database.get('vendas_itens').prepareCreate(vi => {
          vi.vendaId              = vendaId;
          vi.produtoId            = item.produtoId;
          vi.quantidade           = item.quantidade;
          vi.precoUnitario        = item.precoUnitario;
          vi.custoUnitarioGravado = custoGravado;
        })
      );

      if (produto.tipoBaixa === 'M') {
        // Kit: baixa nos filhos
        const filhos = kitItensMap.get(item.produtoId);
        for (const kitItem of filhos) {
          const qtdBaixa         = item.quantidade * kitItem.quantidadeNecessaria;
          const produtoIndividual = produtoMap.get(kitItem.produtoIndividualId);

          if (produtoIndividual && produtoIndividual.movimentaEstoque !== false) {
            ops.push(
              database.get('estoque_movimentacoes').prepareCreate(mov => {
                mov.produtoId        = kitItem.produtoIndividualId;
                mov.tipoMovimentacao = 'saida_venda';
                mov.quantidade       = qtdBaixa;
                mov.referenciaId     = vendaId;
                mov.pessoaId         = clienteId;
                mov.dataMovimentacao = dataVenda;
              })
            );
            ops.push(
              produtoIndividual.prepareUpdate(p => {
                p.qtdEstoque = p.qtdEstoque - qtdBaixa;
              })
            );
          }
        }

      } else {
        // Individual: baixa direta
        if (produto.movimentaEstoque !== false) {
          ops.push(
            database.get('estoque_movimentacoes').prepareCreate(mov => {
              mov.produtoId        = item.produtoId;
              mov.tipoMovimentacao = 'saida_venda';
              mov.quantidade       = item.quantidade;
              mov.referenciaId     = vendaId;
              mov.pessoaId         = clienteId;
              mov.dataMovimentacao = dataVenda;
            })
          );
          ops.push(
            produto.prepareUpdate(p => {
              p.qtdEstoque = p.qtdEstoque - item.quantidade;
            })
          );
        }
      }
    }

    // 3. Pagamentos
    for (const pagamento of pagamentos) {
      ops.push(
        database.get('vendas_pagamentos').prepareCreate(pg => {
          pg.vendaId          = vendaId;
          pg.formaPagamentoId = pagamento.formaPagamentoId;
          pg.valor            = pagamento.valor;
        })
      );
    }

    await database.batch(...ops);
    return vendaHeaderRecord;
  });
}
