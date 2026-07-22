import { Q } from '@nozbe/watermelondb';

function arredondar(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

// =============================================================================
// prepararOpsTitulosDaVenda
//
// Monta as operações (prepareCreate) de titulos/titulos_baixas geradas por UM
// pagamento da venda. Retorna um array de ops pra entrar no MESMO
// database.batch() de finalizarVenda — nunca escreve sozinho.
//
// Regras:
//   - tipo 'V' (à vista) ou 'C' (cartão): 1 único título, já nasce "Baixado"
//     com uma baixa automática na data da venda. Cartão: valor_liquido
//     desconta a taxa da adquirente (NC-71) pela modalidade/parcelas usadas.
//   - tipo 'P' (a prazo): exige clienteId. Gera N títulos (1 por parcela),
//     todos "Aberto". Juros aplicado uma vez sobre o total e dividido
//     igualmente entre as parcelas (valor_liquido = valor_original com juros
//     — aqui valor_liquido representa "o que a loja realmente vai receber",
//     seja descontando taxa de cartão ou somando juros).
// =============================================================================
export async function prepararOpsTitulosDaVenda(database, {
  vendaId, clienteId, dataVenda, formaPagamento, valorPago,
  modalidadeCartao = 'D', parcelas = 1,
}) {
  const ops = [];

  if (formaPagamento.tipo === 'P') {
    if (!clienteId) {
      throw new Error(`Venda a prazo (${formaPagamento.descricao}) exige um cliente vinculado.`);
    }

    const n = Math.max(1, parcelas || 1);
    const jurosPercentual = formaPagamento.jurosPercentualPadrao ?? 0;
    const intervaloDias   = formaPagamento.intervaloDias ?? 30;

    const valorBaseParcela = arredondar(valorPago / n);
    let somaParcelasAnteriores = 0;

    for (let i = 1; i <= n; i++) {
      // Última parcela absorve o resíduo de arredondamento, pra soma bater
      // exatamente com valorPago.
      const valorOriginal = i === n
        ? arredondar(valorPago - somaParcelasAnteriores)
        : valorBaseParcela;
      somaParcelasAnteriores += valorOriginal;

      const valorLiquido = arredondar(valorOriginal * (1 + jurosPercentual / 100));

      const vencimento = new Date(dataVenda);
      vencimento.setDate(vencimento.getDate() + intervaloDias * i);

      ops.push(
        database.get('titulos').prepareCreate(t => {
          t.vendaId          = vendaId;
          t.clienteId        = clienteId;
          t.parcelaNumero    = i;
          t.parcelasTotal    = n;
          t.valorOriginal    = valorOriginal;
          t.valorTaxaCartao  = 0;
          t.valorLiquido     = valorLiquido;
          t.dataVencimento   = vencimento;
          t.status           = 'Aberto';
        })
      );
    }

    return ops;
  }

  // tipo 'V' ou 'C' — título único, já baixado na data da venda.
  let taxaPercentual = 0;
  if (formaPagamento.tipo === 'C') {
    const taxas = await database
      .get('forma_pagamento_taxas')
      .query(
        Q.where('forma_pagamento_id', formaPagamento.id),
        Q.where('modalidade', modalidadeCartao),
        Q.where('parcelas', parcelas)
      )
      .fetch();
    taxaPercentual = taxas[0]?.taxaPercentual ?? 0;
  }

  const valorTaxaCartao = arredondar(valorPago * (taxaPercentual / 100));
  const valorLiquido    = arredondar(valorPago - valorTaxaCartao);

  const tituloRecord = database.get('titulos').prepareCreate(t => {
    t.vendaId         = vendaId;
    t.clienteId        = clienteId;
    t.parcelaNumero    = 1;
    t.parcelasTotal    = 1;
    t.valorOriginal    = valorPago;
    t.valorTaxaCartao  = valorTaxaCartao;
    t.valorLiquido     = valorLiquido;
    t.dataVencimento   = dataVenda;
    t.status           = 'Baixado';
  });
  ops.push(tituloRecord);

  ops.push(
    database.get('titulos_baixas').prepareCreate(b => {
      b.tituloId          = tituloRecord.id;
      b.formaPagamentoId  = formaPagamento.id;
      b.valorPago         = valorLiquido;
      b.dataBaixa         = dataVenda;
    })
  );

  return ops;
}

// =============================================================================
// registrarBaixa (NC-78 — motor de baixa parcial)
//
// Recebimento contra um título já existente. Só aceita forma_pagamento de
// tipo 'V' ou 'C' — não dá pra "pagar uma dívida com outra dívida" (a prazo).
// Se o total pago (somando baixas anteriores) ficar abaixo do valor_liquido,
// o título vira "Parcial"; se cobrir tudo, vira "Baixado".
// =============================================================================
export async function registrarBaixa(database, { tituloId, formaPagamentoId, valorPago, dataBaixa = new Date() }) {
  if (!(valorPago > 0)) {
    throw new Error('Informe um valor de pagamento maior que zero.');
  }

  const titulo         = await database.get('titulos').find(tituloId);
  const formaPagamento = await database.get('formas_pagamento').find(formaPagamentoId);

  if (!['V', 'C'].includes(formaPagamento.tipo)) {
    throw new Error('Só é possível baixar títulos com forma de pagamento À Vista ou Cartão.');
  }

  const baixasExistentes = await database
    .get('titulos_baixas')
    .query(Q.where('titulo_id', tituloId))
    .fetch();
  const totalJaPago  = baixasExistentes.reduce((acc, b) => acc + b.valorPago, 0);
  const novoTotal    = arredondar(totalJaPago + valorPago);
  const novoStatus   = novoTotal >= titulo.valorLiquido ? 'Baixado' : 'Parcial';

  await database.write(async () => {
    await database.batch(
      database.get('titulos_baixas').prepareCreate(b => {
        b.tituloId         = tituloId;
        b.formaPagamentoId = formaPagamentoId;
        b.valorPago        = valorPago;
        b.dataBaixa        = dataBaixa;
      }),
      titulo.prepareUpdate(t => { t.status = novoStatus; })
    );
  });
}
