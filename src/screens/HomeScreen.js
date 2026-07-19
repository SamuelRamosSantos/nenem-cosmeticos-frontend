import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, BackHandler,
  TouchableOpacity, Alert, ActivityIndicator, Modal, ScrollView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import { sincronizarSeConectado } from '../services/syncService';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const fmtData = (ts) => {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const fmtValor = (n) =>
  `R$ ${Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// =============================================================================
// Hard-delete da venda com estorno de estoque
// =============================================================================
async function excluirVendaComEstorno(db, venda) {
  const [itens, pagamentos, movimentacoes] = await Promise.all([
    db.get('vendas_itens').query(Q.where('venda_id', venda.id)).fetch(),
    db.get('vendas_pagamentos').query(Q.where('venda_id', venda.id)).fetch(),
    db.get('estoque_movimentacoes').query(Q.where('referencia_id', venda.id)).fetch(),
  ]);

  const produtoIds = [...new Set(itens.map(i => i.produtoId))];
  const produtos = produtoIds.length > 0
    ? await db.get('produtos').query(Q.where('id', Q.oneOf(produtoIds))).fetch()
    : [];
  const produtoMap = new Map(produtos.map(p => [p.id, p]));

  const mestreIds = itens
    .filter(i => produtoMap.get(i.produtoId)?.tipoBaixa === 'M')
    .map(i => i.produtoId);

  const kitItensMap = new Map();
  if (mestreIds.length > 0) {
    const todos = await db
      .get('produto_kit_itens')
      .query(Q.where('produto_mestre_id', Q.oneOf(mestreIds)))
      .fetch();
    for (const ki of todos) {
      if (!kitItensMap.has(ki.produtoMestreId)) kitItensMap.set(ki.produtoMestreId, []);
      kitItensMap.get(ki.produtoMestreId).push(ki);
    }
    const individualIds = [
      ...new Set([...kitItensMap.values()].flat().map(ki => ki.produtoIndividualId)),
    ];
    if (individualIds.length > 0) {
      const individuais = await db
        .get('produtos')
        .query(Q.where('id', Q.oneOf(individualIds)))
        .fetch();
      for (const p of individuais) produtoMap.set(p.id, p);
    }
  }

  await db.write(async () => {
    const ops = [];

    for (const item of itens) {
      const produto = produtoMap.get(item.produtoId);
      if (!produto) continue;

      if (produto.tipoBaixa === 'M') {
        for (const ki of kitItensMap.get(item.produtoId) ?? []) {
          const pFilho = produtoMap.get(ki.produtoIndividualId);
          if (pFilho && pFilho.movimentaEstoque !== false) {
            ops.push(pFilho.prepareUpdate(p => {
              p.qtdEstoque += item.quantidade * ki.quantidadeNecessaria;
            }));
          }
        }
      } else if (produto.movimentaEstoque !== false) {
        ops.push(produto.prepareUpdate(p => { p.qtdEstoque += item.quantidade; }));
      }
    }

    // vendas_itens / vendas_pagamentos / vendas / estoque_movimentacoes são
    // tabelas sincronizadas — usa markAsDeleted (protocolo de sync), nunca
    // destroyPermanently (NC-47).
    for (const mov  of movimentacoes) ops.push(mov.prepareMarkAsDeleted());
    for (const item of itens)         ops.push(item.prepareMarkAsDeleted());
    for (const pg   of pagamentos)    ops.push(pg.prepareMarkAsDeleted());
    ops.push(venda.prepareMarkAsDeleted());

    await db.batch(...ops);
  });
}

// =============================================================================
// Modal de Detalhes da Venda
// onRequestClose já lida com o botão Voltar do Android nativamente no Modal
// =============================================================================
function DetalheVendaModal({ venda, clienteNome, onClose, db }) {
  const [detalhe, setDetalhe] = useState(null);
  const [loading, setLoading] = useState(true);

  React.useEffect(() => {
    if (!venda) return;
    const load = async () => {
      setLoading(true);
      try {
        const [itens, pagamentos] = await Promise.all([
          db.get('vendas_itens').query(Q.where('venda_id', venda.id)).fetch(),
          db.get('vendas_pagamentos').query(Q.where('venda_id', venda.id)).fetch(),
        ]);

        const produtoIds = [...new Set(itens.map(i => i.produtoId).filter(Boolean))];
        const produtos = produtoIds.length > 0
          ? await db.get('produtos').query(Q.where('id', Q.oneOf(produtoIds))).fetch()
          : [];
        const produtoMap = new Map(produtos.map(p => [p.id, p]));

        const formaIds = [...new Set(pagamentos.map(p => p.formaPagamentoId).filter(Boolean))];
        const formas   = formaIds.length > 0
          ? await db.get('formas_pagamento').query(Q.where('id', Q.oneOf(formaIds))).fetch()
          : [];
        const formaMap = new Map(formas.map(f => [f.id, f.descricao]));

        setDetalhe({
          itens: itens.map(i => ({
            descricao:     produtoMap.get(i.produtoId)?.descricao ?? 'Produto removido',
            quantidade:    i.quantidade,
            precoUnitario: i.precoUnitario,
            subtotal:      i.quantidade * i.precoUnitario,
          })),
          pagamentos: pagamentos.map(p => ({
            forma: formaMap.get(p.formaPagamentoId) ?? 'Outra',
            valor: p.valor,
          })),
        });
      } catch (e) {
        Alert.alert('Erro', e.message);
        onClose();
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [venda?.id]);

  return (
    <Modal
      visible={!!venda}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={mStyles.overlay}>
        <View style={[mStyles.sheet, SHADOW.lg]}>

          <View style={mStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={mStyles.titulo}>Detalhes da Venda</Text>
              <Text style={mStyles.data}>{venda ? fmtData(venda.dataVenda) : ''}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Ionicons name="close" size={24} color={COLORS.text} />
            </TouchableOpacity>
          </View>

          <View style={mStyles.clienteRow}>
            <Ionicons name="person-circle-outline" size={20} color={COLORS.primary} />
            <Text style={mStyles.clienteNome}>{clienteNome}</Text>
          </View>

          {loading ? (
            <View style={mStyles.loadingWrap}>
              <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false}>

              <Text style={mStyles.sectionLabel}>PRODUTOS</Text>
              <View style={[mStyles.card, SHADOW.sm]}>
                {detalhe?.itens.map((item, idx) => (
                  <View key={idx} style={[mStyles.itemRow, idx > 0 && mStyles.itemBorder]}>
                    <Text style={mStyles.itemNome} numberOfLines={2}>{item.descricao}</Text>
                    <View style={mStyles.itemRight}>
                      <Text style={mStyles.itemQtd}>{item.quantidade}×</Text>
                      <Text style={mStyles.itemPreco}>{fmtValor(item.precoUnitario)}</Text>
                    </View>
                    <Text style={mStyles.itemSub}>{fmtValor(item.subtotal)}</Text>
                  </View>
                ))}
              </View>

              <Text style={[mStyles.sectionLabel, { marginTop: SPACING.md }]}>PAGAMENTO</Text>
              <View style={[mStyles.card, SHADOW.sm]}>
                {detalhe?.pagamentos.map((pg, idx) => (
                  <View key={idx} style={[mStyles.pgRow, idx > 0 && mStyles.itemBorder]}>
                    <Ionicons name="card-outline" size={16} color={COLORS.primary} />
                    <Text style={mStyles.pgForma}>{pg.forma}</Text>
                    <Text style={mStyles.pgValor}>{fmtValor(pg.valor)}</Text>
                  </View>
                ))}
              </View>

              <View style={mStyles.totalRow}>
                <Text style={mStyles.totalLabel}>Total</Text>
                <Text style={mStyles.totalValor}>{fmtValor(venda?.total ?? 0)}</Text>
              </View>

            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// =============================================================================
// Tela Home — Gerenciador de Vendas
// =============================================================================
export default function HomeScreen() {
  const navigation = useNavigation();
  const db         = useDatabase();

  const hoje        = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  // Datas como objetos Date — fonte de verdade (sem string intermediária)
  const [dataInicial, setDataInicial] = useState(() => {
    const d = new Date(primeiroDia); d.setHours(0, 0, 0, 0); return d;
  });
  const [dataFinal, setDataFinal] = useState(() => {
    const d = new Date(hoje); d.setHours(23, 59, 59, 999); return d;
  });

  // Controle dos DateTimePickers
  const [showPickerInicial, setShowPickerInicial] = useState(false);
  const [showPickerFinal,   setShowPickerFinal]   = useState(false);

  const [vendas,       setVendas]       = useState([]);
  const [clienteMap,   setClienteMap]   = useState({});
  const [totalPeriodo, setTotalPeriodo] = useState(0);
  const [loading,      setLoading]      = useState(false);

  const [vendaSelecionada, setVendaSelecionada] = useState(null);

  // Aceita datas opcionais para uso imediato após picker (evita stale closure)
  const carregarVendas = useCallback(async (di, df) => {
    const inicio = di ?? dataInicial;
    const fim    = df ?? dataFinal;
    setLoading(true);
    try {
      const [vs, pessoas] = await Promise.all([
        db.get('vendas').query(
          Q.where('status', 'finalizada'),
          Q.where('data_venda', Q.between(inicio.getTime(), fim.getTime()))
        ).fetch(),
        db.get('pessoas').query().fetch(),
      ]);
      const map = {};
      for (const p of pessoas) map[p.id] = p.nome;
      setClienteMap(map);
      vs.sort((a, b) => b.dataVenda - a.dataVenda);
      setVendas(vs);
      setTotalPeriodo(vs.reduce((acc, v) => acc + v.total, 0));
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, [db, dataInicial, dataFinal]);

  useFocusEffect(useCallback(() => {
    carregarVendas();
  }, [carregarVendas]));

  // Sincronização automática ao abrir o app (NC-56) — roda uma vez, ao montar
  // a tela inicial, não a cada vez que a aba Home ganha foco.
  useEffect(() => {
    sincronizarSeConectado(db);
  }, [db]);

  // BackHandler: fecha o modal de detalhes ao pressionar Voltar no Android.
  // Retorna true para consumir o evento e impedir que o app feche.
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (vendaSelecionada) {
        setVendaSelecionada(null);
        return true;
      }
      return false;
    });
    return () => subscription.remove();
  }, [vendaSelecionada]);

  // ── Handlers do DateTimePicker ─────────────────────────────────────────────
  const onDataInicialChange = (event, selectedDate) => {
    setShowPickerInicial(false);
    if (selectedDate && event.type !== 'dismissed') {
      const d = new Date(selectedDate);
      d.setHours(0, 0, 0, 0);
      setDataInicial(d);
      carregarVendas(d, dataFinal); // passa datas frescas diretamente
    }
  };

  const onDataFinalChange = (event, selectedDate) => {
    setShowPickerFinal(false);
    if (selectedDate && event.type !== 'dismissed') {
      const d = new Date(selectedDate);
      d.setHours(23, 59, 59, 999);
      setDataFinal(d);
      carregarVendas(dataInicial, d);
    }
  };

  const handleExcluirVenda = (venda) => {
    Alert.alert(
      'Excluir Venda',
      'Deseja realmente excluir esta venda?\nO estoque será restaurado.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await excluirVendaComEstorno(db, venda);
              if (vendaSelecionada?.id === venda.id) setVendaSelecionada(null);
              carregarVendas();
            } catch (e) {
              Alert.alert('Erro ao excluir venda', e.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>

      <View style={styles.header}>
        <Ionicons name="receipt-outline" size={22} color={COLORS.primary} />
        <Text style={styles.titulo}>Histórico de Vendas</Text>
      </View>

      {/* Filtro de Período */}
      <View style={[styles.filtroCard, SHADOW.sm]}>
        <Text style={styles.filtroTitulo}>PERÍODO</Text>
        <View style={styles.filtroRow}>

          {/* Botão data inicial */}
          <View style={styles.dateWrap}>
            <Text style={styles.dateLabel}>De</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowPickerInicial(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
              <Text style={styles.dateBtnText}>{fmtData(dataInicial)}</Text>
            </TouchableOpacity>
          </View>

          <Ionicons name="arrow-forward-outline" size={16} color={COLORS.textLight} style={styles.arrowIcon} />

          {/* Botão data final */}
          <View style={styles.dateWrap}>
            <Text style={styles.dateLabel}>Até</Text>
            <TouchableOpacity
              style={styles.dateBtn}
              onPress={() => setShowPickerFinal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
              <Text style={styles.dateBtnText}>{fmtData(dataFinal)}</Text>
            </TouchableOpacity>
          </View>

          {/* Botão atualizar */}
          <TouchableOpacity style={styles.buscarBtn} onPress={() => carregarVendas()}>
            <Ionicons name="search" size={18} color="#fff" />
          </TouchableOpacity>
        </View>

        {vendas.length > 0 && (
          <View style={styles.resumoRow}>
            <Text style={styles.resumoLabel}>
              {vendas.length} venda{vendas.length !== 1 ? 's' : ''}
            </Text>
            <Text style={styles.resumoTotal}>{fmtValor(totalPeriodo)}</Text>
          </View>
        )}
      </View>

      {/* DateTimePickers nativos — renderizados fora do card para não empurrar layout */}
      {showPickerInicial && (
        <DateTimePicker
          value={dataInicial}
          mode="date"
          display="default"
          onChange={onDataInicialChange}
        />
      )}
      {showPickerFinal && (
        <DateTimePicker
          value={dataFinal}
          mode="date"
          display="default"
          onChange={onDataFinalChange}
        />
      )}

      {/* Lista de Vendas */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={vendas}
          keyExtractor={v => v.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="receipt-outline" size={56} color={COLORS.textLight} />
              <Text style={styles.emptyTitle}>Nenhuma venda no período</Text>
              <Text style={styles.emptySub}>Ajuste as datas do filtro acima</Text>
            </View>
          }
          renderItem={({ item }) => {
            const clienteNome = item.clienteId
              ? (clienteMap[item.clienteId] ?? 'Cliente removido')
              : 'Consumidor final';
            return (
              <TouchableOpacity
                style={[styles.card, SHADOW.sm]}
                onPress={() => setVendaSelecionada(item)}
                activeOpacity={0.75}
              >
                <View style={styles.cardIcon}>
                  <Ionicons name="receipt" size={20} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardCliente} numberOfLines={1}>{clienteNome}</Text>
                  <Text style={styles.cardData}>{fmtData(item.dataVenda)}</Text>
                </View>
                <Text style={styles.cardTotal}>{fmtValor(item.total)}</Text>
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => handleExcluirVenda(item)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                </TouchableOpacity>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Modal de Detalhes */}
      <DetalheVendaModal
        venda={vendaSelecionada}
        clienteNome={
          vendaSelecionada?.clienteId
            ? (clienteMap[vendaSelecionada.clienteId] ?? 'Cliente removido')
            : 'Consumidor final'
        }
        onClose={() => setVendaSelecionada(null)}
        db={db}
      />
    </View>
  );
}

// =============================================================================
// Estilos
// =============================================================================
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.md, paddingBottom: SPACING.sm,
  },
  titulo: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },

  filtroCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  filtroTitulo: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm,
  },
  filtroRow:  { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm },
  dateWrap:   { flex: 1 },
  dateLabel:  { fontSize: FONT.xs, color: COLORS.textSecondary, marginBottom: 4 },
  arrowIcon:  { marginBottom: 10 },

  // Botão compacto de calendário (mesmo padrão do PDV)
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 3,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  dateBtnText: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },

  buscarBtn: {
    width: 40, height: 40, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.md, alignItems: 'center', justifyContent: 'center',
    marginBottom: 1,
  },
  resumoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: SPACING.sm, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  resumoLabel: { fontSize: FONT.sm, color: COLORS.textSecondary },
  resumoTotal: { fontSize: FONT.lg, fontWeight: '800', color: COLORS.primary },

  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { paddingHorizontal: SPACING.md, gap: SPACING.sm, paddingBottom: 80 },

  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardCliente: { fontSize: FONT.md, fontWeight: '700', color: COLORS.text },
  cardData:    { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  cardTotal:   { fontSize: FONT.md, fontWeight: '800', color: COLORS.primary },
  deleteBtn: {
    width: 34, height: 34, borderRadius: RADIUS.sm,
    borderWidth: 1.5, borderColor: COLORS.errorLight,
    backgroundColor: COLORS.errorLight,
    alignItems: 'center', justifyContent: 'center',
  },
  empty:      { alignItems: 'center', paddingTop: 60, gap: SPACING.sm },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySub:   { fontSize: FONT.sm, color: COLORS.textLight, textAlign: 'center' },
});

const mStyles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, paddingBottom: SPACING.xl,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row', alignItems: 'flex-start',
    marginBottom: SPACING.sm,
  },
  titulo: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  data:   { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  clienteRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    padding: SPACING.sm, marginBottom: SPACING.md,
  },
  clienteNome: { fontSize: FONT.md, fontWeight: '700', color: COLORS.primary },
  loadingWrap: { alignItems: 'center', padding: SPACING.xl },
  sectionLabel: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
    marginBottom: SPACING.sm,
  },
  itemRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, gap: SPACING.sm,
  },
  itemBorder:  { borderTopWidth: 1, borderTopColor: COLORS.divider },
  itemNome:    { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  itemRight:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemQtd:     { fontSize: FONT.xs, color: COLORS.textSecondary },
  itemPreco:   { fontSize: FONT.xs, color: COLORS.textSecondary },
  itemSub:     { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary, minWidth: 80, textAlign: 'right' },
  pgRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
  },
  pgForma: { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  pgValor: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: SPACING.sm, marginTop: SPACING.xs,
    borderTopWidth: 2, borderTopColor: COLORS.primary,
  },
  totalLabel: { fontSize: FONT.md, fontWeight: '700', color: COLORS.textSecondary },
  totalValor: { fontSize: FONT.xl, fontWeight: '800', color: COLORS.primary },
});
