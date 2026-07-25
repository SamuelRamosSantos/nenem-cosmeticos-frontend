import { Q } from '@nozbe/watermelondb';

export function arredondar(valor) {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

// Saldo ainda devido de um título, considerando baixas (pagamentos, descontos
// e juros/mora) já registradas contra ele.
export function calcularSaldoDevido(titulo, baixas) {
  const totalPago     = baixas.reduce((acc, b) => acc + b.valorPago, 0);
  const totalDesconto = baixas.reduce((acc, b) => acc + b.valorDesconto, 0);
  const totalJuros    = baixas.reduce((acc, b) => acc + b.valorJuros, 0);
  return arredondar(Math.max(0, titulo.valorLiquido + totalJuros - totalDesconto - totalPago));
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
    t.vendaId          = vendaId;
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
      b.valorDesconto     = 0;
      b.valorJuros        = 0;
      b.dataBaixa         = dataVenda;
    })
  );

  return ops;
}

// =============================================================================
// registrarBaixaEmLote (NC-77/78 — Caixa de Recebimento)
//
// Recebimento contra 1 ou mais títulos de UM MESMO cliente, de uma vez. Só
// aceita forma_pagamento de tipo 'V' ou 'C' — não dá pra "pagar uma dívida
// com outra dívida" (a prazo).
//
// Distribuição em "cascata" (waterfall), título mais antigo (vencimento)
// primeiro: cada título é completamente quitado (juros + desconto + pagamento)
// antes de sobrar valor pro próximo. Ex.: dois títulos de R$30 de saldo,
// pagamento de R$50 → primeiro título recebe R$30 (quita), segundo recebe
// R$20 (fica com R$10 em aberto). Se o valor pago exceder o saldo total dos
// títulos selecionados, a operação é rejeitada (evita "sobra" sem título pra
// receber).
// =============================================================================
export async function registrarBaixaEmLote(database, {
  tituloIds, formaPagamentoId, valorPago, valorDesconto = 0, valorJuros = 0,
  dataBaixa = new Date(), modalidadeCartao = 'D', parcelas = 1,
}) {
  if (!tituloIds?.length) throw new Error('Selecione ao menos um título.');
  if (!(valorPago > 0) && !(valorDesconto > 0)) {
    throw new Error('Informe um valor de pagamento ou desconto maior que zero.');
  }

  const titulos = await database.get('titulos').query(Q.where('id', Q.oneOf(tituloIds))).fetch();
  if (titulos.length !== tituloIds.length) {
    throw new Error('Algum título selecionado não foi encontrado.');
  }

  const clientesDistintos = new Set(titulos.map(t => t.clienteId));
  if (clientesDistintos.size > 1) {
    throw new Error('Todos os títulos selecionados devem ser do mesmo cliente.');
  }

  const formaPagamento = await database.get('formas_pagamento').find(formaPagamentoId);
  if (!['V', 'C'].includes(formaPagamento.tipo)) {
    throw new Error('Só é possível baixar títulos com forma de pagamento À Vista ou Cartão.');
  }

  // Cartão: taxa da adquirente (NC-71) — só informativa, não abate o saldo
  // devido do título (o cliente pagou o valor cheio; quem perde a taxa é a loja).
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

  // Quita na ordem do vencimento mais antigo primeiro.
  const itens = [];
  for (const titulo of titulos) {
    const baixasExistentes = await database
      .get('titulos_baixas')
      .query(Q.where('titulo_id', titulo.id))
      .fetch();
    itens.push({ titulo, baixasExistentes, saldo: calcularSaldoDevido(titulo, baixasExistentes) });
  }
  itens.sort((a, b) => a.titulo.dataVencimento - b.titulo.dataVencimento);

  if (itens.every(item => item.saldo <= 0)) {
    throw new Error('Os títulos selecionados já estão totalmente baixados.');
  }

  const ops = [];
  let restanteJuros    = valorJuros;
  let restanteDesconto = valorDesconto;
  let restantePago     = valorPago;

  for (const item of itens) {
    if (item.saldo <= 0) continue;

    // Juros/mora e desconto só se aplicam até o limite do que o título ainda
    // deve — o excedente (se houver) fica disponível pro próximo da fila.
    const jurosItem      = arredondar(Math.min(restanteJuros, item.saldo));
    const saldoComJuros   = arredondar(item.saldo + jurosItem);
    const descontoItem   = arredondar(Math.min(restanteDesconto, saldoComJuros));
    const saldoComAjustes = arredondar(saldoComJuros - descontoItem);
    const pagoItem        = arredondar(Math.min(restantePago, saldoComAjustes));

    restanteJuros    = arredondar(restanteJuros - jurosItem);
    restanteDesconto = arredondar(restanteDesconto - descontoItem);
    restantePago     = arredondar(restantePago - pagoItem);

    if (pagoItem <= 0 && descontoItem <= 0 && jurosItem <= 0) continue;

    const valorTaxaCartao = arredondar(pagoItem * (taxaPercentual / 100));

    ops.push(
      database.get('titulos_baixas').prepareCreate(b => {
        b.tituloId         = item.titulo.id;
        b.formaPagamentoId = formaPagamentoId;
        b.valorPago        = pagoItem;
        b.valorDesconto    = descontoItem;
        b.valorJuros       = jurosItem;
        b.valorTaxaCartao  = valorTaxaCartao;
        b.dataBaixa        = dataBaixa;
      })
    );

    const saldoDepois = arredondar(saldoComAjustes - pagoItem);
    const novoStatus = saldoDepois <= 0.004 ? 'Baixado' : 'Parcial';
    ops.push(item.titulo.prepareUpdate(t => { t.status = novoStatus; }));
  }

  if (restantePago > 0.004) {
    throw new Error('O valor pago é maior que o saldo total dos títulos selecionados. Ajuste o valor ou selecione mais títulos.');
  }

  await database.write(async () => {
    await database.batch(...ops);
  });
}

// Atalho pra baixar um único título (usa o motor de lote por baixo).
export async function registrarBaixa(database, {
  tituloId, formaPagamentoId, valorPago, valorDesconto, valorJuros, dataBaixa, modalidadeCartao, parcelas,
}) {
  return registrarBaixaEmLote(database, {
    tituloIds: [tituloId], formaPagamentoId, valorPago, valorDesconto, valorJuros, dataBaixa, modalidadeCartao, parcelas,
  });
}

// =============================================================================
// estornarBaixa
//
// Reverte um recebimento já registrado: remove a baixa (soft delete — mesmo
// protocolo de sync do NC-47, nunca destroyPermanently) e recalcula o status
// do título a partir das baixas que restarem. Sem baixas restantes, volta pra
// "Aberto"; com saldo ainda devido, "Parcial"; senão continua "Baixado".
//
// novaFormaPagamentoId (opcional): quando a baixa estornada era a única do
// título (ex.: título de venda à vista/cartão, baixado automaticamente na
// hora da venda), o título reaberto não tem vencimento nem juros de "a
// prazo" de verdade. Informando uma forma de pagamento tipo 'P' aqui, o
// título é reclassificado: novo vencimento (hoje + intervalo_dias da forma)
// e valor_liquido recalculado com o juros padrão dela — passa a se comportar
// como um título a prazo legítimo, pronto pra entrar no fluxo de baixa.
// =============================================================================
export async function estornarBaixa(database, baixaId, { novaFormaPagamentoId } = {}) {
  const baixa = await database.get('titulos_baixas').find(baixaId);
  const titulo = await database.get('titulos').find(baixa.tituloId);

  const outrasBaixas = (await database.get('titulos_baixas').query(Q.where('titulo_id', titulo.id)).fetch())
    .filter(b => b.id !== baixaId);

  const novoStatus = outrasBaixas.length === 0
    ? 'Aberto'
    : (calcularSaldoDevido(titulo, outrasBaixas) <= 0.004 ? 'Baixado' : 'Parcial');

  const ops = [baixa.prepareMarkAsDeleted()];

  if (novaFormaPagamentoId) {
    const novaForma = await database.get('formas_pagamento').find(novaFormaPagamentoId);
    if (novaForma.tipo !== 'P') {
      throw new Error('Só é possível reclassificar o título para uma forma de pagamento a prazo.');
    }
    const jurosPercentual = novaForma.jurosPercentualPadrao ?? 0;
    const intervaloDias   = novaForma.intervaloDias ?? 30;
    const novoVencimento  = new Date();
    novoVencimento.setDate(novoVencimento.getDate() + intervaloDias);

    ops.push(titulo.prepareUpdate(t => {
      t.status           = novoStatus;
      t.dataVencimento    = novoVencimento;
      t.valorLiquido      = arredondar(t.valorOriginal * (1 + jurosPercentual / 100));
      t.valorTaxaCartao   = 0;
      t.reclassificado    = true;
    }));
  } else {
    ops.push(titulo.prepareUpdate(t => { t.status = novoStatus; }));
  }

  await database.write(async () => {
    await database.batch(...ops);
  });
}
