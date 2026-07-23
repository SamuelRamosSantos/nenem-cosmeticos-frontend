import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import database from '../database';
import { arredondar } from '../services/financeiroService';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const fmt = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
const fmtData = (ms) => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

const STATUS_FILTROS = [
  { key: 'pendente', label: 'Pendente' },
  { key: 'baixado',  label: 'Baixado' },
  { key: 'todos',    label: 'Todos' },
];

const STATUS_COR = {
  Aberto:  COLORS.warning,
  Parcial: COLORS.primary,
  Baixado: COLORS.success,
};

// =============================================================================
// Cliente — mesmo padrão de busca/seleção usado no PDV
// =============================================================================
const ClientesFiltroBase = ({ pessoas, onSelecionar }) => (
  <FlatList
    data={pessoas}
    keyExtractor={p => p.id}
    keyboardShouldPersistTaps="handled"
    style={styles.pickerList}
    nestedScrollEnabled
    renderItem={({ item }) => (
      <TouchableOpacity style={styles.pickerItem} onPress={() => onSelecionar(item)}>
        <Ionicons name="person-outline" size={16} color={COLORS.primary} />
        <Text style={styles.pickerItemText} numberOfLines={1}>{item.nome}</Text>
      </TouchableOpacity>
    )}
    ListEmptyComponent={<Text style={styles.pickerVazio}>Nenhum cliente encontrado</Text>}
  />
);
const enhanceClientesFiltro = withObservables(['searchCliente'], ({ searchCliente }) => ({
  pessoas: searchCliente?.trim().length > 0
    ? database.get('pessoas').query(Q.where('tipo', 'C'), Q.where('nome', Q.like(`%${searchCliente.trim()}%`)))
    : database.get('pessoas').query(Q.where('tipo', 'C')),
}));
const ClientesFiltro = enhanceClientesFiltro(ClientesFiltroBase);

// =============================================================================
// Tela Dashboard Financeiro (NC-76)
//
// Lista um card por TÍTULO PRINCIPAL (o pagamento inteiro, com o valor
// cheio somando todas as parcelas) — não uma linha por parcela. Ao tocar,
// abre os Detalhes do Título com a lista completa das parcelas.
// =============================================================================
export default function DashboardFinanceiroScreen() {
  const navigation = useNavigation();

  const [statusFiltro, setStatusFiltro] = useState('pendente');

  const [clienteSelecionado, setClienteSelecionado] = useState(null);
  const [searchCliente, setSearchCliente] = useState('');
  const [showClientesDropdown, setShowClientesDropdown] = useState(false);
  const [clienteMap, setClienteMap] = useState({});

  const [modoData,     setModoData]     = useState('vencimento'); // 'vencimento' | 'movimento'
  const [usarFiltroData, setUsarFiltroData] = useState(false);
  const [dataDe,   setDataDe]   = useState(() => { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d; });
  const [dataAte,  setDataAte]  = useState(() => { const d = new Date(); d.setHours(23,59,59,999); return d; });
  const [showPickerDe,  setShowPickerDe]  = useState(false);
  const [showPickerAte, setShowPickerAte] = useState(false);

  const [grupos, setGrupos] = useState([]);
  const [carregando, setCarregando] = useState(false);

  // Carrega nomes de todos os clientes uma vez, pra exibir na lista sem N+1 queries
  useEffect(() => {
    database.get('pessoas').query(Q.where('tipo', 'C')).fetch().then(lista => {
      const mapa = {};
      for (const p of lista) mapa[p.id] = p.nome;
      setClienteMap(mapa);
    });
  }, []);

  const carregarGrupos = useCallback(async () => {
    setCarregando(true);
    try {
      const condicoesPrincipais = [Q.where('parcela_numero', 1)];
      if (clienteSelecionado) condicoesPrincipais.push(Q.where('cliente_id', clienteSelecionado.id));
      if (usarFiltroData) {
        const campo = modoData === 'vencimento' ? 'data_vencimento' : 'created_at';
        condicoesPrincipais.push(Q.where(campo, Q.between(dataDe.getTime(), dataAte.getTime())));
      }

      const principais = await database.get('titulos').query(...condicoesPrincipais).fetch();
      if (principais.length === 0) { setGrupos([]); return; }

      // Agrupa por venda — hoje cada venda só gera um pagamento/grupo de
      // títulos (o PDV não tem venda com forma de pagamento dividida).
      const vendaIds = [...new Set(principais.map(t => t.vendaId))];
      const [todasParcelas, vendas] = await Promise.all([
        database.get('titulos').query(Q.where('venda_id', Q.oneOf(vendaIds))).fetch(),
        database.get('vendas').query(Q.where('id', Q.oneOf(vendaIds))).fetch(),
      ]);
      const vendaDataMap = new Map(vendas.map(v => [v.id, v.dataVenda]));

      const porVenda = new Map();
      for (const t of todasParcelas) {
        if (!porVenda.has(t.vendaId)) porVenda.set(t.vendaId, []);
        porVenda.get(t.vendaId).push(t);
      }

      const resultado = principais.map(principal => {
        const parcelas = porVenda.get(principal.vendaId) ?? [principal];
        const valorTotal = arredondar(parcelas.reduce((acc, t) => acc + t.valorLiquido, 0));
        const status = parcelas.every(t => t.status === 'Baixado')
          ? 'Baixado'
          : parcelas.every(t => t.status === 'Aberto') ? 'Aberto' : 'Parcial';

        return {
          principal, valorTotal, status, totalParcelas: parcelas.length,
          dataVenda: vendaDataMap.get(principal.vendaId),
        };
      });

      const filtrado = statusFiltro === 'todos' ? resultado
        : statusFiltro === 'baixado' ? resultado.filter(g => g.status === 'Baixado')
        : resultado.filter(g => g.status !== 'Baixado');

      filtrado.sort((a, b) => a.principal.dataVencimento - b.principal.dataVencimento);
      setGrupos(filtrado);
    } finally {
      setCarregando(false);
    }
  }, [clienteSelecionado, usarFiltroData, modoData, dataDe, dataAte, statusFiltro]);

  useFocusEffect(useCallback(() => { carregarGrupos(); }, [carregarGrupos]));

  const onDataDeChange = (event, selecionada) => {
    setShowPickerDe(false);
    if (selecionada && event.type !== 'dismissed') {
      const d = new Date(selecionada); d.setHours(0, 0, 0, 0);
      setDataDe(d);
    }
  };
  const onDataAteChange = (event, selecionada) => {
    setShowPickerAte(false);
    if (selecionada && event.type !== 'dismissed') {
      const d = new Date(selecionada); d.setHours(23, 59, 59, 999);
      setDataAte(d);
    }
  };

  const handleSelecionarGrupo = (grupo) => {
    navigation.navigate('DetalheTitulo', { tituloId: grupo.principal.id });
  };

  return (
    <View style={styles.container}>
      <View style={styles.filtrosCard}>
        {/* Cliente — mesmo padrão de busca/seleção do PDV (primeiro filtro) */}
        {clienteSelecionado ? (
          <View style={styles.clienteChip}>
            <Ionicons name="person" size={14} color={COLORS.primary} />
            <Text style={styles.clienteChipText} numberOfLines={1}>{clienteSelecionado.nome}</Text>
            <TouchableOpacity onPress={() => setClienteSelecionado(null)}>
              <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <View style={styles.searchBar}>
              <Ionicons name="search-outline" size={16} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Filtrar por cliente..."
                placeholderTextColor={COLORS.textLight}
                value={searchCliente}
                onChangeText={v => { setSearchCliente(v); setShowClientesDropdown(true); }}
                onFocus={() => setShowClientesDropdown(true)}
              />
              {searchCliente.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchCliente(''); setShowClientesDropdown(false); }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textLight} />
                </TouchableOpacity>
              )}
            </View>
            {showClientesDropdown && (
              <View style={styles.pickerContainer}>
                <ClientesFiltro
                  searchCliente={searchCliente}
                  onSelecionar={(p) => {
                    setClienteSelecionado(p);
                    setSearchCliente('');
                    setShowClientesDropdown(false);
                  }}
                />
                <TouchableOpacity style={styles.fecharPicker} onPress={() => setShowClientesDropdown(false)}>
                  <Text style={styles.fecharPickerText}>Fechar</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}

        {/* Status */}
        <View style={styles.chipsRow}>
          {STATUS_FILTROS.map(s => (
            <TouchableOpacity
              key={s.key}
              style={[styles.chip, statusFiltro === s.key && styles.chipAtivo]}
              onPress={() => setStatusFiltro(s.key)}
            >
              <Text style={[styles.chipText, statusFiltro === s.key && styles.chipTextAtivo]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Data */}
        <View style={styles.filtroLinha}>
          <Text style={styles.filtroLabel}>Filtrar por data</Text>
          <TouchableOpacity onPress={() => setUsarFiltroData(v => !v)}>
            <Ionicons
              name={usarFiltroData ? 'checkbox' : 'square-outline'}
              size={22}
              color={usarFiltroData ? COLORS.primary : COLORS.textLight}
            />
          </TouchableOpacity>
        </View>
        {usarFiltroData && (
          <>
            <View style={styles.chipsRow}>
              {[{ key: 'vencimento', label: 'Vencimento' }, { key: 'movimento', label: 'Movimento' }].map(m => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.chip, modoData === m.key && styles.chipAtivo]}
                  onPress={() => setModoData(m.key)}
                >
                  <Text style={[styles.chipText, modoData === m.key && styles.chipTextAtivo]}>{m.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={styles.periodoRow}>
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPickerDe(true)}>
                <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
                <Text style={styles.dateBtnText}>{fmtData(dataDe.getTime())}</Text>
              </TouchableOpacity>
              <Ionicons name="arrow-forward-outline" size={16} color={COLORS.textLight} />
              <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPickerAte(true)}>
                <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
                <Text style={styles.dateBtnText}>{fmtData(dataAte.getTime())}</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
        {showPickerDe && (
          <DateTimePicker value={dataDe} mode="date" display="default" onChange={onDataDeChange} />
        )}
        {showPickerAte && (
          <DateTimePicker value={dataAte} mode="date" display="default" onChange={onDataAteChange} />
        )}
      </View>

      {carregando ? (
        <ActivityIndicator size="large" color={COLORS.primary} style={{ marginTop: 40 }} />
      ) : grupos.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="receipt-outline" size={52} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>Nenhum título encontrado</Text>
          <Text style={styles.emptySub}>Ajuste os filtros acima</Text>
        </View>
      ) : (
        <FlatList
          data={grupos}
          keyExtractor={g => g.principal.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => {
            const clienteId = item.principal.clienteId;
            return (
              <TouchableOpacity
                style={[styles.card, SHADOW.sm]}
                onPress={() => handleSelecionarGrupo(item)}
                activeOpacity={0.75}
              >
                <View style={{ flex: 1 }}>
                  <View style={styles.cardTopo}>
                    <Text style={styles.cardCodigo}>
                      Venda em {item.dataVenda ? fmtData(item.dataVenda) : '—'}
                    </Text>
                    {item.totalParcelas > 1 && (
                      <Text style={styles.cardParcela}>{item.totalParcelas}x</Text>
                    )}
                  </View>
                  <Text style={styles.cardCliente} numberOfLines={1}>
                    {clienteId ? (clienteMap[clienteId] ?? 'Cliente removido') : 'Consumidor final'}
                  </Text>
                  <Text style={styles.cardVencimento}>Vence em {fmtData(item.principal.dataVencimento)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.cardValor}>{fmt(item.valorTotal)}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: `${STATUS_COR[item.status]}22` }]}>
                    <Text style={[styles.statusText, { color: STATUS_COR[item.status] }]}>{item.status}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  filtrosCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, margin: SPACING.md, marginBottom: SPACING.sm,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.background, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    marginBottom: SPACING.sm,
  },
  searchInput: { flex: 1, fontSize: FONT.md, color: COLORS.text, padding: 0 },
  chipsRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  chip: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  chipAtivo: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  chipText: { fontSize: FONT.xs, fontWeight: '600', color: COLORS.textSecondary },
  chipTextAtivo: { color: COLORS.primary, fontWeight: '700' },
  clienteChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary,
    padding: SPACING.sm, marginBottom: SPACING.sm,
  },
  clienteChipText: { flex: 1, fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },

  pickerContainer: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', maxHeight: 220,
    marginBottom: SPACING.sm,
  },
  pickerList: { maxHeight: 180 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.sm + 2,
    borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  pickerItemText: { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  pickerVazio: {
    padding: SPACING.md, textAlign: 'center',
    fontSize: FONT.sm, color: COLORS.textSecondary,
  },
  fecharPicker: {
    padding: SPACING.sm, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  fecharPickerText: { fontSize: FONT.xs, color: COLORS.textSecondary },

  filtroLinha: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  filtroLabel: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text },
  periodoRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.xs },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 3,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  dateBtnText: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },

  list: { padding: SPACING.md, paddingTop: 0, gap: SPACING.sm, paddingBottom: 40 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardTopo: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  cardCodigo: { fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary },
  cardParcela: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.primary,
    backgroundColor: COLORS.primaryLight, paddingHorizontal: 6, borderRadius: RADIUS.full,
  },
  cardCliente: { fontSize: FONT.md, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  cardVencimento: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  cardValor: { fontSize: FONT.md, fontWeight: '800', color: COLORS.text },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 3, borderRadius: RADIUS.full, marginTop: 4 },
  statusText: { fontSize: FONT.xs, fontWeight: '700' },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: SPACING.xl, gap: SPACING.sm, marginTop: 40 },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySub: { fontSize: FONT.sm, color: COLORS.textLight, textAlign: 'center' },
});
