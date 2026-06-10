import React, { useState, useCallback, useLayoutEffect } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Modal, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { of } from 'rxjs';
import { switchMap, shareReplay } from 'rxjs/operators';
import FormInput from '../components/FormInput';
import ScannerModal from '../components/ScannerModal';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

// =============================================================================
// KitStockBadge — reativo via withObservables + switchMap
// Observa kit_itens E os produtos individuais: atualiza quando qtdEstoque muda
// =============================================================================
const KitStockBadgeBase = ({ kitItens, individuais }) => {
  if (kitItens === undefined || individuais === undefined) {
    return <ActivityIndicator size="small" color={COLORS.primary} />;
  }

  const prodMap = new Map((individuais ?? []).map(p => [p.id, p]));
  let max = Infinity;
  for (const ki of (kitItens ?? [])) {
    const p = prodMap.get(ki.produtoIndividualId);
    if (p) max = Math.min(max, Math.max(0, Math.floor(p.qtdEstoque / ki.quantidadeNecessaria)));
  }
  const qtd  = (kitItens?.length > 0 && isFinite(max)) ? max : 0;
  const sem   = qtd <= 0;
  const baixo = qtd > 0 && qtd <= 5;

  return (
    <View style={[
      styles.stockBadge,
      !sem && !baixo && styles.stockOk,
      baixo && styles.stockBaixo,
      sem   && styles.stockZero,
    ]}>
      <Text style={[
        styles.stockNum,
        baixo && { color: COLORS.warning },
        sem   && { color: COLORS.error },
      ]}>{qtd}</Text>
      <Text style={[styles.stockUn, sem && { color: COLORS.error }]}>un</Text>
    </View>
  );
};

const enhanceKitBadge = withObservables(['produto'], ({ produto }) => {
  const kitItensShared = database.get('produto_kit_itens')
    .query(Q.where('produto_mestre_id', produto.id))
    .observe()
    .pipe(shareReplay(1));

  return {
    kitItens: kitItensShared,
    individuais: kitItensShared.pipe(
      switchMap(kitItens => {
        if (!kitItens.length) return of([]);
        const ids = kitItens.map(ki => ki.produtoIndividualId);
        return database.get('produtos')
          .query(Q.where('id', Q.oneOf(ids)))
          .observe();
      })
    ),
  };
});
const KitStockBadge = enhanceKitBadge(KitStockBadgeBase);

// =============================================================================
// ProdutoItemBase — card de produto individual, com reatividade própria
// =============================================================================
const ProdutoItemBase = ({ produto, onMovimentar, onEditar, onExcluir }) => {
  const isKit = produto.tipoBaixa === 'M';
  const sem   = produto.qtdEstoque <= 0;
  const baixo = produto.qtdEstoque > 0 && produto.qtdEstoque <= 5;

  return (
    <View style={[styles.card, SHADOW.sm]}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, sem && !isKit && styles.cardIconSem]}>
          <Ionicons
            name={isKit ? 'layers' : 'cube'}
            size={20}
            color={isKit ? COLORS.warning : sem ? COLORS.error : COLORS.primary}
          />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={styles.cardNome} numberOfLines={1}>{produto.descricao}</Text>
          <View style={styles.cardMetaRow}>
            <Text style={styles.cardTipo}>
              {isKit ? '📦 Kit/Mestre' : '📦 Individual'}
            </Text>
            {produto.codigoInterno ? (
              <Text style={styles.cardCodigo}>#{produto.codigoInterno}</Text>
            ) : null}
          </View>
        </View>

        {/* Badge de estoque — reativo via withObservables */}
        {isKit ? (
          <KitStockBadge produto={produto} />
        ) : (
          <View style={[
            styles.stockBadge,
            !sem && !baixo && styles.stockOk,
            baixo && styles.stockBaixo,
            sem   && styles.stockZero,
          ]}>
            <Text style={[
              styles.stockNum,
              baixo && { color: COLORS.warning },
              sem   && { color: COLORS.error },
            ]}>{produto.qtdEstoque}</Text>
            <Text style={[styles.stockUn, sem && { color: COLORS.error }]}>un</Text>
          </View>
        )}
      </View>

      <View style={styles.cardBottom}>
        <View>
          <Text style={styles.priceLabel}>Venda</Text>
          <Text style={styles.priceValue}>R$ {produto.precoVenda.toFixed(2)}</Text>
        </View>
        <View style={styles.divV} />
        <View>
          <Text style={styles.priceLabel}>Custo</Text>
          <Text style={[styles.priceValue, { color: COLORS.textSecondary }]}>
            R$ {produto.custoPreco.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }} />

        {!isKit ? (
          <TouchableOpacity style={styles.movBtn} onPress={() => onMovimentar(produto)}>
            <Ionicons name="swap-vertical" size={16} color={COLORS.primary} />
            <Text style={styles.movBtnText}>Estoque</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.movBtn, { borderColor: COLORS.border, opacity: 0.5 }]}>
            <Ionicons name="layers-outline" size={16} color={COLORS.textSecondary} />
            <Text style={[styles.movBtnText, { color: COLORS.textSecondary }]}>Kit</Text>
          </View>
        )}

        <TouchableOpacity style={styles.actionBtn} onPress={() => onEditar(produto)}>
          <Ionicons name="create-outline" size={16} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.actionBtn, { borderColor: COLORS.errorLight }]}
          onPress={() => onExcluir(produto)}
        >
          <Ionicons name="trash-outline" size={16} color={COLORS.error} />
        </TouchableOpacity>
      </View>
    </View>
  );
};

// Encapsula ProdutoItemBase com withObservables para observar mudanças no produto
const enhanceProdutoItem = withObservables(['produto'], ({ produto }) => ({
  produto: produto.observe(),
}));
const ProdutoItem = enhanceProdutoItem(ProdutoItemBase);

// =============================================================================
// Lista reativa de produtos — apenas ativos, busca por nome/código
// =============================================================================
const ProdutosListBase = ({ produtos, onMovimentar, onEditar, onExcluir }) => {
  if (!produtos?.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="cube-outline" size={56} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>Nenhum produto</Text>
        <Text style={styles.emptySub}>Toque no + para cadastrar o primeiro produto</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={produtos}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <ProdutoItem
          produto={item}
          onMovimentar={onMovimentar}
          onEditar={onEditar}
          onExcluir={onExcluir}
        />
      )}
    />
  );
};

const enhance = withObservables(['searchQuery'], ({ searchQuery }) => {
  const s = searchQuery?.trim();
  if (!s) {
    return { produtos: database.get('produtos').query(Q.where('ativo', true)) };
  }
  return {
    produtos: database.get('produtos').query(
      Q.where('ativo', true),
      Q.or(
        Q.where('descricao', Q.like(`%${s}%`)),
        Q.where('cod_barras', s)
      )
    ),
  };
});
const ProdutosList = enhance(ProdutosListBase);

// =============================================================================
// Tela Principal de Produtos
// =============================================================================
export default function ProdutosScreen() {
  const db         = useDatabase();
  const navigation = useNavigation();

  const [searchQuery, setSearchQuery] = useState('');
  const [showScanner, setShowScanner] = useState(false);
  const [produtoMov,  setProdutoMov]  = useState(null);
  const [tipoMov,     setTipoMov]     = useState('entrada');
  const [qtdMov,      setQtdMov]      = useState('');
  const [loadingMov,  setLoadingMov]  = useState(false);

  // Atalho "Balanço de Estoque" no header da aba
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          style={{ marginRight: SPACING.sm, padding: 4 }}
          onPress={() => navigation.navigate('BalancoEstoque')}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="scale-outline" size={22} color="#fff" />
        </TouchableOpacity>
      ),
    });
  }, [navigation]);

  const handleMovimentar = (produto) => {
    setProdutoMov(produto);
    setTipoMov('entrada');
    setQtdMov('');
  };

  const handleConfirmarMovimentacao = async () => {
    if (produtoMov.movimentaEstoque === false) {
      Alert.alert('Atenção', 'Este produto está configurado para não movimentar estoque.');
      return;
    }
    const qtd = parseFloat(qtdMov.replace(',', '.'));
    if (isNaN(qtd) || qtd <= 0) {
      Alert.alert('Atenção', 'Informe uma quantidade válida maior que zero.');
      return;
    }
    if (tipoMov === 'saida' && qtd > produtoMov.qtdEstoque) {
      Alert.alert('Estoque insuficiente', `Estoque: ${produtoMov.qtdEstoque} un.`);
      return;
    }

    setLoadingMov(true);
    try {
      await db.write(async () => {
        const delta   = tipoMov === 'entrada' ? qtd : -qtd;
        const tipoReg = tipoMov === 'entrada' ? 'ajuste_positivo' : 'ajuste_negativo';

        await db.get('estoque_movimentacoes').create(m => {
          m.produtoId        = produtoMov.id;
          m.tipoMovimentacao = tipoReg;
          m.quantidade       = qtd;
          m.dataMovimentacao = new Date();
        });
        await produtoMov.update(p => { p.qtdEstoque = p.qtdEstoque + delta; });
      });
      setProdutoMov(null);
    } catch (err) {
      Alert.alert('Erro', err.message);
    } finally {
      setLoadingMov(false);
    }
  };

  const handleExcluir = (produto) => {
    Alert.alert(
      'Excluir Produto',
      `Deseja excluir "${produto.descricao}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const temVendas = (await db
                .get('vendas_itens')
                .query(Q.where('produto_id', produto.id))
                .fetchCount()) > 0;

              const temMov = (await db
                .get('estoque_movimentacoes')
                .query(Q.where('produto_id', produto.id))
                .fetchCount()) > 0;

              if (!temVendas && !temMov) {
                await db.write(async () => { await produto.destroyPermanently(); });
              } else {
                await db.write(async () => {
                  await produto.update(p => { p.ativo = false; });
                });
                Alert.alert('Produto Inativado', 'Possui histórico — foi inativado.');
              }
            } catch (err) {
              Alert.alert('Erro', err.message);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      {/* Busca */}
      <View style={styles.searchContainer}>
        <View style={styles.searchRow}>
          <View style={[styles.searchBar, SHADOW.sm, { flex: 1 }]}>
            <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
            <TextInput
              style={styles.searchInput}
              placeholder="Buscar produto ou cód. barras..."
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
          <TouchableOpacity
            style={[styles.cameraBtn, SHADOW.sm]}
            onPress={() => setShowScanner(true)}
          >
            <Ionicons name="barcode-outline" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ProdutosList
        searchQuery={searchQuery}
        onMovimentar={handleMovimentar}
        onEditar={p => navigation.navigate('CadastrarProduto', { produto: p })}
        onExcluir={handleExcluir}
      />

      <TouchableOpacity
        style={[styles.fab, SHADOW.lg]}
        onPress={() => navigation.navigate('CadastrarProduto')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <ScannerModal
        visible={showScanner}
        onScan={(codigo) => { setSearchQuery(codigo); setShowScanner(false); }}
        onClose={() => setShowScanner(false)}
      />

      {/* Modal Movimentação */}
      <Modal visible={!!produtoMov} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, SHADOW.lg]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitulo}>Movimentar Estoque</Text>
                <Text style={styles.modalSubtitulo} numberOfLines={1}>
                  {produtoMov?.descricao}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setProdutoMov(null)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.estoqueAtual}>
              <Text style={styles.estoqueAtualLabel}>Estoque atual</Text>
              <Text style={styles.estoqueAtualNum}>{produtoMov?.qtdEstoque ?? 0}</Text>
              <Text style={styles.estoqueAtualUn}>unidades</Text>
            </View>

            <View style={styles.tipoMovRow}>
              {[
                { key: 'entrada', label: 'Entrada', icon: 'arrow-down-circle', color: COLORS.success },
                { key: 'saida',   label: 'Saída',   icon: 'arrow-up-circle',   color: COLORS.error },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[
                    styles.tipoMovBtn,
                    tipoMov === opt.key && {
                      borderColor: opt.color,
                      backgroundColor: tipoMov === 'entrada' ? COLORS.successLight : COLORS.errorLight,
                    },
                  ]}
                  onPress={() => setTipoMov(opt.key)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={22}
                    color={tipoMov === opt.key ? opt.color : COLORS.textSecondary}
                  />
                  <Text style={[
                    styles.tipoMovText,
                    tipoMov === opt.key && { color: opt.color, fontWeight: '700' },
                  ]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <FormInput
              label="Quantidade"
              required
              value={qtdMov}
              onChangeText={setQtdMov}
              placeholder="Ex: 10"
              keyboardType="decimal-pad"
              style={{ marginBottom: SPACING.lg }}
            />

            <TouchableOpacity
              style={[
                styles.confirmarBtn,
                tipoMov === 'saida' && { backgroundColor: COLORS.error },
                loadingMov && { opacity: 0.6 },
              ]}
              onPress={handleConfirmarMovimentacao}
              disabled={loadingMov}
            >
              {loadingMov ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons
                    name={tipoMov === 'entrada' ? 'arrow-down-circle' : 'arrow-up-circle'}
                    size={20} color="#fff"
                  />
                  <Text style={styles.confirmarBtnText}>
                    Confirmar {tipoMov === 'entrada' ? 'Entrada' : 'Saída'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  searchContainer: { padding: SPACING.md, paddingBottom: SPACING.sm },
  searchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    gap: SPACING.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONT.md, color: COLORS.text, padding: 0 },
  cameraBtn: {
    width: 46, height: 46, borderRadius: RADIUS.lg,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  list: { padding: SPACING.md, paddingTop: 0, gap: SPACING.sm, paddingBottom: 100 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  cardTop: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
  },
  cardIcon: {
    width: 38, height: 38, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardIconSem:  { backgroundColor: COLORS.errorLight },
  cardNome:     { fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
  cardMetaRow:  { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 },
  cardTipo:     { fontSize: FONT.xs, color: COLORS.textSecondary },
  cardCodigo:   { fontSize: FONT.xs, color: COLORS.textLight, fontWeight: '600' },
  stockBadge: {
    alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: RADIUS.sm, backgroundColor: COLORS.successLight,
  },
  stockOk:   { backgroundColor: COLORS.successLight },
  stockBaixo:{ backgroundColor: COLORS.warningLight },
  stockZero: { backgroundColor: COLORS.errorLight },
  stockNum:  { fontSize: FONT.lg, fontWeight: '800', color: COLORS.success },
  stockUn:   { fontSize: FONT.xs, color: COLORS.success, fontWeight: '500' },
  cardBottom: {
    flexDirection: 'row', alignItems: 'center',
    borderTopWidth: 1, borderTopColor: COLORS.divider,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    gap: SPACING.sm,
  },
  priceLabel: { fontSize: FONT.xs, color: COLORS.textSecondary, textTransform: 'uppercase' },
  priceValue: { fontSize: FONT.md, fontWeight: '700', color: COLORS.primary, marginTop: 1 },
  divV: { width: 1, height: 32, backgroundColor: COLORS.divider },
  movBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: SPACING.sm, paddingVertical: 6,
    borderRadius: RADIUS.sm, borderWidth: 1.5, borderColor: COLORS.primary,
  },
  movBtnText: { fontSize: FONT.xs, color: COLORS.primary, fontWeight: '600' },
  actionBtn: {
    width: 32, height: 32, borderRadius: RADIUS.sm,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  fab: {
    position: 'absolute', right: SPACING.md, bottom: SPACING.lg,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.sm, marginTop: 60,
  },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySub:   { fontSize: FONT.sm, color: COLORS.textLight, textAlign: 'center' },
  // Modal Movimentação
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md,
  },
  modalTitulo:    { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  modalSubtitulo: { fontSize: FONT.sm, color: COLORS.textSecondary, marginTop: 2 },
  estoqueAtual: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center',
    gap: 6, backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, paddingVertical: SPACING.sm, marginBottom: SPACING.md,
  },
  estoqueAtualLabel: { fontSize: FONT.sm, color: COLORS.textSecondary },
  estoqueAtualNum:   { fontSize: 32, fontWeight: '800', color: COLORS.text },
  estoqueAtualUn:    { fontSize: FONT.sm, color: COLORS.textSecondary },
  tipoMovRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  tipoMovBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: 8,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md, borderWidth: 2,
    borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  tipoMovText: { fontSize: FONT.md, color: COLORS.textSecondary, fontWeight: '500' },
  confirmarBtn: {
    backgroundColor: COLORS.success, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', padding: SPACING.md + 2, gap: SPACING.sm,
  },
  confirmarBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '800' },
});
