import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const TIPOS = [
  { key: 'V', label: 'À Vista' },
  { key: 'C', label: 'Cartão' },
  { key: 'P', label: 'A Prazo' },
];
const TIPO_LABEL = Object.fromEntries(TIPOS.map(t => [t.key, t.label]));

const PARCELAS_CREDITO = Array.from({ length: 18 }, (_, i) => i + 1); // 1x..18x

// Filtro simples de percentual (mesmo padrão de CadastrarMarcaScreen) —
// aceita dígitos e um único separador decimal (vírgula ou ponto).
function filtrarPercentual(texto) {
  const limpo = texto.replace(/[^0-9.,]/g, '');
  const partes = limpo.split(/[.,]/);
  if (partes.length > 2) return null;
  return limpo;
}

function percentualParaNumero(texto) {
  const n = parseFloat(String(texto).replace(',', '.'));
  return isNaN(n) ? null : n;
}

// =============================================================================
// Lista reativa
// =============================================================================
const FormasListBase = ({ formas, onEditar, onExcluir }) => {
  if (!formas?.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="card-outline" size={52} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>Nenhuma forma cadastrada</Text>
        <Text style={styles.emptySub}>Use o botão + para adicionar</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={formas}
      keyExtractor={f => f.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <View style={[styles.card, SHADOW.sm]}>
          <View style={styles.cardIcon}>
            <Ionicons name="card" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardDesc}>{item.descricao}</Text>
            <Text style={styles.cardTipo}>{TIPO_LABEL[item.tipo] ?? 'À Vista'}</Text>
          </View>
          <TouchableOpacity style={styles.actionBtn} onPress={() => onEditar(item)}>
            <Ionicons name="create-outline" size={18} color={COLORS.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionBtn, { borderColor: COLORS.errorLight }]}
            onPress={() => onExcluir(item)}
          >
            <Ionicons name="trash-outline" size={18} color={COLORS.error} />
          </TouchableOpacity>
        </View>
      )}
    />
  );
};

const enhance = withObservables([], () => ({
  formas: database.get('formas_pagamento').query(),
}));
const FormasList = enhance(FormasListBase);

// =============================================================================
// Tela CRUD de Formas de Pagamento
// =============================================================================
export default function FormasPagamentoScreen() {
  const db     = useDatabase();
  const insets = useSafeAreaInsets();

  const [modalVisible, setModalVisible] = useState(false);
  const [editando,     setEditando]     = useState(null);
  const [descricao,    setDescricao]    = useState('');
  const [tipo,         setTipo]         = useState('V');
  const [loading,      setLoading]      = useState(false);

  // NC-71 — taxas de cartão
  const [taxaDebito,   setTaxaDebito]   = useState('');
  const [taxasCredito, setTaxasCredito] = useState(() => Array(18).fill(''));

  // NC-72 — configuração de prazo
  const [intervaloDias,          setIntervaloDias]          = useState('');
  const [limiteParcelas,         setLimiteParcelas]         = useState('');
  const [jurosPercentualPadrao,  setJurosPercentualPadrao]  = useState('');

  const atualizarTaxaCredito = (idx, valor) => {
    setTaxasCredito(prev => {
      const nova = [...prev];
      nova[idx] = valor;
      return nova;
    });
  };

  const abrirModal = async (forma = null) => {
    setEditando(forma);
    setDescricao(forma?.descricao ?? '');
    setTipo(forma?.tipo ?? 'V');
    setIntervaloDias(forma?.intervaloDias != null ? String(forma.intervaloDias) : '');
    setLimiteParcelas(forma?.limiteParcelas != null ? String(forma.limiteParcelas) : '');
    setJurosPercentualPadrao(
      forma?.jurosPercentualPadrao != null ? String(forma.jurosPercentualPadrao).replace('.', ',') : ''
    );
    setTaxaDebito('');
    setTaxasCredito(Array(18).fill(''));

    if (forma?.tipo === 'C') {
      const taxas = await db
        .get('forma_pagamento_taxas')
        .query(Q.where('forma_pagamento_id', forma.id))
        .fetch();
      const debito = taxas.find(t => t.modalidade === 'D');
      if (debito) setTaxaDebito(String(debito.taxaPercentual).replace('.', ','));
      const credito = Array(18).fill('');
      for (const t of taxas.filter(t => t.modalidade === 'C')) {
        if (t.parcelas >= 1 && t.parcelas <= 18) {
          credito[t.parcelas - 1] = String(t.taxaPercentual).replace('.', ',');
        }
      }
      setTaxasCredito(credito);
    }

    setModalVisible(true);
  };

  const fecharModal = () => {
    setModalVisible(false);
    setEditando(null);
    setDescricao('');
    setTipo('V');
    setTaxaDebito('');
    setTaxasCredito(Array(18).fill(''));
    setIntervaloDias('');
    setLimiteParcelas('');
    setJurosPercentualPadrao('');
  };

  // Monta as operações de forma_pagamento_taxas: cria/atualiza quem tem valor
  // preenchido, remove quem foi esvaziado. Nunca deixa linha órfã pra trás.
  // "existentes" já vem pré-carregado (fetch fora do write(), como o resto do projeto).
  const montarOpsTaxas = (formaPagamentoId, existentes) => {
    const ops = [];
    const porSlot = new Map(existentes.map(t => [`${t.modalidade}-${t.parcelas}`, t]));

    const upsert = (modalidade, parcelas, valorTexto) => {
      const chave = `${modalidade}-${parcelas}`;
      const existente = porSlot.get(chave);
      const numero = percentualParaNumero(valorTexto);

      if (numero === null) {
        if (existente) ops.push(existente.prepareMarkAsDeleted());
        return;
      }
      if (existente) {
        ops.push(existente.prepareUpdate(t => { t.taxaPercentual = numero; }));
      } else {
        ops.push(
          db.get('forma_pagamento_taxas').prepareCreate(t => {
            t.formaPagamentoId = formaPagamentoId;
            t.modalidade = modalidade;
            t.parcelas = parcelas;
            t.taxaPercentual = numero;
          })
        );
      }
    };

    upsert('D', 1, taxaDebito);
    PARCELAS_CREDITO.forEach((parcela, idx) => upsert('C', parcela, taxasCredito[idx]));

    return ops;
  };

  const handleSalvar = async () => {
    if (!descricao.trim()) {
      Alert.alert('Atenção', 'Informe a descrição.');
      return;
    }

    setLoading(true);
    try {
      const descricaoFinal = descricao.trim();
      const intervaloDiasFinal  = tipo === 'P' ? (parseInt(intervaloDias, 10) || null) : null;
      const limiteParcelasFinal = tipo === 'P' ? (parseInt(limiteParcelas, 10) || null) : null;
      const jurosFinal          = tipo === 'P' ? percentualParaNumero(jurosPercentualPadrao) : null;

      // Pré-carrega as taxas já existentes (se estiver editando) antes do
      // write(), seguindo o mesmo padrão do resto do projeto.
      const taxasExistentes = editando
        ? await db.get('forma_pagamento_taxas').query(Q.where('forma_pagamento_id', editando.id)).fetch()
        : [];

      await db.write(async () => {
        let formaPagamentoId;
        const ops = [];

        if (editando) {
          formaPagamentoId = editando.id;
          ops.push(editando.prepareUpdate(f => {
            f.descricao             = descricaoFinal;
            f.tipo                  = tipo;
            f.intervaloDias         = intervaloDiasFinal;
            f.limiteParcelas        = limiteParcelasFinal;
            f.jurosPercentualPadrao = jurosFinal;
          }));
        } else {
          const novaForma = db.get('formas_pagamento').prepareCreate(f => {
            f.descricao             = descricaoFinal;
            f.tipo                  = tipo;
            f.intervaloDias         = intervaloDiasFinal;
            f.limiteParcelas        = limiteParcelasFinal;
            f.jurosPercentualPadrao = jurosFinal;
          });
          formaPagamentoId = novaForma.id;
          ops.push(novaForma);
        }

        if (tipo === 'C') {
          ops.push(...montarOpsTaxas(formaPagamentoId, taxasExistentes));
        } else {
          // Tipo mudou pra fora de 'Cartão' (ou é uma forma nova não-cartão)
          // — remove taxas que tinham ficado.
          for (const t of taxasExistentes) ops.push(t.prepareMarkAsDeleted());
        }

        await db.batch(...ops);
      });
      fecharModal();
    } catch (err) {
      Alert.alert('Erro', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExcluir = (forma) => {
    Alert.alert(
      'Excluir Forma de Pagamento',
      `Deseja excluir "${forma.descricao}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir', style: 'destructive',
          onPress: async () => {
            try {
              const taxas = await db.get('forma_pagamento_taxas')
                .query(Q.where('forma_pagamento_id', forma.id)).fetch();
              await db.write(async () => {
                const ops = [forma.prepareMarkAsDeleted()];
                for (const t of taxas) ops.push(t.prepareMarkAsDeleted());
                await db.batch(...ops);
              });
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
      <FormasList onEditar={abrirModal} onExcluir={handleExcluir} />

      {/* FAB — bottom dinâmico respeita barra de navegação do Android */}
      <TouchableOpacity
        style={[styles.fab, SHADOW.lg, { bottom: SPACING.lg + (insets.bottom || 0) }]}
        onPress={() => abrirModal()}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal de cadastro/edição */}
      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={fecharModal}>
        {/* KAV envolve o overlay como container do bottom-sheet */}
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={[styles.modalCard, SHADOW.lg, {
            paddingBottom: Math.max(SPACING.xl, (insets.bottom || 0) + SPACING.md),
          }]}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitulo}>
                {editando ? 'Editar Forma' : 'Nova Forma de Pagamento'}
              </Text>
              <TouchableOpacity onPress={fecharModal}>
                <Ionicons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>

            {/* ScrollView interno permite rolar se o teclado for alto */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={styles.inputLabel}>Descrição</Text>
              <TextInput
                style={styles.input}
                value={descricao}
                onChangeText={setDescricao}
                placeholder="Ex: Dinheiro, PIX, Cartão..."
                placeholderTextColor={COLORS.textLight}
                autoCapitalize="words"
                returnKeyType="next"
              />

              <Text style={styles.inputLabel}>Tipo</Text>
              <View style={styles.tipoRow}>
                {TIPOS.map(t => (
                  <TouchableOpacity
                    key={t.key}
                    style={[styles.tipoChip, tipo === t.key && styles.tipoChipAtivo]}
                    onPress={() => setTipo(t.key)}
                  >
                    <Text style={[styles.tipoChipText, tipo === t.key && styles.tipoChipTextAtivo]}>
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* NC-71 — taxas de cartão */}
              {tipo === 'C' && (
                <View style={styles.secao}>
                  <Text style={styles.inputLabel}>Taxa Débito (%)</Text>
                  <TextInput
                    style={styles.input}
                    value={taxaDebito}
                    onChangeText={t => { const v = filtrarPercentual(t); if (v !== null) setTaxaDebito(v); }}
                    placeholder="Ex: 1,50"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="decimal-pad"
                  />

                  <Text style={styles.inputLabel}>Taxa Crédito por Parcela (%)</Text>
                  <View style={styles.gridTaxas}>
                    {PARCELAS_CREDITO.map((parcela, idx) => (
                      <View key={parcela} style={styles.gridCell}>
                        <Text style={styles.gridCellLabel}>{parcela}x</Text>
                        <TextInput
                          style={styles.gridCellInput}
                          value={taxasCredito[idx]}
                          onChangeText={t => { const v = filtrarPercentual(t); if (v !== null) atualizarTaxaCredito(idx, v); }}
                          placeholder="0,00"
                          placeholderTextColor={COLORS.textLight}
                          keyboardType="decimal-pad"
                        />
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {/* NC-72 — configuração de prazo */}
              {tipo === 'P' && (
                <View style={styles.secao}>
                  <Text style={styles.inputLabel}>Intervalo de Dias</Text>
                  <TextInput
                    style={styles.input}
                    value={intervaloDias}
                    onChangeText={t => setIntervaloDias(t.replace(/\D/g, ''))}
                    placeholder="Ex: 30"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="number-pad"
                  />

                  <Text style={styles.inputLabel}>Limite Máximo de Parcelas</Text>
                  <TextInput
                    style={styles.input}
                    value={limiteParcelas}
                    onChangeText={t => setLimiteParcelas(t.replace(/\D/g, ''))}
                    placeholder="Ex: 12"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="number-pad"
                  />

                  <Text style={styles.inputLabel}>Juros (%) Padrão</Text>
                  <TextInput
                    style={styles.input}
                    value={jurosPercentualPadrao}
                    onChangeText={t => { const v = filtrarPercentual(t); if (v !== null) setJurosPercentualPadrao(v); }}
                    placeholder="Ex: 2,00"
                    placeholderTextColor={COLORS.textLight}
                    keyboardType="decimal-pad"
                  />
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              style={[styles.salvarBtn, loading && { opacity: 0.6 }]}
              onPress={handleSalvar}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={styles.salvarBtnText}>
                    {editando ? 'Atualizar' : 'Salvar'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  list: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: 100 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardIcon: {
    width: 40, height: 40, borderRadius: RADIUS.sm,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardDesc: { fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
  cardTipo: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  actionBtn: {
    width: 36, height: 36, borderRadius: RADIUS.sm,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  fab: {
    position: 'absolute', right: SPACING.md,
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
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADIUS.xl, borderTopRightRadius: RADIUS.xl,
    padding: SPACING.lg, maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: SPACING.md,
  },
  modalTitulo: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  inputLabel: {
    fontSize: FONT.sm, fontWeight: '600', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.3, marginBottom: SPACING.xs,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    fontSize: FONT.md, color: COLORS.text, marginBottom: SPACING.md,
  },
  tipoRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  tipoChip: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  tipoChipAtivo: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  tipoChipText: { fontSize: FONT.sm, fontWeight: '600', color: COLORS.textSecondary },
  tipoChipTextAtivo: { color: COLORS.primary, fontWeight: '700' },
  secao: {
    borderTopWidth: 1, borderTopColor: COLORS.divider,
    paddingTop: SPACING.sm, marginTop: SPACING.xs,
  },
  gridTaxas: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs, marginBottom: SPACING.md,
  },
  gridCell: {
    width: '31%', backgroundColor: COLORS.background,
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.sm,
    padding: SPACING.xs, alignItems: 'center',
  },
  gridCellLabel: { fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 2 },
  gridCellInput: {
    fontSize: FONT.sm, color: COLORS.text, textAlign: 'center',
    padding: 0, width: '100%',
  },
  salvarBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md, gap: SPACING.sm, marginTop: SPACING.sm,
  },
  salvarBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '800' },
});
