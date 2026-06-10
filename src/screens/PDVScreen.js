import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ScrollView, Modal, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import useCarrinhoStore from '../stores/useCarrinhoStore';
import { finalizarVenda } from '../services/vendaService';
import ScannerModal from '../components/ScannerModal';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `R$ ${Number(n || 0).toFixed(2)}`;
const fmtData = (date) => {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};
const ajustarData = (date, dias) => {
  const d = new Date(date);
  d.setDate(d.getDate() + dias);
  return d;
};

// =============================================================================
// PASSO 1: Seletor de Cliente reativo
// =============================================================================
const ClientesPickerBase = ({ pessoas, onSelecionar }) => (
  <FlatList
    data={pessoas}
    keyExtractor={p => p.id}
    keyboardShouldPersistTaps="handled"
    style={styles.pickerList}
    renderItem={({ item }) => (
      <TouchableOpacity style={styles.pickerItem} onPress={() => onSelecionar(item)}>
        <Ionicons name="person-outline" size={16} color={COLORS.primary} />
        <Text style={styles.pickerItemText} numberOfLines={1}>{item.nome}</Text>
      </TouchableOpacity>
    )}
    ListEmptyComponent={
      <Text style={styles.pickerVazio}>Nenhum cliente encontrado</Text>
    }
  />
);

const enhanceClientes = withObservables(['searchCliente'], ({ searchCliente }) => ({
  pessoas: searchCliente?.trim().length > 0
    ? database.get('pessoas').query(
      Q.where('tipo', 'C'),
      Q.where('nome', Q.like(`%${searchCliente.trim()}%`))
    )
    : database.get('pessoas').query(Q.where('tipo', 'C')),
}));
const ClientesPicker = enhanceClientes(ClientesPickerBase);

// =============================================================================
// PASSO 2: Buscador de Produtos reativo
// =============================================================================
const ProdutosPickerBase = ({ produtos, onSelecionar }) => (
  <FlatList
    data={produtos}
    keyExtractor={p => p.id}
    keyboardShouldPersistTaps="handled"
    style={styles.pickerList}
    renderItem={({ item }) => (
      <TouchableOpacity style={styles.pickerItem} onPress={() => onSelecionar(item)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.pickerItemText} numberOfLines={1}>{item.descricao}</Text>
          <Text style={styles.pickerItemSub}>{fmt(item.precoVenda)} · estoque: {item.qtdEstoque}</Text>
        </View>
        <Ionicons name="add-circle" size={22} color={COLORS.primary} />
      </TouchableOpacity>
    )}
    ListEmptyComponent={
      <Text style={styles.pickerVazio}>Nenhum produto encontrado</Text>
    }
  />
);

const enhanceProdutos = withObservables(['searchProduto'], ({ searchProduto }) => {
  const s = searchProduto?.trim();
  if (!s || s.length < 2) {
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
const ProdutosPicker = enhanceProdutos(ProdutosPickerBase);

// =============================================================================
// PASSO 3: Formas de Pagamento reativo
// =============================================================================
const FormasPagamentoBase = ({ formas, selecionada, onSelecionar }) => (
  <View style={styles.formasRow}>
    {formas.map(f => (
      <TouchableOpacity
        key={f.id}
        style={[styles.formaBadge, selecionada?.id === f.id && styles.formaBadgeSelected]}
        onPress={() => onSelecionar(f)}
      >
        <Text style={[styles.formaBadgeText, selecionada?.id === f.id && styles.formaBadgeTextSelected]}>
          {f.descricao}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);

const enhanceFormas = withObservables([], () => ({
  formas: database.get('formas_pagamento').query(),
}));
const FormasPagamento = enhanceFormas(FormasPagamentoBase);

// =============================================================================
// Tela PDV — Frente de Caixa
// =============================================================================
export default function PDVScreen() {
  const db = useDatabase();
  const carrinho = useCarrinhoStore();

  // Buscas
  const [searchCliente, setSearchCliente] = useState('');
  const [showClientes,  setShowClientes]  = useState(false);
  const [searchProduto, setSearchProduto] = useState('');
  const [showProdutos,  setShowProdutos]  = useState(false);

  // Scanner de código de barras
  const [showScanner, setShowScanner] = useState(false);

  const handleScan = useCallback(async (codigo) => {
    setShowScanner(false);
    try {
      const encontrados = await db.get('produtos').query(
        Q.where('ativo', true),
        Q.where('cod_barras', codigo)
      ).fetch();
      if (encontrados.length > 0) {
        const produto = encontrados[0];
        let percentualComissao = 0;
        if (produto.marcaId) {
          try {
            const marca = await db.get('marcas').find(produto.marcaId);
            percentualComissao = marca?.percentualComissao ?? 0;
          } catch (_) {}
        }
        carrinho.adicionarItem(produto, percentualComissao);
      } else {
        // Produto não encontrado: cai para busca manual
        setSearchProduto(codigo);
        setShowProdutos(true);
      }
    } catch (_) {
      setSearchProduto(codigo);
      setShowProdutos(true);
    }
  }, [db, carrinho]);

  // Pagamento modal
  const [showPagamento, setShowPagamento] = useState(false);
  const [formaSelecionada, setFormaSelecionada] = useState(null);
  const [loading, setLoading] = useState(false);

  // Data da venda — string editável DD/MM/AAAA (sincronizada com o store)
  const [dataStr, setDataStr] = useState(() => fmtData(carrinho.dataVenda));

  const handleDataChange = (text) => {
    const nums    = text.replace(/\D/g, '').slice(0, 8);
    let masked = nums;
    if (nums.length > 2) masked = `${nums.slice(0,2)}/${nums.slice(2)}`;
    if (nums.length > 4) masked = `${nums.slice(0,2)}/${nums.slice(2,4)}/${nums.slice(4)}`;
    setDataStr(masked);
    if (nums.length === 8) {
      const day   = parseInt(nums.slice(0, 2), 10);
      const month = parseInt(nums.slice(2, 4), 10) - 1;
      const year  = parseInt(nums.slice(4, 8), 10);
      const d = new Date(year, month, day);
      if (d.getFullYear() === year && d.getMonth() === month && d.getDate() === day) {
        carrinho.setDataVenda(d);
      }
    }
  };

  // Semente de formas de pagamento padrão
  useEffect(() => {
    (async () => {
      const count = await db.get('formas_pagamento').query().fetchCount();
      if (count > 0) return;
      await db.write(async () => {
        for (const desc of ['Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'PIX']) {
          await db.get('formas_pagamento').create(f => { f.descricao = desc; });
        }
      });
    })();
  }, [db]);

  // ── Handlers: cabeçalho ────────────────────────────────────────────────────
  const handleSelecionarCliente = (cliente) => {
    carrinho.setCliente(cliente.id, cliente.nome);
    setSearchCliente('');
    setShowClientes(false);
  };

  // ── Handlers: produto ──────────────────────────────────────────────────────
  const handleSelecionarProduto = useCallback(async (produto) => {
    let percentualComissao = 0;
    try {
      if (produto.marcaId) {
        const marca = await db.get('marcas').find(produto.marcaId);
        percentualComissao = marca?.percentualComissao ?? 0;
      }
    } catch (_) { }
    carrinho.adicionarItem(produto, percentualComissao);
    setSearchProduto('');
    setShowProdutos(false);
  }, [db, carrinho]);

  // ── Handler: finalizar venda ───────────────────────────────────────────────
  const handleFinalizar = async () => {
    if (!formaSelecionada) {
      Alert.alert('Atenção', 'Selecione uma forma de pagamento.');
      return;
    }
    const total = carrinho.totalItens();
    setLoading(true);
    try {
      await finalizarVenda(db, {
        clienteId: carrinho.clienteId,
        dataVenda: carrinho.dataVenda,
        itens: carrinho.itens.map(i => ({
          produtoId: i.produtoId,
          quantidade: i.quantidade,
          precoUnitario: i.precoUnitario,
          custoUnitario: i.custoCalculado,
        })),
        pagamentos: [{ formaPagamentoId: formaSelecionada.id, valor: total }],
      });
      carrinho.limparCarrinho();
      setFormaSelecionada(null);
      setShowPagamento(false);
      Alert.alert('Venda Realizada!', `Total: ${fmt(total)}`);
    } catch (err) {
      Alert.alert('Erro ao finalizar venda', err.message);
    } finally {
      setLoading(false);
    }
  };

  const total = carrinho.totalItens();

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── CABEÇALHO: Data da Venda (digitável) ── */}
        <View style={[styles.section, SHADOW.sm]}>
          <Text style={styles.sectionLabel}>Data da Venda</Text>
          <View style={styles.dataRow}>
            <TouchableOpacity
              style={styles.dataBtn}
              onPress={() => {
                const nova = ajustarData(carrinho.dataVenda, -1);
                carrinho.setDataVenda(nova);
                setDataStr(fmtData(nova));
              }}
            >
              <Ionicons name="chevron-back" size={20} color={COLORS.primary} />
            </TouchableOpacity>

            <View style={styles.dataInputWrap}>
              <Ionicons name="calendar-outline" size={16} color={COLORS.primary} />
              <TextInput
                style={styles.dataInput}
                value={dataStr}
                onChangeText={handleDataChange}
                placeholder="DD/MM/AAAA"
                placeholderTextColor={COLORS.textLight}
                keyboardType="number-pad"
                maxLength={10}
                selectTextOnFocus
              />
            </View>

            <TouchableOpacity
              style={styles.dataBtn}
              onPress={() => {
                const nova = ajustarData(carrinho.dataVenda, 1);
                carrinho.setDataVenda(nova);
                setDataStr(fmtData(nova));
              }}
            >
              <Ionicons name="chevron-forward" size={20} color={COLORS.primary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── PASSO 1: Cliente ── */}
        <View style={[styles.section, SHADOW.sm]}>
          <Text style={styles.sectionLabel}>  Cliente
          </Text>

          {carrinho.clienteId ? (
            <View style={styles.clienteSelecionado}>
              <Ionicons name="person-circle" size={22} color={COLORS.primary} />
              <Text style={styles.clienteNome}>{carrinho.clienteNome}</Text>
              <TouchableOpacity onPress={carrinho.limparCliente}>
                <Ionicons name="close-circle" size={20} color={COLORS.textLight} />
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.searchBar}>
                <Ionicons name="search-outline" size={16} color={COLORS.textSecondary} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Buscar cliente (opcional)..."
                  placeholderTextColor={COLORS.textLight}
                  value={searchCliente}
                  onChangeText={v => { setSearchCliente(v); setShowClientes(true); }}
                  onFocus={() => setShowClientes(true)}
                />
                {searchCliente.length > 0 && (
                  <TouchableOpacity onPress={() => { setSearchCliente(''); setShowClientes(false); }}>
                    <Ionicons name="close-circle" size={16} color={COLORS.textLight} />
                  </TouchableOpacity>
                )}
              </View>

              {showClientes && (
                <View style={styles.pickerContainer}>
                  <ClientesPicker
                    searchCliente={searchCliente}
                    onSelecionar={handleSelecionarCliente}
                  />
                  <TouchableOpacity
                    style={styles.fecharPicker}
                    onPress={() => setShowClientes(false)}
                  >
                    <Text style={styles.fecharPickerText}>Pular (sem cliente)</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}
        </View>

        {/* ── PASSO 2: Produtos / Carrinho ── */}
        <View style={[styles.section, SHADOW.sm]}>
          <Text style={styles.sectionLabel}>  Produtos
          </Text>

          {/* Campo busca de produto + botão câmera */}
          <View style={styles.searchRow}>
            <View style={[styles.searchBar, { flex: 1 }]}>
              <Ionicons name="search-outline" size={16} color={COLORS.textSecondary} />
              <TextInput
                style={styles.searchInput}
                placeholder="Buscar produto ou cód. barras..."
                placeholderTextColor={COLORS.textLight}
                value={searchProduto}
                onChangeText={v => { setSearchProduto(v); setShowProdutos(true); }}
                onFocus={() => setShowProdutos(true)}
              />
              {searchProduto.length > 0 && (
                <TouchableOpacity onPress={() => { setSearchProduto(''); setShowProdutos(false); }}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textLight} />
                </TouchableOpacity>
              )}
            </View>
            <TouchableOpacity
              style={styles.cameraBtn}
              onPress={() => setShowScanner(true)}
            >
              <Ionicons name="barcode-outline" size={22} color="#fff" />
            </TouchableOpacity>
          </View>

          {showProdutos && (
            <View style={styles.pickerContainer}>
              <ProdutosPicker
                searchProduto={searchProduto}
                onSelecionar={handleSelecionarProduto}
              />
              <TouchableOpacity
                style={styles.fecharPicker}
                onPress={() => setShowProdutos(false)}
              >
                <Text style={styles.fecharPickerText}>Fechar busca</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Carrinho */}
          {carrinho.itens.length === 0 ? (
            <View style={styles.carrinhoVazio}>
              <Ionicons name="bag-outline" size={40} color={COLORS.textLight} />
              <Text style={styles.carrinhoVazioText}>Carrinho vazio</Text>
            </View>
          ) : (
            <>
              {carrinho.itens.map(item => (
                <ItemCarrinho
                  key={item.produtoId}
                  item={item}
                  carrinho={carrinho}
                />
              ))}

              <TouchableOpacity
                style={styles.limparCarrinhoBtn}
                onPress={carrinho.limparCarrinho}
              >
                <Ionicons name="trash-outline" size={14} color={COLORS.error} />
                <Text style={styles.limparCarrinhoBtnText}>Limpar carrinho</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

      </ScrollView>

      {/* ── TOTAL + FINALIZAR — sticky acima do teclado ── */}
      {carrinho.itens.length > 0 && (
        <View style={[styles.footerCard, SHADOW.md]}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>{fmt(total)}</Text>
          </View>
          <TouchableOpacity
            style={[styles.finalizarBtn, SHADOW.lg]}
            onPress={() => setShowPagamento(true)}
          >
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.finalizarBtnText}>Finalizar Venda</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── MODAL PAGAMENTO (PASSO 3) ── */}
      <Modal visible={showPagamento} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, SHADOW.lg]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Confirmar Pagamento</Text>
              <TouchableOpacity onPress={() => setShowPagamento(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalTotal}>{fmt(total)}</Text>
            <Text style={styles.modalTotalLabel}>Total da venda · {fmtData(carrinho.dataVenda)}</Text>

            <Text style={styles.modalSectionTitle}>Forma de Pagamento</Text>
            <FormasPagamento
              selecionada={formaSelecionada}
              onSelecionar={setFormaSelecionada}
            />

            <TouchableOpacity
              style={[
                styles.confirmarBtn,
                (!formaSelecionada || loading) && styles.confirmarBtnDisabled,
              ]}
              onPress={handleFinalizar}
              disabled={!formaSelecionada || loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-done" size={22} color="#fff" />
                  <Text style={styles.confirmarBtnText}>Confirmar Venda</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── SCANNER DE CÓDIGO DE BARRAS ── */}
      <ScannerModal
        visible={showScanner}
        onScan={handleScan}
        onClose={() => setShowScanner(false)}
      />
    </KeyboardAvoidingView>
  );
}

// =============================================================================
// Item do Carrinho com inputs editáveis de quantidade e preço
// =============================================================================
function ItemCarrinho({ item, carrinho }) {
  const [precoStr, setPrecoStr] = useState(String(item.precoUnitario.toFixed(2)));

  const handlePrecoBlur = () => {
    carrinho.alterarPreco(item.produtoId, precoStr);
  };

  const handlePrecoChange = (text) => {
    const limpo = text.replace(/[^0-9.,]/g, '');
    setPrecoStr(limpo);
  };

  const subtotal = item.quantidade * item.precoUnitario;

  return (
    <View style={styles.itemCard}>
      {/* Nome */}
      <Text style={styles.itemNome} numberOfLines={1}>{item.descricao}</Text>

      <View style={styles.itemRow}>
        {/* Quantidade editável */}
        <View style={styles.qtyWrap}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => carrinho.alterarQuantidade(item.produtoId, item.quantidade - 1)}
          >
            <Ionicons name="remove" size={14} color={COLORS.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.qtyInput}
            value={String(item.quantidade)}
            onChangeText={v => {
              const n = parseInt(v, 10);
              if (!isNaN(n)) carrinho.alterarQuantidade(item.produtoId, n);
            }}
            keyboardType="number-pad"
            selectTextOnFocus
          />
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => carrinho.alterarQuantidade(item.produtoId, item.quantidade + 1)}
          >
            <Ionicons name="add" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Preço unitário editável */}
        <View style={styles.precoWrap}>
          <Text style={styles.precoLabel}>R$</Text>
          <TextInput
            style={styles.precoInput}
            value={precoStr}
            onChangeText={handlePrecoChange}
            onBlur={handlePrecoBlur}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
        </View>

        {/* Subtotal */}
        <Text style={styles.itemSubtotal}>{fmt(subtotal)}</Text>

        {/* Remover */}
        <TouchableOpacity onPress={() => carrinho.removerItem(item.produtoId)}>
          <Ionicons name="trash-outline" size={18} color={COLORS.error} />
        </TouchableOpacity>
      </View>

      {/* Custo calculado (informativo) */}
      <Text style={styles.itemCusto}>
        Custo: {fmt(item.custoCalculado)} · Margem: {fmt(item.precoUnitario - item.custoCalculado)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { flexGrow: 1, padding: SPACING.md, gap: SPACING.sm, paddingBottom: SPACING.sm },

  // Seções
  section: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  sectionLabel: {
    fontSize: FONT.sm, fontWeight: '700',
    color: COLORS.textSecondary, textTransform: 'uppercase',
    letterSpacing: 0.5, marginBottom: SPACING.sm,
  },
  stepBadge: {
    backgroundColor: COLORS.primary, color: '#fff',
    fontSize: FONT.xs, fontWeight: '800',
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: RADIUS.full,
  },

  // Data
  dataRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.md,
  },
  dataBtn: {
    width: 36, height: 36, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  dataInputWrap: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs,
    backgroundColor: COLORS.background, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  dataInput: {
    flex: 1, fontSize: FONT.md, fontWeight: '700', color: COLORS.text,
    textAlign: 'center', padding: 0,
  },

  // Cliente selecionado
  clienteSelecionado: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md, padding: SPACING.sm,
  },
  clienteNome: { flex: 1, fontSize: FONT.md, fontWeight: '600', color: COLORS.primary },

  // Busca
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    gap: SPACING.xs, marginBottom: SPACING.xs,
  },
  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs + 2,
    gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONT.md, color: COLORS.text, padding: 0 },
  cameraBtn: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },

  // Picker dropdown
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
  pickerItemSub: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  pickerVazio: {
    padding: SPACING.md, textAlign: 'center',
    fontSize: FONT.sm, color: COLORS.textSecondary,
  },
  fecharPicker: {
    padding: SPACING.sm, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  fecharPickerText: { fontSize: FONT.xs, color: COLORS.textSecondary },

  // Carrinho vazio
  carrinhoVazio: {
    alignItems: 'center', paddingVertical: SPACING.lg, gap: SPACING.xs,
  },
  carrinhoVazioText: { fontSize: FONT.sm, color: COLORS.textSecondary },

  // Item do carrinho
  itemCard: {
    backgroundColor: COLORS.background, borderRadius: RADIUS.md,
    padding: SPACING.sm, marginBottom: SPACING.xs,
    borderWidth: 1, borderColor: COLORS.divider,
  },
  itemNome: { fontSize: FONT.sm, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
  },
  qtyWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.primary,
    borderRadius: RADIUS.sm, overflow: 'hidden',
  },
  qtyBtn: {
    width: 28, height: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.primaryLight,
  },
  qtyInput: {
    width: 36, textAlign: 'center',
    fontSize: FONT.sm, fontWeight: '700', color: COLORS.text,
    paddingVertical: 4,
  },
  precoWrap: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1.5, borderColor: COLORS.border,
    borderRadius: RADIUS.sm, paddingHorizontal: SPACING.xs,
  },
  precoLabel: { fontSize: FONT.xs, color: COLORS.textSecondary, marginRight: 2 },
  precoInput: {
    width: 60, fontSize: FONT.sm, fontWeight: '700',
    color: COLORS.text, paddingVertical: 4,
    textAlign: 'right',
  },
  itemSubtotal: {
    flex: 1, textAlign: 'right',
    fontSize: FONT.md, fontWeight: '800', color: COLORS.primary,
  },
  itemCusto: {
    fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 4,
  },

  // Limpar carrinho
  limparCarrinhoBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: SPACING.sm, marginTop: SPACING.xs,
  },
  limparCarrinhoBtnText: { fontSize: FONT.xs, color: COLORS.error, fontWeight: '600' },

  // Footer Total + Finalizar — sticky, fora do ScrollView
  footerCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.lg,
    borderTopRightRadius: RADIUS.lg,
    padding: SPACING.md,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: COLORS.border,
    gap: SPACING.sm,
  },
  totalRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  totalLabel: { fontSize: FONT.lg, fontWeight: '600', color: COLORS.textSecondary },
  totalValue: { fontSize: FONT.xxl, fontWeight: '800', color: COLORS.text },
  finalizarBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', padding: SPACING.md + 2, gap: SPACING.sm,
  },
  finalizarBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '800' },

  // Modal pagamento
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: SPACING.md,
  },
  modalTitulo: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  modalTotal: { fontSize: 40, fontWeight: '800', color: COLORS.text, textAlign: 'center' },
  modalTotalLabel: { fontSize: FONT.sm, color: COLORS.textSecondary, textAlign: 'center', marginBottom: SPACING.lg },
  modalSectionTitle: {
    fontSize: FONT.sm, fontWeight: '600', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.sm,
  },
  formasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.lg },
  formaBadge: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full, borderWidth: 1.5,
    borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  formaBadgeSelected: { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  formaBadgeText: { fontSize: FONT.sm, color: COLORS.textSecondary, fontWeight: '500' },
  formaBadgeTextSelected: { color: COLORS.primary, fontWeight: '700' },
  confirmarBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', padding: SPACING.md + 2, gap: SPACING.sm,
  },
  confirmarBtnDisabled: { opacity: 0.5 },
  confirmarBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '800' },
});
