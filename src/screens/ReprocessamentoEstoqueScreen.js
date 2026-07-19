import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Alert, ActivityIndicator, Modal, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { calcularDivergencias, aplicarCorrecoes } from '../services/reprocessamentoService';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const fmtData = (d) =>
  `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

// =============================================================================
// Tela de Reprocessamento de Estoque (NC-59/60/61)
//
// Fluxo:
//   1. Usuário escolhe filtros (período, marca, produto específico ou todos)
//   2. "Analisar" roda calcularDivergencias() — só lê, não grava nada
//   3. Preview: Produto | Saldo Atual (Incorreto) | Novo Saldo Calculado
//   4. "Confirmar e Corrigir" aplica de fato (aplicarCorrecoes)
// =============================================================================
export default function ReprocessamentoEstoqueScreen() {
  const db = useDatabase();

  // ── Filtros ──────────────────────────────────────────────────────────────
  const [usarPeriodo,   setUsarPeriodo]   = useState(false);
  const [dataInicial,   setDataInicial]   = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d;
  });
  const [dataFinal,     setDataFinal]     = useState(() => {
    const d = new Date(); d.setHours(23, 59, 59, 999); return d;
  });
  const [showPickerIni, setShowPickerIni] = useState(false);
  const [showPickerFim, setShowPickerFim] = useState(false);

  const [marcas,          setMarcas]          = useState([]);
  const [marcaSelecionada, setMarcaSelecionada] = useState(null); // null = todas as marcas
  const [showMarcaPicker,  setShowMarcaPicker]  = useState(false);

  const [escopoProduto,   setEscopoProduto]   = useState('todos'); // 'todos' | 'especifico'
  const [produtoSelecionado, setProdutoSelecionado] = useState(null);
  const [buscaProduto,    setBuscaProduto]    = useState('');
  const [resultadosBusca, setResultadosBusca] = useState([]);

  // ── Resultado ────────────────────────────────────────────────────────────
  const [analisando,   setAnalisando]   = useState(false);
  const [aplicando,    setAplicando]    = useState(false);
  const [divergencias, setDivergencias] = useState(null); // null = ainda não analisado
  const [jaAnalisouUmaVez, setJaAnalisouUmaVez] = useState(false);

  // Carrega marcas sob demanda ao abrir o seletor
  const abrirMarcaPicker = async () => {
    if (marcas.length === 0) {
      const lista = await db.get('marcas').query(Q.where('ativo', true)).fetch();
      setMarcas(lista);
    }
    setShowMarcaPicker(true);
  };

  // Busca reativa de produto específico
  const buscarProduto = async (texto) => {
    setBuscaProduto(texto);
    const s = texto.trim();
    if (!s) { setResultadosBusca([]); return; }
    const lista = await db.get('produtos').query(
      Q.where('ativo', true),
      Q.or(
        Q.where('descricao', Q.like(`%${s}%`)),
        Q.where('cod_barras', s)
      )
    ).fetch();
    setResultadosBusca(lista.slice(0, 8));
  };

  const onDataInicialChange = (event, selectedDate) => {
    setShowPickerIni(false);
    if (selectedDate && event.type !== 'dismissed') {
      const d = new Date(selectedDate); d.setHours(0, 0, 0, 0);
      setDataInicial(d);
    }
  };

  const onDataFinalChange = (event, selectedDate) => {
    setShowPickerFim(false);
    if (selectedDate && event.type !== 'dismissed') {
      const d = new Date(selectedDate); d.setHours(23, 59, 59, 999);
      setDataFinal(d);
    }
  };

  const handleAnalisar = async () => {
    if (escopoProduto === 'especifico' && !produtoSelecionado) {
      Alert.alert('Atenção', 'Selecione um produto específico ou mude o escopo para "Todos os produtos".');
      return;
    }

    setAnalisando(true);
    setDivergencias(null);
    try {
      const resultado = await calcularDivergencias(db, {
        dataInicial: usarPeriodo ? dataInicial : null,
        dataFinal:   usarPeriodo ? dataFinal   : null,
        marcaId:     escopoProduto === 'todos' ? (marcaSelecionada?.id ?? null) : null,
        produtoId:   escopoProduto === 'especifico' ? produtoSelecionado.id : null,
      });
      setDivergencias(resultado);
      setJaAnalisouUmaVez(true);
    } catch (err) {
      Alert.alert('Erro ao analisar', err.message);
    } finally {
      setAnalisando(false);
    }
  };

  const handleConfirmarCorrecao = () => {
    if (!divergencias?.length) return;
    Alert.alert(
      'Confirmar Correção',
      `${divergencias.length} produto(s) terão o estoque corrigido para o saldo real calculado. Essa ação gera movimentações de ajuste e não pode ser desfeita automaticamente. Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar e Corrigir',
          style: 'destructive',
          onPress: async () => {
            setAplicando(true);
            try {
              await aplicarCorrecoes(db, divergencias);
              Alert.alert('Estoque Corrigido!', `${divergencias.length} produto(s) atualizado(s) com sucesso.`);
              setDivergencias([]);
            } catch (err) {
              Alert.alert('Erro ao aplicar correções', err.message);
            } finally {
              setAplicando(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <FlatList
        data={divergencias ?? []}
        keyExtractor={item => item.produto.id}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.filtrosCard}>
            <Text style={styles.secaoTitulo}>FILTROS</Text>

            {/* Período */}
            <View style={styles.filtroLinha}>
              <View style={{ flex: 1 }}>
                <Text style={styles.filtroLabel}>Filtrar por período</Text>
                <Text style={styles.filtroSub}>Restringe a produtos com movimentação no intervalo</Text>
              </View>
              <TouchableOpacity
                style={styles.toggle}
                onPress={() => setUsarPeriodo(v => !v)}
              >
                <Ionicons
                  name={usarPeriodo ? 'checkbox' : 'square-outline'}
                  size={22}
                  color={usarPeriodo ? COLORS.primary : COLORS.textLight}
                />
              </TouchableOpacity>
            </View>

            {usarPeriodo && (
              <View style={styles.periodoRow}>
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPickerIni(true)}>
                  <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.dateBtnText}>{fmtData(dataInicial)}</Text>
                </TouchableOpacity>
                <Ionicons name="arrow-forward-outline" size={16} color={COLORS.textLight} />
                <TouchableOpacity style={styles.dateBtn} onPress={() => setShowPickerFim(true)}>
                  <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
                  <Text style={styles.dateBtnText}>{fmtData(dataFinal)}</Text>
                </TouchableOpacity>
              </View>
            )}
            {showPickerIni && (
              <DateTimePicker value={dataInicial} mode="date" display="default" onChange={onDataInicialChange} />
            )}
            {showPickerFim && (
              <DateTimePicker value={dataFinal} mode="date" display="default" onChange={onDataFinalChange} />
            )}

            {/* Escopo: todos / específico */}
            <Text style={[styles.filtroLabel, { marginTop: SPACING.md }]}>Escopo</Text>
            <View style={styles.escopoRow}>
              <TouchableOpacity
                style={[styles.escopoChip, escopoProduto === 'todos' && styles.escopoChipAtivo]}
                onPress={() => setEscopoProduto('todos')}
              >
                <Text style={[styles.escopoChipText, escopoProduto === 'todos' && styles.escopoChipTextAtivo]}>
                  Todos os Produtos
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.escopoChip, escopoProduto === 'especifico' && styles.escopoChipAtivo]}
                onPress={() => setEscopoProduto('especifico')}
              >
                <Text style={[styles.escopoChipText, escopoProduto === 'especifico' && styles.escopoChipTextAtivo]}>
                  Produto Específico
                </Text>
              </TouchableOpacity>
            </View>

            {/* Categoria (marca) — só faz sentido quando o escopo é "todos" */}
            {escopoProduto === 'todos' && (
              <TouchableOpacity style={styles.pickerBtn} onPress={abrirMarcaPicker}>
                <Ionicons name="pricetag-outline" size={16} color={COLORS.primary} />
                <Text style={styles.pickerBtnText}>
                  {marcaSelecionada ? `Marca: ${marcaSelecionada.nome}` : 'Todas as marcas'}
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.textSecondary} />
              </TouchableOpacity>
            )}

            {/* Produto específico */}
            {escopoProduto === 'especifico' && produtoSelecionado && (
              <View style={styles.produtoChip}>
                <Ionicons name="cube" size={14} color={COLORS.primary} />
                <Text style={styles.produtoChipText} numberOfLines={1}>{produtoSelecionado.descricao}</Text>
                <TouchableOpacity onPress={() => setProdutoSelecionado(null)}>
                  <Ionicons name="close-circle" size={18} color={COLORS.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {/* Botão Analisar */}
            <TouchableOpacity
              style={[styles.analisarBtn, SHADOW.md, analisando && { opacity: 0.6 }]}
              onPress={handleAnalisar}
              disabled={analisando}
            >
              {analisando ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="search-circle-outline" size={20} color="#fff" />
                  <Text style={styles.analisarBtnText}>Analisar Estoque</Text>
                </>
              )}
            </TouchableOpacity>

            {jaAnalisouUmaVez && divergencias !== null && (
              <Text style={styles.resultadoResumo}>
                {divergencias.length === 0
                  ? 'Nenhuma divergência encontrada — estoque consistente.'
                  : `${divergencias.length} produto(s) com saldo divergente:`}
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <View style={[styles.itemCard, SHADOW.sm]}>
            <Text style={styles.itemNome} numberOfLines={2}>{item.produto.descricao}</Text>
            <View style={styles.itemColunas}>
              <View style={styles.coluna}>
                <Text style={styles.colunaLabel}>Saldo Atual (Incorreto)</Text>
                <Text style={[styles.colunaValor, { color: COLORS.error }]}>{item.saldoAtual}</Text>
              </View>
              <Ionicons name="arrow-forward" size={18} color={COLORS.textLight} />
              <View style={styles.coluna}>
                <Text style={styles.colunaLabel}>Novo Saldo Calculado</Text>
                <Text style={[styles.colunaValor, { color: COLORS.success }]}>{item.saldoReal}</Text>
              </View>
            </View>
          </View>
        )}
        ListFooterComponent={<View style={{ height: 120 }} />}
      />

      {divergencias?.length > 0 && (
        <View style={styles.footerWrap}>
          <TouchableOpacity
            style={[styles.confirmarBtn, SHADOW.lg, aplicando && { opacity: 0.6 }]}
            onPress={handleConfirmarCorrecao}
            disabled={aplicando}
          >
            {aplicando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="checkmark-done-circle" size={22} color="#fff" />
                <Text style={styles.confirmarBtnText}>
                  Confirmar e Corrigir ({divergencias.length})
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Modal: selecionar marca */}
      <Modal
        visible={showMarcaPicker}
        animationType="slide"
        transparent
        onRequestClose={() => setShowMarcaPicker(false)}
      >
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
              ListHeaderComponent={
                <TouchableOpacity
                  style={styles.marcaItem}
                  onPress={() => { setMarcaSelecionada(null); setShowMarcaPicker(false); }}
                >
                  <Text style={styles.marcaItemNome}>Todas as marcas</Text>
                  {!marcaSelecionada && <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />}
                </TouchableOpacity>
              }
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.marcaItem}
                  onPress={() => { setMarcaSelecionada(item); setShowMarcaPicker(false); }}
                >
                  <Text style={styles.marcaItemNome}>{item.nome}</Text>
                  {marcaSelecionada?.id === item.id && (
                    <Ionicons name="checkmark-circle" size={20} color={COLORS.primary} />
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Modal: buscar produto específico */}
      <Modal
        visible={escopoProduto === 'especifico' && !produtoSelecionado}
        animationType="slide"
        transparent
        onRequestClose={() => setEscopoProduto('todos')}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalCard, SHADOW.lg]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>Selecionar Produto</Text>
              <TouchableOpacity onPress={() => setEscopoProduto('todos')}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <View style={styles.buscaBarModal}>
              <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
              <TextInput
                style={styles.buscaInputModal}
                placeholder="Buscar por nome ou cód. de barras..."
                placeholderTextColor={COLORS.textLight}
                value={buscaProduto}
                onChangeText={buscarProduto}
                autoFocus
              />
            </View>
            <FlatList
              data={resultadosBusca}
              keyExtractor={p => p.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.marcaItem}
                  onPress={() => { setProdutoSelecionado(item); setBuscaProduto(''); setResultadosBusca([]); }}
                >
                  <Text style={styles.marcaItemNome} numberOfLines={1}>{item.descricao}</Text>
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
  listContent: { padding: SPACING.md, gap: SPACING.sm },

  filtrosCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, marginBottom: SPACING.sm,
  },
  secaoTitulo: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: SPACING.sm,
  },
  filtroLinha: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  filtroLabel: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text },
  filtroSub: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  toggle: { padding: 4 },

  periodoRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 3,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  dateBtnText: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },

  escopoRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.xs },
  escopoChip: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  escopoChipAtivo: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  escopoChipText: { fontSize: FONT.sm, fontWeight: '600', color: COLORS.textSecondary },
  escopoChipTextAtivo: { color: COLORS.primary, fontWeight: '700' },

  pickerBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    marginTop: SPACING.sm, padding: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  pickerBtnText: { flex: 1, fontSize: FONT.sm, color: COLORS.text, fontWeight: '600' },

  produtoChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    marginTop: SPACING.sm, padding: SPACING.sm,
    borderRadius: RADIUS.md, backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  produtoChipText: { flex: 1, fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },

  buscaBarModal: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    margin: SPACING.md, marginTop: 0, padding: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  buscaInputModal: { flex: 1, fontSize: FONT.sm, color: COLORS.text },

  analisarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs, backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg, padding: SPACING.md, marginTop: SPACING.md,
  },
  analisarBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '800' },

  resultadoResumo: {
    marginTop: SPACING.sm, fontSize: FONT.sm, fontWeight: '600',
    color: COLORS.textSecondary, textAlign: 'center',
  },

  itemCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border, padding: SPACING.md,
  },
  itemNome: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.sm },
  itemColunas: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around' },
  coluna: { alignItems: 'center', flex: 1 },
  colunaLabel: { fontSize: FONT.xs, color: COLORS.textSecondary, textAlign: 'center' },
  colunaValor: { fontSize: FONT.xl, fontWeight: '800', marginTop: 2 },

  footerWrap: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: SPACING.md, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  confirmarBtn: {
    backgroundColor: COLORS.error, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md, gap: SPACING.sm,
  },
  confirmarBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: COLORS.surface, borderTopLeftRadius: RADIUS.xl,
    borderTopRightRadius: RADIUS.xl, maxHeight: '70%', paddingBottom: SPACING.lg,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  modalTitulo: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  marcaItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: SPACING.md, borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  marcaItemNome: { fontSize: FONT.md, color: COLORS.text, flex: 1 },
});
