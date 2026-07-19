import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  FlatList, ScrollView, Modal, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import useCarrinhoStore from '../stores/useCarrinhoStore';
import { finalizarVenda } from '../services/vendaService';
import ScannerModal from '../components/ScannerModal';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;

const fmtData = (date) => {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Máscara de moeda: recebe o texto atual do input, extrai dígitos e formata como "XX,XX"
const mascaraPreco = (text) => {
  const nums = text.replace(/\D/g, '');
  if (!nums) return '0,00';
  const val = parseInt(nums, 10);
  return (val / 100).toFixed(2).replace('.', ',');
};

// Converte float para string mascarada: 25.5 -> "25,50"
const floatParaMascara = (value) => {
  const cents = Math.round(Number(value || 0) * 100);
  return (cents / 100).toFixed(2).replace('.', ',');
};

// =============================================================================
// PASSO 1: Seletor de Cliente reativo
// =============================================================================
const ClientesPickerBase = ({ pessoas, searchCliente, onSelecionar, onCadastrarNovo }) => (
  // nestedScrollEnabled resolve o conflito de FlatList dentro de ScrollView
  <FlatList
    data={pessoas}
    keyExtractor={p => p.id}
    keyboardShouldPersistTaps="handled"
    style={styles.pickerList}
    nestedScrollEnabled={true}
    renderItem={({ item }) => (
      <TouchableOpacity style={styles.pickerItem} onPress={() => onSelecionar(item)}>
        <Ionicons name="person-outline" size={16} color={COLORS.primary} />
        <Text style={styles.pickerItemText} numberOfLines={0}>{item.nome}</Text>
      </TouchableOpacity>
    )}
    ListEmptyComponent={
      searchCliente?.trim().length > 0 ? (
        <TouchableOpacity
          style={styles.cadastrarClienteBtn}
          onPress={() => onCadastrarNovo(searchCliente.trim())}
        >
          <Ionicons name="person-add-outline" size={18} color={COLORS.primary} />
          <Text style={styles.cadastrarClienteBtnText} numberOfLines={2}>
            Cadastrar cliente "{searchCliente.trim()}"
          </Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.pickerVazio}>Nenhum cliente encontrado</Text>
      )
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
  // nestedScrollEnabled resolve o conflito de FlatList dentro de ScrollView
  <FlatList
    data={produtos}
    keyExtractor={p => p.id}
    keyboardShouldPersistTaps="handled"
    style={styles.pickerList}
    nestedScrollEnabled={true}
    renderItem={({ item }) => (
      <TouchableOpacity style={styles.pickerItem} onPress={() => onSelecionar(item)}>
        <View style={{ flex: 1 }}>
          {/* numberOfLines={0} permite quebra de linha natural sem truncar */}
          <Text style={styles.pickerItemText} numberOfLines={0}>{item.descricao}</Text>
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
  const navigation = useNavigation();
  const route = useRoute();
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

  // DateTimePicker nativo — estado separado da data do carrinho
  const [showDatePicker, setShowDatePicker] = useState(false);

  const onDateChange = useCallback((event, selectedDate) => {
    setShowDatePicker(false);
    if (selectedDate && event.type !== 'dismissed') {
      carrinho.setDataVenda(selectedDate);
    }
  }, [carrinho]);

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

  // NC-82: retorno do cadastro rápido de cliente (aberto a partir da busca sem
  // resultado) — seleciona o cliente recém-criado sem perder o carrinho (o
  // carrinho vive no Zustand, fora da árvore de navegação).
  useEffect(() => {
    const novoId = route.params?.clienteRecemCriadoId;
    if (!novoId) return;
    (async () => {
      try {
        const pessoa = await db.get('pessoas').find(novoId);
        carrinho.setCliente(pessoa.id, pessoa.nome);
      } catch (_) { /* cliente pode ter sido removido entre a criação e o retorno */ }
      navigation.setParams({ clienteRecemCriadoId: undefined });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.params?.clienteRecemCriadoId]);

  // ── Handlers: cabeçalho ────────────────────────────────────────────────────
  const handleSelecionarCliente = (cliente) => {
    carrinho.setCliente(cliente.id, cliente.nome);
    setSearchCliente('');
    setShowClientes(false);
  };

  const handleCadastrarNovoCliente = (nomeDigitado) => {
    setShowClientes(false);
    navigation.navigate('CadastrarPessoa', {
      tipoInicial: 'C',
      nomePreenchido: nomeDigitado,
      origemPDV: true,
    });
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
    // Preserva a data selecionada antes de limpar o carrinho
    const dataSalva = carrinho.dataVenda;
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
      // Restaura a data — ela só volta para "hoje" quando a tela for montada novamente
      carrinho.setDataVenda(dataSalva);
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
    // KeyboardAvoidingView garante que o footer sobe junto com o teclado
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >

        {/* ── CABEÇALHO: Data da Venda (ícone de calendário discreto) ── */}
        <View style={[styles.section, SHADOW.sm]}>
          <Text style={styles.sectionLabel}>Data da Venda</Text>
          <TouchableOpacity
            style={styles.dataCalendarBtn}
            onPress={() => setShowDatePicker(true)}
            activeOpacity={0.7}
          >
            <Ionicons name="calendar-outline" size={20} color={COLORS.primary} />
            <Text style={styles.dataText}>{fmtData(carrinho.dataVenda)}</Text>
            <Ionicons name="chevron-down-outline" size={16} color={COLORS.textSecondary} />
          </TouchableOpacity>

          {showDatePicker && (
            <DateTimePicker
              value={carrinho.dataVenda instanceof Date ? carrinho.dataVenda : new Date(carrinho.dataVenda)}
              mode="date"
              display="default"
              onChange={onDateChange}
            />
          )}
        </View>

        {/* ── PASSO 1: Cliente ── */}
        <View style={[styles.section, SHADOW.sm]}>
          <Text style={styles.sectionLabel}>  Cliente</Text>

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
                    onCadastrarNovo={handleCadastrarNovoCliente}
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
          <Text style={styles.sectionLabel}>  Produtos</Text>

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
                  key={item.itemId}
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

      {/* ── TOTAL + FINALIZAR — sticky, fora do ScrollView, sobe com o teclado ── */}
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
// Item do Carrinho com máscara de preço em tempo real
// =============================================================================
function ItemCarrinho({ item, carrinho }) {
  const [precoStr, setPrecoStr] = useState(() => floatParaMascara(item.precoUnitario));

  // onChangeText com máscara de moeda brasileira — recalcula total a cada dígito
  const handlePrecoChange = (text) => {
    const masked = mascaraPreco(text);
    setPrecoStr(masked);
    // itemId identifica a linha correta mesmo com múltiplos itens do mesmo produto
    carrinho.alterarPreco(item.itemId, masked);
  };

  const subtotal = item.quantidade * item.precoUnitario;

  return (
    <View style={styles.itemCard}>
      {/* numberOfLines={0} com flex: 1 permite quebra de linha natural */}
      <Text style={styles.itemNome} numberOfLines={0}>{item.descricao}</Text>

      <View style={styles.itemRow}>
        {/* Quantidade editável */}
        <View style={styles.qtyWrap}>
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => carrinho.alterarQuantidade(item.itemId, item.quantidade - 1)}
          >
            <Ionicons name="remove" size={14} color={COLORS.primary} />
          </TouchableOpacity>
          <TextInput
            style={styles.qtyInput}
            value={String(item.quantidade)}
            onChangeText={v => {
              const n = parseInt(v, 10);
              if (!isNaN(n)) carrinho.alterarQuantidade(item.itemId, n);
            }}
            keyboardType="number-pad"
            selectTextOnFocus
          />
          <TouchableOpacity
            style={styles.qtyBtn}
            onPress={() => carrinho.alterarQuantidade(item.itemId, item.quantidade + 1)}
          >
            <Ionicons name="add" size={14} color={COLORS.primary} />
          </TouchableOpacity>
        </View>

        {/* Preço unitário com máscara R$ — atualiza o total em tempo real */}
        <View style={styles.precoWrap}>
          <Text style={styles.precoLabel}>R$</Text>
          <TextInput
            style={styles.precoInput}
            value={precoStr}
            onChangeText={handlePrecoChange}
            keyboardType="number-pad"
            selectTextOnFocus
          />
        </View>

        {/* Subtotal */}
        <Text style={styles.itemSubtotal}>{fmt(subtotal)}</Text>

        {/* Remover */}
        <TouchableOpacity onPress={() => carrinho.removerItem(item.itemId)}>
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
  // flexGrow: 1 garante que o conteúdo expande e empurra o footer para baixo
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

  // Data — botão compacto com ícone de calendário
  dataCalendarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    backgroundColor: COLORS.primaryLight,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  dataText: {
    fontSize: FONT.md, fontWeight: '700', color: COLORS.primary,
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

  // Picker dropdown — nestedScrollEnabled é aplicado diretamente na FlatList
  pickerContainer: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    overflow: 'hidden', maxHeight: 220,
    marginBottom: SPACING.sm,
  },
  pickerList: { maxHeight: 180 },
  pickerItem: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    padding: SPACING.sm + 2,
    borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  // flex: 1 no container do texto garante que o nome quebre em vez de ser truncado
  pickerItemText: { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  pickerItemSub: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  pickerVazio: {
    padding: SPACING.md, textAlign: 'center',
    fontSize: FONT.sm, color: COLORS.textSecondary,
  },
  cadastrarClienteBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, padding: SPACING.md,
  },
  cadastrarClienteBtnText: {
    flex: 1, fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary,
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
  // flex: 1 + numberOfLines={0} no componente permitem quebra de linha livre
  itemNome: { flex: 1, fontSize: FONT.sm, fontWeight: '600', color: COLORS.text, marginBottom: 6 },
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

  // Footer Total + Finalizar — sticky fora do ScrollView, sobe com o teclado via KAV
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
