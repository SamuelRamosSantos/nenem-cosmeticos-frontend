import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  FlatList, Alert, ActivityIndicator, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import ScannerModal from '../components/ScannerModal';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

// =============================================================================
// Balanço de Estoque — modo em lote
//
// Fluxo:
//   1. Usuário bipca/busca produtos → vão para uma lista local (carrinho de balanço)
//   2. Para cada produto, digita o estoque contado (físico)
//   3. "Finalizar Balanço" processa tudo em um único database.batch()
// =============================================================================
export default function BalancoEstoqueScreen() {
  const db = useDatabase();

  const [searchQuery,  setSearchQuery]  = useState('');
  const [resultados,   setResultados]   = useState([]);
  const [showScanner,  setShowScanner]  = useState(false);
  const [listaBalanco, setListaBalanco] = useState([]);
  // listaBalanco: [{ produto: WatermelonModel, estoqueContado: string }]
  const [saving,       setSaving]       = useState(false);

  // Busca reativa por nome / cód. de barras
  useEffect(() => {
    const s = searchQuery.trim();
    if (!s) { setResultados([]); return; }
    db.get('produtos').query(
      Q.where('ativo', true),
      Q.or(
        Q.where('descricao', Q.like(`%${s}%`)),
        Q.where('cod_barras', s)
      )
    ).fetch().then(lista => {
      // Exclui produtos já adicionados à lista
      const jaAdicionados = new Set(listaBalanco.map(i => i.produto.id));
      setResultados(lista.filter(p => !jaAdicionados.has(p.id)));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, db]);

  const adicionarALista = useCallback((produto) => {
    setListaBalanco(prev => {
      if (prev.find(i => i.produto.id === produto.id)) return prev;
      return [...prev, { produto, estoqueContado: String(produto.qtdEstoque) }];
    });
    setSearchQuery('');
    setResultados([]);
  }, []);

  const handleScan = useCallback(async (codigo) => {
    setShowScanner(false);
    try {
      const encontrados = await db.get('produtos').query(
        Q.where('ativo', true),
        Q.where('cod_barras', codigo)
      ).fetch();
      if (encontrados.length > 0) {
        adicionarALista(encontrados[0]);
      } else {
        setSearchQuery(codigo);
      }
    } catch (_) {
      setSearchQuery(codigo);
    }
  }, [db, adicionarALista]);

  const atualizarContado = (produtoId, valor) => {
    setListaBalanco(prev =>
      prev.map(item =>
        item.produto.id === produtoId ? { ...item, estoqueContado: valor } : item
      )
    );
  };

  const removerDaLista = (produtoId) => {
    setListaBalanco(prev => prev.filter(item => item.produto.id !== produtoId));
  };

  const handleFinalizarBalanco = async () => {
    if (listaBalanco.length === 0) return;

    // Valida todas as entradas antes de gravar
    for (const { produto, estoqueContado } of listaBalanco) {
      const contado = parseFloat(estoqueContado.replace(',', '.'));
      if (isNaN(contado) || contado < 0) {
        Alert.alert(
          'Valor inválido',
          `"${produto.descricao}" tem um valor inválido. Informe um número ≥ 0.`
        );
        return;
      }
    }

    setSaving(true);
    try {
      let alterados = 0;
      await db.write(async () => {
        const ops = [];
        for (const { produto, estoqueContado } of listaBalanco) {
          const contado = parseFloat(estoqueContado.replace(',', '.'));
          const diff    = contado - produto.qtdEstoque;

          if (diff !== 0) {
            ops.push(
              db.get('estoque_movimentacoes').prepareCreate(m => {
                m.produtoId        = produto.id;
                m.tipoMovimentacao = diff > 0 ? 'ajuste_positivo' : 'ajuste_negativo';
                m.quantidade       = Math.abs(diff);
                m.dataMovimentacao = new Date();
              })
            );
            ops.push(
              produto.prepareUpdate(p => { p.qtdEstoque = contado; })
            );
            alterados++;
          }
        }
        if (ops.length > 0) await db.batch(...ops);
      });

      const msg = alterados === 0
        ? 'Todos os estoques já estão corretos. Nenhuma movimentação gerada.'
        : `${alterados} produto(s) atualizado(s) com sucesso.`;

      Alert.alert('Balanço Finalizado!', msg, [{
        text: 'OK',
        onPress: () => setListaBalanco([]),
      }]);
    } catch (err) {
      Alert.alert('Erro ao finalizar balanço', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* ── Busca + Scanner ── */}
      <View style={styles.searchArea}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBar, { flex: 1 }]}>
            <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar produto por nome ou cód. barras..."
              placeholderTextColor={COLORS.textLight}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery('')}>
                <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity style={[styles.cameraBtn, SHADOW.sm]} onPress={() => setShowScanner(true)}>
            <Ionicons name="barcode-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>

        {/* Dropdown de resultados */}
        {resultados.length > 0 && (
          <View style={styles.dropdownWrap}>
            {resultados.slice(0, 6).map(p => (
              <TouchableOpacity
                key={p.id}
                style={styles.dropdownItem}
                onPress={() => adicionarALista(p)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownNome} numberOfLines={1}>{p.descricao}</Text>
                  <Text style={styles.dropdownEstoque}>Atual: {p.qtdEstoque} un.</Text>
                </View>
                <Ionicons name="add-circle-outline" size={22} color={COLORS.primary} />
              </TouchableOpacity>
            ))}
          </View>
        )}
        {searchQuery.trim().length > 0 && resultados.length === 0 && (
          <Text style={styles.semResultado}>Nenhum produto encontrado</Text>
        )}
      </View>

      {/* ── Lista do Balanço ── */}
      {listaBalanco.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="scale-outline" size={56} color={COLORS.textLight} />
          <Text style={styles.emptyTitle}>Lista de balanço vazia</Text>
          <Text style={styles.emptySub}>Busque ou bipe um produto para começar</Text>
        </View>
      ) : (
        <FlatList
          data={listaBalanco}
          keyExtractor={item => item.produto.id}
          contentContainerStyle={styles.listaContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            <Text style={styles.listaHeader}>
              {listaBalanco.length} produto{listaBalanco.length !== 1 ? 's' : ''} na lista
            </Text>
          }
          renderItem={({ item }) => {
            const contadoNum = parseFloat(item.estoqueContado.replace(',', '.'));
            const diffValido = !isNaN(contadoNum) && contadoNum >= 0;
            const diff       = diffValido ? contadoNum - item.produto.qtdEstoque : null;
            const pos = diff !== null && diff > 0;
            const neg = diff !== null && diff < 0;

            return (
              <View style={[styles.itemCard, SHADOW.sm]}>
                <View style={styles.itemTop}>
                  {/* Nome e código */}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.itemNome} numberOfLines={1}>
                      {item.produto.descricao}
                    </Text>
                    <Text style={styles.itemAtual}>
                      Estoque atual: {item.produto.qtdEstoque} un.
                    </Text>
                  </View>

                  {/* Remover */}
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removerDaLista(item.produto.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close-circle" size={22} color={COLORS.error} />
                  </TouchableOpacity>
                </View>

                {/* Input de quantidade contada */}
                <View style={styles.itemBottom}>
                  <Text style={styles.contadoLabel}>Contado (físico):</Text>
                  <TextInput
                    style={styles.contadoInput}
                    value={item.estoqueContado}
                    onChangeText={v => atualizarContado(item.produto.id, v)}
                    keyboardType="decimal-pad"
                    selectTextOnFocus
                  />
                  <Text style={styles.contadoUn}>un.</Text>

                  {/* Badge de diferença */}
                  {diff !== null && diff !== 0 && (
                    <View style={[
                      styles.diffBadge,
                      { backgroundColor: pos ? COLORS.successLight : COLORS.errorLight },
                    ]}>
                      <Ionicons
                        name={pos ? 'arrow-up-circle' : 'arrow-down-circle'}
                        size={13}
                        color={pos ? COLORS.success : COLORS.error}
                      />
                      <Text style={[
                        styles.diffText,
                        { color: pos ? COLORS.success : COLORS.error },
                      ]}>
                        {pos ? `+${diff.toFixed(0)}` : `${diff.toFixed(0)}`}
                      </Text>
                    </View>
                  )}
                  {diff === 0 && (
                    <View style={[styles.diffBadge, { backgroundColor: COLORS.successLight }]}>
                      <Ionicons name="checkmark-circle" size={13} color={COLORS.success} />
                      <Text style={[styles.diffText, { color: COLORS.success }]}>OK</Text>
                    </View>
                  )}
                </View>
              </View>
            );
          }}
          ListFooterComponent={<View style={{ height: 100 }} />}
        />
      )}

      {/* ── Botão Finalizar ── */}
      {listaBalanco.length > 0 && (
        <View style={styles.footerWrap}>
          <TouchableOpacity
            style={[styles.finalizarBtn, SHADOW.lg, saving && { opacity: 0.6 }]}
            onPress={handleFinalizarBalanco}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-done-circle" size={22} color="#fff" />
                <Text style={styles.finalizarBtnText}>
                  Finalizar Balanço ({listaBalanco.length} produto{listaBalanco.length !== 1 ? 's' : ''})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      <ScannerModal
        visible={showScanner}
        onScan={handleScan}
        onClose={() => setShowScanner(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  // Área de busca
  searchArea: {
    padding: SPACING.md, paddingBottom: SPACING.xs,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
    zIndex: 10,
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.xs },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONT.md, color: COLORS.text, padding: 0 },
  cameraBtn: {
    width: 46, height: 46, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  dropdownWrap: {
    marginTop: SPACING.sm, backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.sm + 2, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  dropdownNome:    { fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  dropdownEstoque: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  semResultado: {
    paddingVertical: SPACING.sm, textAlign: 'center',
    fontSize: FONT.sm, color: COLORS.textLight, fontStyle: 'italic',
  },

  // Empty state
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.sm,
  },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySub:   { fontSize: FONT.sm, color: COLORS.textLight, textAlign: 'center' },

  // Lista
  listaContent: { padding: SPACING.md, gap: SPACING.sm },
  listaHeader: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs,
  },
  itemCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  itemTop: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    padding: SPACING.sm, paddingBottom: 0,
  },
  itemNome:  { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text },
  itemAtual: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  removeBtn: { padding: 2 },
  itemBottom: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.sm, paddingTop: SPACING.xs,
    borderTopWidth: 1, borderTopColor: COLORS.divider, marginTop: SPACING.xs,
  },
  contadoLabel: { fontSize: FONT.xs, color: COLORS.textSecondary, fontWeight: '600' },
  contadoInput: {
    fontSize: FONT.lg, fontWeight: '800', color: COLORS.primary,
    borderBottomWidth: 2, borderBottomColor: COLORS.primary,
    paddingBottom: 2, minWidth: 56, textAlign: 'center',
  },
  contadoUn:  { fontSize: FONT.xs, color: COLORS.textSecondary },
  diffBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: RADIUS.full,
    marginLeft: 'auto',
  },
  diffText: { fontSize: FONT.xs, fontWeight: '700' },

  // Footer
  footerWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.md,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  finalizarBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md, gap: SPACING.sm,
  },
  finalizarBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '800' },
});
