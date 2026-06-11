import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import ScannerModal from '../components/ScannerModal';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

// =============================================================================
// Lista reativa dos itens desta coleta
// Observa coleta_itens (WHERE coleta_id = X) e todos os produtos ativos.
// O mapa de produtos é recalculado apenas quando a lista de produtos muda.
// =============================================================================
const ItensColetaBase = ({ itens, produtos, onEditar, onRemover }) => {
  const produtoMap = React.useMemo(
    () => new Map(produtos.map(p => [p.id, p])),
    [produtos]
  );

  if (!itens?.length) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="cube-outline" size={52} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>Nenhum produto contado</Text>
        <Text style={styles.emptySub}>
          Busque ou bipe um produto acima para registrar a contagem
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={itens}
      keyExtractor={i => i.id}
      contentContainerStyle={styles.listaContent}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <Text style={styles.listaHeader}>
          {itens.length} produto{itens.length !== 1 ? 's' : ''} contado{itens.length !== 1 ? 's' : ''}
        </Text>
      }
      renderItem={({ item }) => {
        const produto = produtoMap.get(item.produtoId);
        return (
          <View style={[styles.itemCard, SHADOW.sm]}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemNome} numberOfLines={0}>
                {produto?.descricao ?? 'Produto removido'}
              </Text>
              <View style={styles.itemQtdRow}>
                <Ionicons name="cube-outline" size={13} color={COLORS.textSecondary} />
                <Text style={styles.itemQtdText}>
                  {item.quantidade} un. contadas
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.editBtn}
              onPress={() => onEditar(item, produto)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="create-outline" size={18} color={COLORS.primary} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => onRemover(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Ionicons name="trash-outline" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        );
      }}
      ListFooterComponent={<View style={{ height: 24 }} />}
    />
  );
};

const enhanceItens = withObservables(['coletaId'], ({ coletaId }) => ({
  itens:    database.get('coleta_itens').query(Q.where('coleta_id', coletaId)),
  produtos: database.get('produtos').query(Q.where('ativo', true)),
}));
const ItensColeta = enhanceItens(ItensColetaBase);

// =============================================================================
// Tela de Contagem — interna a uma coleta
// =============================================================================
export default function ColetaDetalheScreen({ route }) {
  const { coletaId } = route.params;
  const db           = useDatabase();

  // ── Busca de produtos ──────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('');
  const [resultados,  setResultados]  = useState([]);
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    const s = searchQuery.trim();
    if (!s) { setResultados([]); return; }
    db.get('produtos').query(
      Q.where('ativo', true),
      Q.or(
        Q.where('descricao', Q.like(`%${s}%`)),
        Q.where('cod_barras', s)
      )
    ).fetch().then(setResultados);
  }, [searchQuery, db]);

  // ── Modal de quantidade ───────────────────────────────────────────────
  const [modalProduto,       setModalProduto]       = useState(null);
  const [modalQtd,           setModalQtd]           = useState('1');
  const [modalItemExistente, setModalItemExistente] = useState(null);
  const [salvandoModal,      setSalvandoModal]      = useState(false);

  const fecharModal = () => {
    setModalProduto(null);
    setModalQtd('1');
    setModalItemExistente(null);
  };

  // Ao clicar num produto no dropdown: verifica se já foi contado e abre o modal
  const handleSelecionarProduto = useCallback(async (produto) => {
    setSearchQuery('');
    setResultados([]);
    try {
      const existentes = await db
        .get('coleta_itens')
        .query(Q.where('coleta_id', coletaId), Q.where('produto_id', produto.id))
        .fetch();
      const existente = existentes[0] ?? null;
      setModalItemExistente(existente);
      setModalProduto(produto);
      setModalQtd(existente ? String(existente.quantidade) : '1');
    } catch (err) {
      Alert.alert('Erro', err.message);
    }
  }, [db, coletaId]);

  const handleScan = useCallback(async (codigo) => {
    setShowScanner(false);
    try {
      const encontrados = await db.get('produtos').query(
        Q.where('ativo', true),
        Q.where('cod_barras', codigo)
      ).fetch();
      if (encontrados.length > 0) {
        handleSelecionarProduto(encontrados[0]);
      } else {
        setSearchQuery(codigo);
      }
    } catch (_) {
      setSearchQuery(codigo);
    }
  }, [db, handleSelecionarProduto]);

  // Confirma a contagem: cria ou atualiza o coleta_item
  const handleConfirmarModal = async () => {
    const qtd = parseFloat(modalQtd.replace(',', '.'));
    if (isNaN(qtd) || qtd < 0) {
      Alert.alert('Valor inválido', 'Informe uma quantidade ≥ 0.');
      return;
    }
    setSalvandoModal(true);
    try {
      await db.write(async () => {
        if (modalItemExistente) {
          await modalItemExistente.update(i => { i.quantidade = qtd; });
        } else {
          await db.get('coleta_itens').create(i => {
            i.coletaId  = coletaId;
            i.produtoId = modalProduto.id;
            i.quantidade = qtd;
          });
        }
      });
      fecharModal();
    } catch (err) {
      Alert.alert('Erro ao salvar contagem', err.message);
    } finally {
      setSalvandoModal(false);
    }
  };

  // Botão de editar na lista → abre o modal com dados preenchidos
  const handleEditar = (item, produto) => {
    setModalItemExistente(item);
    setModalProduto(produto);
    setModalQtd(String(item.quantidade));
  };

  // Botão de remover na lista
  const handleRemover = (item) => {
    Alert.alert(
      'Remover item',
      'Remover este produto da contagem desta coleta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.write(async () => { await item.destroyPermanently(); });
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

      {/* ── Área de busca ── */}
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
              <TouchableOpacity onPress={() => { setSearchQuery(''); setResultados([]); }}>
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

        {/* Dropdown de resultados da busca */}
        {resultados.length > 0 && (
          <View style={styles.dropdownWrap}>
            {resultados.slice(0, 6).map(p => (
              <TouchableOpacity
                key={p.id}
                style={styles.dropdownItem}
                onPress={() => handleSelecionarProduto(p)}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropdownNome} numberOfLines={0}>{p.descricao}</Text>
                  <Text style={styles.dropdownSub}>Estoque atual: {p.qtdEstoque} un.</Text>
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

      {/* ── Lista reativa de itens contados ── */}
      <ItensColeta
        coletaId={coletaId}
        onEditar={handleEditar}
        onRemover={handleRemover}
      />

      {/* ── Scanner de código de barras ── */}
      <ScannerModal
        visible={showScanner}
        onScan={handleScan}
        onClose={() => setShowScanner(false)}
      />

      {/* ── Modal: registrar / atualizar contagem ── */}
      <Modal visible={!!modalProduto} animationType="fade" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, SHADOW.lg]}>
              <Text style={styles.modalTitulo}>
                {modalItemExistente ? 'Atualizar Contagem' : 'Registrar Contagem'}
              </Text>

              <Text style={styles.modalProdNome} numberOfLines={2}>
                {modalProduto?.descricao}
              </Text>

              {/* Input grande de quantidade */}
              <View style={styles.inputRow}>
                <TextInput
                  style={styles.modalInput}
                  value={modalQtd}
                  onChangeText={setModalQtd}
                  keyboardType="decimal-pad"
                  selectTextOnFocus
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleConfirmarModal}
                />
                <Text style={styles.modalUn}>un.</Text>
              </View>

              <View style={styles.modalBtns}>
                <TouchableOpacity style={styles.btnCancelar} onPress={fecharModal}>
                  <Text style={styles.btnCancelarText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnConfirmar, salvandoModal && { opacity: 0.6 }]}
                  onPress={handleConfirmarModal}
                  disabled={salvandoModal}
                >
                  {salvandoModal ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.btnConfirmarText}>
                      {modalItemExistente ? 'Atualizar' : 'Salvar'}
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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

  // Dropdown
  dropdownWrap: {
    marginTop: SPACING.sm, backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    padding: SPACING.sm + 2, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  dropdownNome: { fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  dropdownSub:  { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  semResultado: {
    paddingVertical: SPACING.sm, textAlign: 'center',
    fontSize: FONT.sm, color: COLORS.textLight, fontStyle: 'italic',
  },

  // Lista de itens contados
  listaContent: { padding: SPACING.md, gap: SPACING.sm },
  listaHeader: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs,
  },
  itemCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  itemInfo:    { flex: 1 },
  itemNome:    { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text },
  itemQtdRow:  { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 },
  itemQtdText: { fontSize: FONT.xs, color: COLORS.textSecondary },
  editBtn: {
    width: 34, height: 34, borderRadius: RADIUS.sm,
    borderWidth: 1.5, borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  removeBtn: {
    width: 34, height: 34, borderRadius: RADIUS.sm,
    borderWidth: 1.5, borderColor: COLORS.errorLight,
    backgroundColor: COLORS.errorLight,
    alignItems: 'center', justifyContent: 'center',
  },

  // Empty state
  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.sm,
  },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySub:   { fontSize: FONT.sm, color: COLORS.textLight, textAlign: 'center' },

  // Modal de quantidade (card central)
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center', alignItems: 'center', padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl,
    padding: SPACING.lg, width: '100%',
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalTitulo: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
  },
  modalProdNome: {
    fontSize: FONT.md, fontWeight: '700', color: COLORS.text,
    marginVertical: SPACING.sm,
  },
  inputRow: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'center', gap: SPACING.sm,
    marginVertical: SPACING.md,
  },
  // Input grande para facilitar a digitação rápida
  modalInput: {
    fontSize: 48, fontWeight: '800', color: COLORS.primary,
    textAlign: 'center', minWidth: 120,
    borderBottomWidth: 3, borderBottomColor: COLORS.primary,
    paddingBottom: SPACING.xs,
  },
  modalUn: { fontSize: FONT.lg, color: COLORS.textSecondary, fontWeight: '500' },

  modalBtns:        { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  btnCancelar: {
    flex: 1, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, alignItems: 'center',
  },
  btnCancelarText:  { fontSize: FONT.md, color: COLORS.textSecondary, fontWeight: '600' },
  btnConfirmar: {
    flex: 1, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  btnConfirmarText: { fontSize: FONT.md, color: '#fff', fontWeight: '800' },
});
