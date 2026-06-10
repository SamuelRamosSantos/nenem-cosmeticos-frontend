import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, TextInput, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

// ── Helpers ──────────────────────────────────────────────────────────────────
const inicioMesAtual = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
};
const fimMesAtual = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
};

const parseDDMMYYYY = (str) => {
  const nums = str.replace(/\D/g, '');
  if (nums.length !== 8) return null;
  const day   = parseInt(nums.slice(0, 2), 10);
  const month = parseInt(nums.slice(2, 4), 10) - 1;
  const year  = parseInt(nums.slice(4, 8), 10);
  const d = new Date(year, month, day);
  return (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) ? d : null;
};

const fmtDate = (date) => {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Formata sempre com exatamente 2 casas decimais
const fmt = (n) =>
  `R$ ${Number(n || 0).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const aplicarMascaraData = (text) => {
  const nums = text.replace(/\D/g, '').slice(0, 8);
  if (nums.length <= 2) return nums;
  if (nums.length <= 4) return `${nums.slice(0, 2)}/${nums.slice(2)}`;
  return `${nums.slice(0, 2)}/${nums.slice(2, 4)}/${nums.slice(4)}`;
};

// =============================================================================
// DashboardBase — recebe vendas reativas e computa KPIs + Vendas por Marca
// =============================================================================
const DashboardBase = ({ vendas }) => {
  const db = useDatabase();
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!vendas) return;

    const computar = async () => {
      setLoading(true);
      try {
        const vendaIds = vendas.map(v => v.id);

        if (vendaIds.length === 0) {
          setStats({ totalVendas: 0, totalCusto: 0, lucro: 0, qtdVendas: 0, porForma: [], porMarca: [] });
          return;
        }

        const [itens, pagamentos] = await Promise.all([
          db.get('vendas_itens').query(Q.where('venda_id', Q.oneOf(vendaIds))).fetch(),
          db.get('vendas_pagamentos').query(Q.where('venda_id', Q.oneOf(vendaIds))).fetch(),
        ]);

        const totalVendas = vendas.reduce((acc, v) => acc + (v.total || 0), 0);
        const totalCusto  = itens.reduce(
          (acc, i) => acc + ((i.custoUnitarioGravado || 0) * (i.quantidade || 1)), 0
        );
        const lucro = totalVendas - totalCusto;

        // ── Vendas por Forma de Pagamento ──────────────────────────────────
        const formaIds = [...new Set(pagamentos.map(p => p.formaPagamentoId).filter(Boolean))];
        const formas   = formaIds.length > 0
          ? await db.get('formas_pagamento').query(Q.where('id', Q.oneOf(formaIds))).fetch()
          : [];

        const formaMap  = new Map(formas.map(f => [f.id, f.descricao]));
        const gruposMap = new Map();
        for (const pg of pagamentos) {
          const nome = formaMap.get(pg.formaPagamentoId) || 'Outra';
          gruposMap.set(nome, (gruposMap.get(nome) || 0) + pg.valor);
        }
        const porForma = [...gruposMap.entries()]
          .map(([nome, valor]) => ({ nome, valor }))
          .sort((a, b) => b.valor - a.valor);

        // ── Vendas por Marca ───────────────────────────────────────────────
        const produtoIds = [...new Set(itens.map(i => i.produtoId).filter(Boolean))];
        const produtos = produtoIds.length > 0
          ? await db.get('produtos').query(Q.where('id', Q.oneOf(produtoIds))).fetch()
          : [];
        const produtoMap = new Map(produtos.map(p => [p.id, p]));

        const marcaIds = [...new Set(produtos.map(p => p.marcaId).filter(Boolean))];
        const marcas   = marcaIds.length > 0
          ? await db.get('marcas').query(Q.where('id', Q.oneOf(marcaIds))).fetch()
          : [];
        const marcaMap = new Map(marcas.map(m => [m.id, m.nome]));

        const porMarcaMap = new Map();
        for (const item of itens) {
          const produto = produtoMap.get(item.produtoId);
          const marcaNome = produto?.marcaId
            ? (marcaMap.get(produto.marcaId) ?? 'Sem Marca')
            : 'Sem Marca';
          const valor = (item.precoUnitario || 0) * (item.quantidade || 1);
          porMarcaMap.set(marcaNome, (porMarcaMap.get(marcaNome) || 0) + valor);
        }
        const porMarca = [...porMarcaMap.entries()]
          .map(([nome, valor]) => ({ nome, valor }))
          .sort((a, b) => b.valor - a.valor);

        setStats({ totalVendas, totalCusto, lucro, qtdVendas: vendas.length, porForma, porMarca });
      } finally {
        setLoading(false);
      }
    };

    computar();
  }, [vendas, db]);

  if (loading || !stats) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Calculando...</Text>
      </View>
    );
  }

  const margemPct = stats.totalVendas > 0
    ? ((stats.lucro / stats.totalVendas) * 100).toFixed(1)
    : '0.0';

  return (
    <View>
      {/* KPI — Total de Vendas */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, SHADOW.sm, { borderLeftColor: COLORS.primary }]}>
          <Text style={styles.kpiLabel}>Total de Vendas</Text>
          <Text style={[styles.kpiValue, { color: COLORS.primary }]}>{fmt(stats.totalVendas)}</Text>
          <Text style={styles.kpiSub}>{stats.qtdVendas} venda{stats.qtdVendas !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      {/* KPI — Custo */}
      <View style={styles.kpiRow}>
        <View style={[styles.kpiCard, SHADOW.sm, { borderLeftColor: COLORS.error }]}>
          <Text style={styles.kpiLabel}>Custo (Pagar Sueli Variedades)</Text>
          <Text style={[styles.kpiValue, { color: COLORS.error }]}>{fmt(stats.totalCusto)}</Text>
          <Text style={styles.kpiSub}>Soma dos custos dos itens vendidos</Text>
        </View>
      </View>

      {/* KPI — Lucro */}
      <View style={styles.kpiRow}>
        <View style={[
          styles.kpiCard, SHADOW.sm,
          { borderLeftColor: stats.lucro >= 0 ? COLORS.success : COLORS.error },
        ]}>
          <Text style={styles.kpiLabel}>Lucro Bruto</Text>
          <Text style={[
            styles.kpiValue,
            { color: stats.lucro >= 0 ? COLORS.success : COLORS.error },
          ]}>
            {fmt(stats.lucro)}
          </Text>
          <Text style={styles.kpiSub}>Margem: {margemPct}%</Text>
        </View>
      </View>

      {/* ── Vendas por Marca ── */}
      <Text style={styles.sectionTitle}>Vendas por Marca</Text>
      {stats.porMarca.length === 0 ? (
        <View style={[styles.emptyCard, SHADOW.sm]}>
          <Ionicons name="pricetag-outline" size={32} color={COLORS.textLight} />
          <Text style={styles.emptyText}>Nenhuma venda com marca no período</Text>
        </View>
      ) : (
        <View style={[styles.tableCard, SHADOW.sm]}>
          {stats.porMarca.map((row, idx) => {
            const pct = stats.totalVendas > 0 ? (row.valor / stats.totalVendas) * 100 : 0;
            return (
              <View key={row.nome} style={[styles.tableRow, idx > 0 && styles.tableRowBorder]}>
                <Ionicons name="pricetag-outline" size={16} color={COLORS.accent} />
                <Text style={styles.tableForma} numberOfLines={1}>{row.nome}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${Math.min(100, pct)}%`, backgroundColor: COLORS.accent }]} />
                  </View>
                  <Text style={styles.barPct}>{pct.toFixed(1)}%</Text>
                </View>
                <Text style={styles.tableValor}>{fmt(row.valor)}</Text>
              </View>
            );
          })}
        </View>
      )}

      {/* ── Vendas por Forma de Pagamento ── */}
      <Text style={[styles.sectionTitle, { marginTop: SPACING.md }]}>Vendas por Forma de Pagamento</Text>
      {stats.porForma.length === 0 ? (
        <View style={[styles.emptyCard, SHADOW.sm]}>
          <Ionicons name="card-outline" size={32} color={COLORS.textLight} />
          <Text style={styles.emptyText}>Nenhum pagamento no período</Text>
        </View>
      ) : (
        <View style={[styles.tableCard, SHADOW.sm]}>
          {stats.porForma.map((row, idx) => {
            const pct = stats.totalVendas > 0 ? (row.valor / stats.totalVendas) * 100 : 0;
            return (
              <View key={row.nome} style={[styles.tableRow, idx > 0 && styles.tableRowBorder]}>
                <Ionicons name="card-outline" size={16} color={COLORS.primary} />
                <Text style={styles.tableForma} numberOfLines={1}>{row.nome}</Text>
                <View style={{ flex: 1 }}>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${Math.min(100, pct)}%` }]} />
                  </View>
                  <Text style={styles.barPct}>{pct.toFixed(1)}%</Text>
                </View>
                <Text style={styles.tableValor}>{fmt(row.valor)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
};

// withObservables observa vendas finalizadas no período — reativo a novas vendas
const enhanceDashboard = withObservables(['inicio', 'fim'], ({ inicio, fim }) => ({
  vendas: database.get('vendas').query(
    Q.where('status', 'finalizada'),
    Q.where('data_venda', Q.between(inicio, fim))
  ),
}));
const DashboardReativo = enhanceDashboard(DashboardBase);

// =============================================================================
// Tela Dashboard
// =============================================================================
export default function DashboardScreen() {
  const [dataInicio, setDataInicio] = useState(inicioMesAtual());
  const [dataFim,    setDataFim]    = useState(fimMesAtual());
  const [strInicio,  setStrInicio]  = useState(() => fmtDate(inicioMesAtual()));
  const [strFim,     setStrFim]     = useState(() => fmtDate(fimMesAtual()));

  const aplicar = () => {
    const di = parseDDMMYYYY(strInicio);
    const df = parseDDMMYYYY(strFim);
    if (!di || !df || di > df) return;
    di.setHours(0, 0, 0, 0);
    df.setHours(23, 59, 59, 999);
    setDataInicio(di);
    setDataFim(df);
  };

  const mesAtual = () => {
    const di = inicioMesAtual();
    const df = fimMesAtual();
    setStrInicio(fmtDate(di)); setStrFim(fmtDate(df));
    setDataInicio(di); setDataFim(df);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Filtro de período */}
      <View style={[styles.filterCard, SHADOW.sm]}>
        <View style={styles.filterHeader}>
          <Ionicons name="calendar-outline" size={18} color={COLORS.primary} />
          <Text style={styles.filterTitle}>Período</Text>
          <TouchableOpacity onPress={mesAtual} style={styles.mesAtualBtn}>
            <Text style={styles.mesAtualText}>Mês atual</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.filterRow}>
          <View style={styles.filterInputWrap}>
            <Text style={styles.filterLabel}>De</Text>
            <TextInput
              style={styles.filterInput}
              value={strInicio}
              onChangeText={v => setStrInicio(aplicarMascaraData(v))}
              onBlur={aplicar}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={COLORS.textLight}
              keyboardType="number-pad"
            />
          </View>
          <Ionicons name="arrow-forward" size={16} color={COLORS.textLight} style={{ marginTop: 20 }} />
          <View style={styles.filterInputWrap}>
            <Text style={styles.filterLabel}>Até</Text>
            <TextInput
              style={styles.filterInput}
              value={strFim}
              onChangeText={v => setStrFim(aplicarMascaraData(v))}
              onBlur={aplicar}
              placeholder="DD/MM/AAAA"
              placeholderTextColor={COLORS.textLight}
              keyboardType="number-pad"
            />
          </View>
          <TouchableOpacity style={styles.aplicarBtn} onPress={aplicar}>
            <Ionicons name="search" size={18} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <DashboardReativo inicio={dataInicio.getTime()} fim={dataFim.getTime()} />

    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { padding: SPACING.md, paddingBottom: SPACING.xl, gap: SPACING.sm },

  filterCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border,
  },
  filterHeader: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginBottom: SPACING.sm,
  },
  filterTitle:     { flex: 1, fontSize: FONT.md, fontWeight: '700', color: COLORS.text },
  mesAtualBtn:     { paddingHorizontal: SPACING.sm, paddingVertical: 4, backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.full },
  mesAtualText:    { fontSize: FONT.xs, color: COLORS.primary, fontWeight: '700' },
  filterRow:       { flexDirection: 'row', alignItems: 'flex-end', gap: SPACING.sm },
  filterInputWrap: { flex: 1 },
  filterLabel: {
    fontSize: FONT.xs, fontWeight: '600', color: COLORS.textSecondary,
    textTransform: 'uppercase', marginBottom: SPACING.xs,
  },
  filterInput: {
    backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    fontSize: FONT.sm, color: COLORS.text, textAlign: 'center',
  },
  aplicarBtn: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  loadingWrap: { alignItems: 'center', padding: SPACING.xl, gap: SPACING.sm },
  loadingText: { fontSize: FONT.sm, color: COLORS.textSecondary },
  kpiRow:  { marginBottom: SPACING.sm },
  kpiCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    padding: SPACING.md, borderWidth: 1, borderColor: COLORS.border, borderLeftWidth: 4,
  },
  kpiLabel: { fontSize: FONT.xs, fontWeight: '600', color: COLORS.textSecondary, textTransform: 'uppercase', marginBottom: SPACING.xs },
  kpiValue: { fontSize: FONT.xxl, fontWeight: '800' },
  kpiSub:   { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 4 },
  sectionTitle: {
    fontSize: FONT.sm, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginTop: SPACING.sm,
  },
  emptyCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.xl, alignItems: 'center', gap: SPACING.sm,
  },
  emptyText: { fontSize: FONT.sm, color: COLORS.textSecondary },
  tableCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
  },
  tableRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.divider },
  tableForma: { fontSize: FONT.sm, fontWeight: '600', color: COLORS.text, width: 80 },
  barBg: {
    height: 6, backgroundColor: COLORS.divider, borderRadius: RADIUS.full,
    marginBottom: 2, overflow: 'hidden',
  },
  barFill: { height: 6, backgroundColor: COLORS.primary, borderRadius: RADIUS.full },
  barPct:  { fontSize: FONT.xs, color: COLORS.textSecondary },
  tableValor: {
    fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary, minWidth: 90, textAlign: 'right',
  },
});
