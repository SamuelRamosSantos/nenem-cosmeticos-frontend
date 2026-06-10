import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Alert, ActivityIndicator, Modal, FlatList, Switch, TextInput,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import FormInput from '../components/FormInput';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

// Custo real baseado no percentual de comissão da marca
// Custo = Preço - (Preço × Comissão / 100)  →  Custo = Preço × (1 - Comissão/100)
function calcularCusto(precoStr, percentualComissao = 0) {
  const preco = parseFloat(String(precoStr).replace(',', '.'));
  if (isNaN(preco) || preco <= 0) return '';
  return (preco * (1 - percentualComissao / 100)).toFixed(2);
}

export default function CadastrarProdutoScreen({ route }) {
  const database   = useDatabase();
  const navigation = useNavigation();
  const editando   = route.params?.produto;

  const [descricao,        setDescricao]       = useState(editando?.descricao ?? '');
  const [precoVenda,       setPrecoVenda]       = useState(editando?.precoVenda?.toFixed(2) ?? '');
  const [custoPreco,       setCustoPreco]       = useState('');
  const [codBarras,        setCodBarras]        = useState(editando?.codBarras ?? '');
  const [tipoBaixa,        setTipoBaixa]        = useState(editando?.tipoBaixa ?? 'I');
  const [movimentaEstoque, setMovimentaEstoque] = useState(
    editando ? editando.movimentaEstoque !== false : true
  );

  const [marcaSelecionada, setMarcaSelecionada] = useState(null);
  const [marcas,           setMarcas]           = useState([]);
  const [showMarcaPicker,  setShowMarcaPicker]  = useState(false);

  // Kit (tipo_baixa === 'M')
  const [kitItens,      setKitItens]      = useState([]);
  const [searchKit,     setSearchKit]     = useState('');
  const [kitResultados, setKitResultados] = useState([]);

  const [loading, setLoading] = useState(false);

  // Recalcula custo sempre que preço ou marca mudam
  const recalcularCusto = useCallback((precoStr, marca) => {
    setCustoPreco(calcularCusto(precoStr, marca?.percentualComissao ?? 0));
  }, []);

  useFocusEffect(
    useCallback(() => {
      const init = async () => {
        const lista = await database.get('marcas').query(Q.where('ativo', true)).fetch();
        setMarcas(lista);

        // Tenta carregar a marca do produto em edição
        if (editando?.marcaId) {
          const m = lista.find(m => m.id === editando.marcaId);
          if (m) {
            setMarcaSelecionada(m);
            setCustoPreco(calcularCusto(editando.precoVenda?.toFixed(2), m.percentualComissao));
          } else {
            // Marca inativa / deletada — sem marca selecionada
            setCustoPreco(calcularCusto(editando.precoVenda?.toFixed(2), 0));
          }
        } else {
          setCustoPreco(calcularCusto(editando?.precoVenda?.toFixed(2), 0));
        }

        // Kit items em edição
        if (editando?.tipoBaixa === 'M') {
          const existentes = await database
            .get('produto_kit_itens')
            .query(Q.where('produto_mestre_id', editando.id))
            .fetch();
          const comProdutos = await Promise.all(
            existentes.map(async ki => {
              const produto = await database.get('produtos').find(ki.produtoIndividualId);
              return { produto, quantidade: ki.quantidadeNecessaria };
            })
          );
          setKitItens(comProdutos);
        }
      };
      init();
    }, [database, editando])
  );

  // Recalcula custo ao entrar em modo de edição quando marcaSelecionada é carregada
  useEffect(() => {
    if (editando && precoVenda) {
      recalcularCusto(precoVenda, marcaSelecionada);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcaSelecionada?.id, editando?.id]);

  // Busca dinâmica de produtos individuais para o kit
  useEffect(() => {
    if (tipoBaixa !== 'M' || !searchKit.trim()) { setKitResultados([]); return; }
    const addedIds = new Set(kitItens.map(ki => ki.produto.id));
    database
      .get('produtos')
      .query(Q.where('tipo_baixa', 'I'), Q.where('descricao', Q.like(`%${searchKit.trim()}%`)))
      .fetch()
      .then(r => setKitResultados(r.filter(p => !addedIds.has(p.id))));
  }, [searchKit, tipoBaixa, database, kitItens]);

  // Handler: preço digitado
  const handlePrecoChange = (text) => {
    const limpo = text.replace(/[^0-9.,]/g, '');
    setPrecoVenda(limpo);
    recalcularCusto(limpo, marcaSelecionada);
  };

  // Handler: marca selecionada no picker
  const handleSelecionarMarca = (marca) => {
    setMarcaSelecionada(marca);
    recalcularCusto(precoVenda, marca);
    setShowMarcaPicker(false);
  };

  // Handler: remover marca
  const handleRemoverMarca = () => {
    setMarcaSelecionada(null);
    recalcularCusto(precoVenda, null);
  };

  // Kit handlers
  const adicionarAoKit = (produto) => {
    setKitItens(prev => [...prev, { produto, quantidade: 1 }]);
    setSearchKit(''); setKitResultados([]);
  };
  const removerDoKit  = (id)   => setKitItens(prev => prev.filter(ki => ki.produto.id !== id));
  const alterarQtdKit = (id, delta) =>
    setKitItens(prev => prev.map(ki =>
      ki.produto.id === id ? { ...ki, quantidade: Math.max(1, ki.quantidade + delta) } : ki
    ));

  // Código interno sequencial
  const proximoCodigoInterno = async () => {
    const todos = await database.get('produtos').query().fetch();
    const max   = todos.reduce((acc, p) => {
      const n = parseInt(p.codigoInterno, 10);
      return isNaN(n) ? acc : Math.max(acc, n);
    }, 0);
    return String(max + 1);
  };

  const handleSalvar = async () => {
    if (!descricao.trim()) {
      Alert.alert('Atenção', 'O nome do produto é obrigatório.');
      return;
    }
    const preco = parseFloat(precoVenda.replace(',', '.'));
    if (isNaN(preco) || preco <= 0) {
      Alert.alert('Atenção', 'Informe um preço de venda válido.');
      return;
    }
    if (tipoBaixa === 'M' && kitItens.length === 0) {
      Alert.alert('Atenção', 'Adicione pelo menos um item ao kit.');
      return;
    }

    const comissao = marcaSelecionada?.percentualComissao ?? 0;
    const custo    = preco * (1 - comissao / 100);

    setLoading(true);
    try {
      let productId = editando?.id;

      if (editando) {
        await database.write(async () => {
          await editando.update(p => {
            p.descricao        = descricao.trim();
            p.marcaId          = marcaSelecionada?.id ?? null;
            p.precoVenda       = preco;
            p.custoPreco       = custo;
            p.codBarras        = codBarras.replace(/\D/g, '') || null;
            p.tipoBaixa        = tipoBaixa;
            p.movimentaEstoque = movimentaEstoque;
          });
        });
      } else {
        const novoCodigo = await proximoCodigoInterno();
        const newProd = await database.write(async () =>
          database.get('produtos').create(p => {
            p.descricao        = descricao.trim();
            p.marcaId          = marcaSelecionada?.id ?? null;
            p.precoVenda       = preco;
            p.custoPreco       = custo;
            p.codBarras        = codBarras.replace(/\D/g, '') || null;
            p.codigoInterno    = novoCodigo;
            p.tipoBaixa        = tipoBaixa;
            p.movimentaEstoque = movimentaEstoque;
            p.qtdEstoque       = 0;
            p.ativo            = true;
          })
        );
        productId = newProd.id;
      }

      if (tipoBaixa === 'M') {
        await database.write(async () => {
          if (editando) {
            const existentes = await database
              .get('produto_kit_itens')
              .query(Q.where('produto_mestre_id', productId))
              .fetch();
            for (const ki of existentes) await ki.destroyPermanently();
          }
          for (const ki of kitItens) {
            await database.get('produto_kit_itens').create(pki => {
              pki.produtoMestreId      = productId;
              pki.produtoIndividualId  = ki.produto.id;
              pki.quantidadeNecessaria = ki.quantidade;
            });
          }
        });
      }

      navigation.goBack();
    } catch (err) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.card, SHADOW.sm]}>

          {/* Código interno (read-only em edição) */}
          {editando && (
            <View style={styles.codigoRow}>
              <Ionicons name="barcode-outline" size={16} color={COLORS.textSecondary} />
              <Text style={styles.codigoLabel}>Cód. Interno:</Text>
              <Text style={styles.codigoValue}>#{editando.codigoInterno ?? '—'}</Text>
            </View>
          )}

          <FormInput
            label="Nome do Produto"
            required
            value={descricao}
            onChangeText={setDescricao}
            placeholder="Ex: Creme Hidratante 200ml"
            autoCapitalize="sentences"
          />

          {/* Seletor de Marca (opcional) */}
          <View style={styles.field}>
            <Text style={styles.label}>Marca</Text>
            {marcaSelecionada ? (
              <View style={styles.marcaChip}>
                <Ionicons name="pricetag" size={14} color={COLORS.primary} />
                <Text style={styles.marcaChipText}>{marcaSelecionada.nome}</Text>
                <Text style={styles.marcaChipComissao}>
                  {marcaSelecionada.percentualComissao}% comissão
                </Text>
                <TouchableOpacity onPress={handleRemoverMarca} style={{ marginLeft: 'auto' }}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setShowMarcaPicker(true)}>
                  <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.pickerBtnVazio}
                onPress={() => setShowMarcaPicker(true)}
              >
                <Text style={styles.pickerPlaceholder}>Sem marca (comissão 0%)</Text>
                <Ionicons name="chevron-down" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}
          </View>

          {/* Preço de venda — números/decimal apenas */}
          <FormInput
            label="Preço de Venda (R$)"
            required
            value={precoVenda}
            onChangeText={handlePrecoChange}
            placeholder="0,00"
            keyboardType="decimal-pad"
          />

          {/* Custo — read-only, calculado em tempo real */}
          <FormInput
            label="Custo / Repasse (R$)"
            value={custoPreco}
            editable={false}
            placeholder="Calculado automaticamente"
            style={styles.inputReadOnly}
            hint={`Preço × (1 - ${marcaSelecionada?.percentualComissao ?? 0}% / 100)`}
          />

          {/* Cód. de Barras — só dígitos */}
          <FormInput
            label="Cód. de Barras (opcional)"
            value={codBarras}
            onChangeText={v => setCodBarras(v.replace(/\D/g, ''))}
            placeholder="Somente números"
            keyboardType="number-pad"
          />

          {/* Toggle tipo de baixa */}
          <View style={styles.field}>
            <Text style={styles.label}>Tipo de Baixa no Estoque</Text>
            <View style={styles.toggleRow}>
              {[
                { key: 'I', label: 'Individual', icon: 'cube-outline' },
                { key: 'M', label: 'Kit (Mestre)', icon: 'layers-outline' },
              ].map(opt => (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.toggleBtn, tipoBaixa === opt.key && styles.toggleBtnActive]}
                  onPress={() => setTipoBaixa(opt.key)}
                >
                  <Ionicons
                    name={opt.icon}
                    size={16}
                    color={tipoBaixa === opt.key ? COLORS.primary : COLORS.textSecondary}
                  />
                  <Text style={[styles.toggleText, tipoBaixa === opt.key && styles.toggleTextActive]}>
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Switch movimenta estoque */}
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchLabel}>Movimenta Estoque</Text>
              <Text style={styles.switchHint}>
                {movimentaEstoque ? 'Baixa o estoque nas vendas' : 'Ignora movimentações de estoque'}
              </Text>
            </View>
            <Switch
              value={movimentaEstoque}
              onValueChange={setMovimentaEstoque}
              trackColor={{ false: COLORS.border, true: COLORS.primaryLight }}
              thumbColor={movimentaEstoque ? COLORS.primary : '#ccc'}
            />
          </View>
        </View>

        {/* Seção Itens do Kit */}
        {tipoBaixa === 'M' && (
          <View style={[styles.card, SHADOW.sm]}>
            <Text style={styles.sectionTitle}>Itens do Kit</Text>
            <Text style={styles.sectionSub}>Busque produtos individuais para compor este kit</Text>

            <View style={styles.kitSearchBar}>
              <Ionicons name="search-outline" size={16} color={COLORS.textSecondary} />
              <TextInput
                style={styles.kitSearchInput}
                placeholder="Buscar produto individual..."
                placeholderTextColor={COLORS.textLight}
                value={searchKit}
                onChangeText={setSearchKit}
              />
              {searchKit.length > 0 && (
                <TouchableOpacity onPress={() => setSearchKit('')}>
                  <Ionicons name="close-circle" size={16} color={COLORS.textLight} />
                </TouchableOpacity>
              )}
            </View>

            {kitResultados.length > 0 && (
              <View style={styles.kitResultados}>
                {kitResultados.map(p => (
                  <TouchableOpacity key={p.id} style={styles.kitResultItem} onPress={() => adicionarAoKit(p)}>
                    <Text style={styles.kitResultNome} numberOfLines={1}>{p.descricao}</Text>
                    <Ionicons name="add-circle" size={22} color={COLORS.primary} />
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {kitItens.length === 0 ? (
              <View style={styles.kitVazio}>
                <Ionicons name="layers-outline" size={36} color={COLORS.textLight} />
                <Text style={styles.kitVazioText}>Nenhum item no kit</Text>
              </View>
            ) : (
              kitItens.map(ki => (
                <View key={ki.produto.id} style={styles.kitItem}>
                  <View style={styles.kitItemIcon}>
                    <Ionicons name="cube-outline" size={16} color={COLORS.primary} />
                  </View>
                  <Text style={styles.kitItemNome} numberOfLines={1}>{ki.produto.descricao}</Text>
                  <View style={styles.kitQtyRow}>
                    <TouchableOpacity style={styles.kitQtyBtn} onPress={() => alterarQtdKit(ki.produto.id, -1)}>
                      <Ionicons name="remove" size={14} color={COLORS.primary} />
                    </TouchableOpacity>
                    <Text style={styles.kitQtyText}>{ki.quantidade}</Text>
                    <TouchableOpacity style={styles.kitQtyBtn} onPress={() => alterarQtdKit(ki.produto.id, 1)}>
                      <Ionicons name="add" size={14} color={COLORS.primary} />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={{ padding: 4 }} onPress={() => removerDoKit(ki.produto.id)}>
                    <Ionicons name="trash-outline" size={18} color={COLORS.error} />
                  </TouchableOpacity>
                </View>
              ))
            )}
          </View>
        )}

        <TouchableOpacity
          style={[styles.salvarBtn, loading && styles.disabled, SHADOW.md]}
          onPress={handleSalvar}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={22} color="#fff" />
              <Text style={styles.salvarBtnText}>
                {editando ? 'Atualizar Produto' : 'Cadastrar Produto'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Modal seletor de marcas */}
      <Modal visible={showMarcaPicker} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, SHADOW.lg]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Selecionar Marca</Text>
              <TouchableOpacity onPress={() => setShowMarcaPicker(false)}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <FlatList
              data={marcas}
              keyExtractor={m => m.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.marcaItem} onPress={() => handleSelecionarMarca(item)}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.marcaItemNome}>{item.nome}</Text>
                    <Text style={styles.marcaItemComissao}>{item.percentualComissao}% de comissão</Text>
                  </View>
                  {marcaSelecionada?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={22} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
              ListHeaderComponent={
                <TouchableOpacity style={styles.marcaItem} onPress={() => { handleRemoverMarca(); setShowMarcaPicker(false); }}>
                  <Ionicons name="close-circle-outline" size={20} color={COLORS.textSecondary} />
                  <Text style={[styles.marcaItemNome, { color: COLORS.textSecondary, marginLeft: SPACING.sm }]}>
                    Sem Marca (comissão 0%)
                  </Text>
                </TouchableOpacity>
              }
              ListFooterComponent={
                <TouchableOpacity style={styles.novaMarcaBtn}
                  onPress={() => { setShowMarcaPicker(false); navigation.navigate('CadastrarMarca'); }}
                >
                  <Ionicons name="add-circle-outline" size={18} color={COLORS.primary} />
                  <Text style={styles.novaMarcaBtnText}>Cadastrar nova marca</Text>
                </TouchableOpacity>
              }
              ListEmptyComponent={
                <View style={styles.marcaVazia}>
                  <Text style={styles.marcaVaziaText}>Nenhuma marca cadastrada.</Text>
                </View>
              }
            />
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { flexGrow: 1, padding: SPACING.md, paddingBottom: SPACING.xl },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    padding: SPACING.md, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
  },
  codigoRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginBottom: SPACING.md, backgroundColor: COLORS.background,
    borderRadius: RADIUS.sm, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
  },
  codigoLabel: { fontSize: FONT.sm, color: COLORS.textSecondary },
  codigoValue: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },
  field: { marginBottom: SPACING.md },
  label: {
    fontSize: FONT.sm, fontWeight: '600', color: COLORS.textSecondary,
    marginBottom: SPACING.xs, textTransform: 'uppercase', letterSpacing: 0.3,
  },
  marcaChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  marcaChipText:     { fontSize: FONT.md, fontWeight: '600', color: COLORS.primary, flex: 1 },
  marcaChipComissao: { fontSize: FONT.xs, color: COLORS.primary },
  pickerBtnVazio: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1.5, borderColor: COLORS.border, borderStyle: 'dashed',
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
  },
  pickerPlaceholder: { fontSize: FONT.md, color: COLORS.textLight },
  inputReadOnly: {
    backgroundColor: COLORS.background, borderColor: COLORS.divider, color: COLORS.textSecondary,
  },
  toggleRow: { flexDirection: 'row', gap: SPACING.sm },
  toggleBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: SPACING.sm, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border, backgroundColor: COLORS.surface,
  },
  toggleBtnActive:  { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  toggleText:       { fontSize: FONT.sm, color: COLORS.textSecondary, fontWeight: '500' },
  toggleTextActive: { color: COLORS.primary, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: SPACING.xs, marginTop: SPACING.xs },
  switchLabel: { fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
  switchHint:  { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  sectionTitle: { fontSize: FONT.md, fontWeight: '700', color: COLORS.text, marginBottom: 2 },
  sectionSub:   { fontSize: FONT.xs, color: COLORS.textSecondary, marginBottom: SPACING.md },
  kitSearchBar: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 2,
    gap: SPACING.xs, borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm,
  },
  kitSearchInput: { flex: 1, fontSize: FONT.md, color: COLORS.text, padding: 0 },
  kitResultados: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, marginBottom: SPACING.sm, overflow: 'hidden',
  },
  kitResultItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.sm, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  kitResultNome: { fontSize: FONT.sm, color: COLORS.text, flex: 1, marginRight: SPACING.sm },
  kitVazio:      { alignItems: 'center', paddingVertical: SPACING.lg, gap: SPACING.xs },
  kitVazioText:  { fontSize: FONT.sm, color: COLORS.textLight },
  kitItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.sm, borderBottomWidth: 1,
    borderBottomColor: COLORS.divider, gap: SPACING.sm,
  },
  kitItemIcon: {
    width: 28, height: 28, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  kitItemNome: { flex: 1, fontSize: FONT.sm, color: COLORS.text },
  kitQtyRow:   { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kitQtyBtn: {
    width: 26, height: 26, borderRadius: RADIUS.full,
    borderWidth: 1.5, borderColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  kitQtyText: {
    fontSize: FONT.sm, fontWeight: '700', color: COLORS.text,
    minWidth: 20, textAlign: 'center',
  },
  salvarBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md + 2, gap: SPACING.sm,
  },
  disabled:     { opacity: 0.6 },
  salvarBtnText:{ color: '#fff', fontSize: FONT.lg, fontWeight: '800' },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl, maxHeight: '75%', paddingBottom: SPACING.xl,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  modalTitulo:       { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  marcaItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  marcaItemNome:     { fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
  marcaItemComissao: { fontSize: FONT.sm, color: COLORS.textSecondary, marginTop: 2 },
  novaMarcaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    padding: SPACING.md, borderTopWidth: 1, borderTopColor: COLORS.divider,
  },
  novaMarcaBtnText: { fontSize: FONT.md, color: COLORS.primary, fontWeight: '600' },
  marcaVazia:     { alignItems: 'center', padding: SPACING.xl },
  marcaVaziaText: { fontSize: FONT.md, color: COLORS.textSecondary },
});
