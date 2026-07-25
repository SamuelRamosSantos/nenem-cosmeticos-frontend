import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, FlatList,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { calcularSaldoDevido, estornarBaixa, arredondar } from '../services/financeiroService';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const fmt = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
const fmtData = (ms) => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const STATUS_COR = {
  Aberto:  COLORS.warning,
  Parcial: COLORS.primary,
  Baixado: COLORS.success,
};

async function carregarDetalhe(db, tituloId) {
  const titulo = await db.get('titulos').find(tituloId);
  const venda = await db.get('vendas').find(titulo.vendaId);
  const cliente = titulo.clienteId
    ? await db.get('pessoas').find(titulo.clienteId).catch(() => null)
    : null;

  const [parcelas, itensVenda, pagamentosVenda] = await Promise.all([
    db.get('titulos').query(Q.where('venda_id', titulo.vendaId)).fetch(),
    db.get('vendas_itens').query(Q.where('venda_id', titulo.vendaId)).fetch(),
    db.get('vendas_pagamentos').query(Q.where('venda_id', titulo.vendaId)).fetch(),
  ]);

  const produtoIds = [...new Set(itensVenda.map(i => i.produtoId).filter(Boolean))];
  const produtos = produtoIds.length
    ? await db.get('produtos').query(Q.where('id', Q.oneOf(produtoIds))).fetch()
    : [];
  const produtoMap = new Map(produtos.map(p => [p.id, p.descricao]));

  parcelas.sort((a, b) => a.parcelaNumero - b.parcelaNumero);
  const parcelasComBaixas = [];
  for (const p of parcelas) {
    const baixas = await db.get('titulos_baixas').query(Q.where('titulo_id', p.id)).fetch();
    parcelasComBaixas.push({ titulo: p, baixas });
  }

  // Formas de pagamento: tanto as usadas na venda quanto as usadas em cada baixa.
  const formaIds = new Set(pagamentosVenda.map(p => p.formaPagamentoId).filter(Boolean));
  for (const { baixas } of parcelasComBaixas) {
    for (const b of baixas) formaIds.add(b.formaPagamentoId);
  }
  const formas = formaIds.size
    ? await db.get('formas_pagamento').query(Q.where('id', Q.oneOf([...formaIds]))).fetch()
    : [];
  const formaMap = new Map(formas.map(f => [f.id, f.descricao]));

  const parcelasFinal = parcelasComBaixas.map(({ titulo, baixas }) => {
    baixas.sort((a, b) => b.dataBaixa - a.dataBaixa);
    return {
      titulo,
      saldo: calcularSaldoDevido(titulo, baixas),
      totalRecebido: arredondar(baixas.reduce((acc, b) => acc + b.valorPago, 0)),
      baixas: baixas.map(b => ({
        id: b.id,
        valorPago: b.valorPago,
        valorDesconto: b.valorDesconto,
        valorJuros: b.valorJuros,
        valorTaxaCartao: b.valorTaxaCartao,
        dataBaixa: b.dataBaixa,
        forma: formaMap.get(b.formaPagamentoId) ?? 'Outra',
      })),
    };
  });

  return {
    venda,
    cliente,
    itens: itensVenda.map(i => ({
      descricao: produtoMap.get(i.produtoId) ?? 'Produto removido',
      quantidade: i.quantidade,
      precoUnitario: i.precoUnitario,
    })),
    pagamentos: pagamentosVenda.map(p => ({
      forma: formaMap.get(p.formaPagamentoId) ?? 'Outra',
      valor: p.valor,
    })),
    parcelas: parcelasFinal,
  };
}

export default function DetalheTituloScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const db = useDatabase();
  const { tituloId } = route.params;

  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selecionados, setSelecionados] = useState({});
  const [expandidos, setExpandidos] = useState({});

  const carregar = useCallback(async () => {
    setLoading(true);
    try {
      const d = await carregarDetalhe(db, tituloId);
      setDetalhe(d);
    } catch (e) {
      Alert.alert('Erro', e.message);
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [db, tituloId, navigation]);

  useFocusEffect(useCallback(() => { carregar(); }, [carregar]));

  const toggleSelecionado = (id) => {
    setSelecionados(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const toggleExpandido = (id) => {
    setExpandidos(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const idsSelecionados = Object.keys(selecionados).filter(id => selecionados[id]);
  const saldoSelecionado = (detalhe?.parcelas ?? []).reduce(
    (acc, p) => (idsSelecionados.includes(p.titulo.id) ? acc + p.saldo : acc),
    0
  );

  const handleIrParaBaixa = () => {
    navigation.navigate('CaixaRecebimento', {
      clienteId: detalhe.cliente.id,
      tituloIdsPreSelecionados: idsSelecionados,
    });
  };

  // Se essa era a ÚNICA baixa de um título de parcela única (venda à
  // vista/cartão, baixada automaticamente na hora da venda), o estorno é
  // OBRIGADO a reclassificar o título pra uma forma a prazo — só faz sentido
  // ter fluxo de baixa pra título a prazo de verdade.
  const [modalReclassificar, setModalReclassificar] = useState(null); // { baixaId } | null
  const [formasPrazo, setFormasPrazo] = useState([]);

  const executarEstorno = async (baixaId, novaFormaPagamentoId) => {
    try {
      await estornarBaixa(db, baixaId, { novaFormaPagamentoId });
      carregar();
    } catch (e) {
      Alert.alert('Erro ao estornar', e.message);
    }
  };

  const handleEstornarBaixa = (baixa, titulo, baixasDaParcela) => {
    Alert.alert(
      'Estornar Baixa',
      `Deseja reverter o recebimento de ${fmt(baixa.valorPago)} de ${fmtData(baixa.dataBaixa)}?\nO valor volta a compor o saldo em aberto do título.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Estornar',
          style: 'destructive',
          onPress: async () => {
            const precisaReclassificar = titulo.parcelasTotal === 1 && baixasDaParcela.length === 1;
            if (!precisaReclassificar) {
              executarEstorno(baixa.id);
              return;
            }
            const formas = await db.get('formas_pagamento').query(Q.where('tipo', 'P')).fetch();
            if (formas.length === 0) {
              Alert.alert(
                'Nenhuma forma a prazo cadastrada',
                'Este título era de uma venda à vista/cartão. Para estornar, é obrigatório reclassificá-lo para uma forma de pagamento a prazo — cadastre uma em Configurações > Formas de Pagamento antes de continuar.'
              );
              return;
            }
            setFormasPrazo(formas);
            setModalReclassificar({ baixaId: baixa.id });
          },
        },
      ],
    );
  };

  const handleConfirmarReclassificacao = (forma) => {
    const { baixaId } = modalReclassificar;
    setModalReclassificar(null);
    executarEstorno(baixaId, forma.id);
  };

  if (loading || !detalhe) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  const { venda, cliente, itens, pagamentos, parcelas } = detalhe;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={{ padding: SPACING.md, paddingBottom: SPACING.xl }}>

        <View style={[styles.clienteCard, SHADOW.sm]}>
          <Ionicons name="person-circle-outline" size={28} color={COLORS.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.clienteNome}>{cliente?.nome ?? 'Consumidor final'}</Text>
            <Text style={styles.vendaData}>Venda de {fmtData(venda.dataVenda)} · Total {fmt(venda.total)}</Text>
          </View>
        </View>

        <Text style={styles.sectionLabel}>PRODUTOS</Text>
        <View style={[styles.card, SHADOW.sm]}>
          {itens.map((item, idx) => (
            <View key={idx} style={[styles.itemRow, idx > 0 && styles.itemBorder]}>
              <Text style={styles.itemNome} numberOfLines={2}>{item.descricao}</Text>
              <Text style={styles.itemQtd}>{item.quantidade}×</Text>
              <Text style={styles.itemPreco}>{fmt(item.precoUnitario)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>FORMA DE PAGAMENTO DA VENDA</Text>
        <View style={[styles.card, SHADOW.sm]}>
          {pagamentos.map((pg, idx) => (
            <View key={idx} style={[styles.pgRow, idx > 0 && styles.itemBorder]}>
              <Ionicons name="card-outline" size={16} color={COLORS.primary} />
              <Text style={styles.pgForma}>{pg.forma}</Text>
              <Text style={styles.pgValor}>{fmt(pg.valor)}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionLabel}>
          PARCELAS ({parcelas.length > 1 ? `${parcelas.length}x` : 'única'})
        </Text>
        <View style={{ gap: SPACING.sm }}>
          {parcelas.map(({ titulo, saldo, totalRecebido, baixas }) => {
            const selecionavel = !!cliente && titulo.status !== 'Baixado';
            const marcado = !!selecionados[titulo.id];
            const expandido = !!expandidos[titulo.id];
            // Baixado: já foi tudo recebido, mostra o valor do título. Aberto/Parcial: mostra o que falta receber.
            const valorExibido = titulo.status === 'Baixado' ? titulo.valorLiquido : saldo;
            return (
              <View key={titulo.id} style={[styles.parcelaCard, SHADOW.sm, marcado && styles.parcelaCardSelecionada]}>
                <TouchableOpacity
                  style={styles.parcelaCardTopo}
                  onPress={() => selecionavel && toggleSelecionado(titulo.id)}
                  activeOpacity={selecionavel ? 0.75 : 1}
                >
                  {selecionavel && (
                    <Ionicons
                      name={marcado ? 'checkbox' : 'square-outline'}
                      size={22}
                      color={marcado ? COLORS.primary : COLORS.textLight}
                    />
                  )}
                  <View style={{ flex: 1, marginLeft: selecionavel ? SPACING.sm : 0 }}>
                    <Text style={styles.parcelaCodigo}>
                      Parcela {titulo.parcelaNumero}/{titulo.parcelasTotal}
                    </Text>
                    <Text style={styles.parcelaVencimento}>Vence em {fmtData(titulo.dataVencimento)}</Text>
                    {totalRecebido > 0 && (
                      <Text style={styles.parcelaRecebido}>Recebido: {fmt(totalRecebido)}</Text>
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.parcelaValor}>{fmt(valorExibido)}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COR[titulo.status]}22` }]}>
                      <Text style={[styles.statusText, { color: STATUS_COR[titulo.status] }]}>{titulo.status}</Text>
                    </View>
                  </View>
                </TouchableOpacity>

                {titulo.reclassificado && (
                  <View style={styles.avisoReclassificado}>
                    <Ionicons name="information-circle" size={16} color={COLORS.warning} />
                    <Text style={styles.avisoReclassificadoText}>
                      Este título era de uma venda à vista/cartão e foi reclassificado para pagamento a prazo.
                    </Text>
                  </View>
                )}

                {baixas.length > 0 && (
                  <>
                    <TouchableOpacity style={styles.verBaixasBtn} onPress={() => toggleExpandido(titulo.id)}>
                      <Text style={styles.verBaixasText}>
                        {expandido ? 'Ocultar' : 'Ver'} recebimentos ({baixas.length})
                      </Text>
                      <Ionicons name={expandido ? 'chevron-up' : 'chevron-down'} size={14} color={COLORS.primary} />
                    </TouchableOpacity>
                    {expandido && (
                      <View style={styles.baixasLista}>
                        {baixas.map(b => (
                          <View key={b.id} style={styles.baixaRow}>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.baixaValor}>{fmt(b.valorPago)} · {b.forma}</Text>
                              <Text style={styles.baixaData}>
                                {fmtData(b.dataBaixa)}
                                {b.valorDesconto > 0 ? ` · desconto ${fmt(b.valorDesconto)}` : ''}
                                {b.valorJuros > 0 ? ` · juros ${fmt(b.valorJuros)}` : ''}
                                {b.valorTaxaCartao > 0 ? ` · taxa cartão ${fmt(b.valorTaxaCartao)}` : ''}
                              </Text>
                            </View>
                            <TouchableOpacity
                              onPress={() => handleEstornarBaixa(b, titulo, baixas)}
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            >
                              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    )}
                  </>
                )}
              </View>
            );
          })}
        </View>
      </ScrollView>

      {idsSelecionados.length > 0 && (
        <View style={[styles.bottomBar, SHADOW.lg]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.bottomBarLabel}>
              {idsSelecionados.length} parcela{idsSelecionados.length !== 1 ? 's' : ''} selecionada{idsSelecionados.length !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.bottomBarValor}>{fmt(saldoSelecionado)}</Text>
          </View>
          <TouchableOpacity style={styles.bottomBarBtn} onPress={handleIrParaBaixa} activeOpacity={0.85}>
            <Ionicons name="cash-outline" size={18} color="#fff" />
            <Text style={styles.bottomBarBtnText}>Ir para Baixa</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Reclassificação obrigatória pra A Prazo, ao estornar baixa automática */}
      <Modal
        visible={!!modalReclassificar}
        animationType="slide"
        transparent
        onRequestClose={() => setModalReclassificar(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, SHADOW.lg]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Converter para A Prazo</Text>
              <TouchableOpacity onPress={() => setModalReclassificar(null)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalAviso}>
              Este título era de uma venda à vista/cartão, baixada automaticamente. Para estornar,
              selecione a forma de pagamento a prazo que ele passa a usar:
            </Text>
            <FlatList
              data={formasPrazo}
              keyExtractor={f => f.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.formaPrazoItem} onPress={() => handleConfirmarReclassificacao(item)}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.formaPrazoNome}>{item.descricao}</Text>
                  <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },

  clienteCard: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  clienteNome: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  vendaData: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },

  sectionLabel: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginBottom: SPACING.sm, marginTop: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    marginBottom: SPACING.md,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm,
  },
  itemBorder: { borderTopWidth: 1, borderTopColor: COLORS.divider },
  itemNome: { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  itemQtd: { fontSize: FONT.xs, color: COLORS.textSecondary },
  itemPreco: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary, minWidth: 70, textAlign: 'right' },
  pgRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  pgForma: { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  pgValor: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },

  parcelaCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: SPACING.sm + 2,
  },
  parcelaCardTopo: { flexDirection: 'row', alignItems: 'center' },
  parcelaCardSelecionada: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  parcelaCodigo: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text },
  parcelaVencimento: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  parcelaRecebido: { fontSize: FONT.xs, color: COLORS.success, fontWeight: '600', marginTop: 2 },
  parcelaValor: { fontSize: FONT.md, fontWeight: '800', color: COLORS.text },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full, marginTop: 4 },
  statusText: { fontSize: FONT.xs, fontWeight: '700' },

  avisoReclassificado: {
    flexDirection: 'row', alignItems: 'flex-start', gap: 6,
    backgroundColor: COLORS.warningLight, borderRadius: RADIUS.sm,
    padding: SPACING.sm, marginTop: SPACING.sm,
  },
  avisoReclassificadoText: { flex: 1, fontSize: FONT.xs, color: COLORS.warning, fontWeight: '600' },

  verBaixasBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
    paddingTop: SPACING.sm, marginTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  verBaixasText: { fontSize: FONT.xs, fontWeight: '700', color: COLORS.primary },
  baixasLista: { marginTop: SPACING.sm, gap: SPACING.sm },
  baixaRow: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background, borderRadius: RADIUS.sm,
    padding: SPACING.sm,
  },
  baixaValor: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text },
  baixaData: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },

  bottomBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: COLORS.surface, padding: SPACING.md,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  bottomBarLabel: { fontSize: FONT.sm, color: COLORS.textSecondary },
  bottomBarValor: { fontSize: FONT.lg, fontWeight: '800', color: COLORS.primary, marginTop: 2 },
  bottomBarBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
  },
  bottomBarBtnText: { color: '#fff', fontSize: FONT.sm, fontWeight: '700' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, maxHeight: '75%',
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.sm },
  modalTitulo: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  modalAviso: { fontSize: FONT.sm, color: COLORS.textSecondary, marginBottom: SPACING.md },
  formaPrazoItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  formaPrazoNome: { flex: 1, fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
});
