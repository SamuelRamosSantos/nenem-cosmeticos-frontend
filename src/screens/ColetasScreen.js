import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, Switch,
  TouchableOpacity, Alert, ActivityIndicator, Modal,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const fmtData = (date) => {
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

// =============================================================================
// Card reativo de uma coleta — observa a própria coleta + count dos seus itens
// =============================================================================
const ColetaCardBase = ({ coleta, itemCount, onAbrir, onExcluir }) => (
  <TouchableOpacity
    style={[styles.card, SHADOW.sm]}
    onPress={() => onAbrir(coleta)}
    activeOpacity={0.82}
  >
    <View style={styles.cardIcon}>
      <Ionicons name="layers-outline" size={22} color={COLORS.primary} />
    </View>

    <View style={{ flex: 1 }}>
      <Text style={styles.cardNome}>{coleta.nome}</Text>
      <Text style={styles.cardMeta}>
        {fmtData(coleta.dataCriacao)} · {itemCount} produto{itemCount !== 1 ? 's' : ''} contado{itemCount !== 1 ? 's' : ''}
      </Text>
    </View>

    <TouchableOpacity
      onPress={() => onExcluir(coleta)}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      style={{ padding: 4 }}
    >
      <Ionicons name="trash-outline" size={18} color={COLORS.error} />
    </TouchableOpacity>
    <Ionicons name="chevron-forward" size={20} color={COLORS.textLight} />
  </TouchableOpacity>
);

const enhanceCard = withObservables(['coleta'], ({ coleta }) => ({
  coleta:    coleta.observe(),
  itemCount: database.get('coleta_itens')
    .query(Q.where('coleta_id', coleta.id))
    .observeCount(),
}));
const ColetaCard = enhanceCard(ColetaCardBase);

// =============================================================================
// Lista reativa de coletas
// =============================================================================
const ColetasListBase = ({ coletas, onAbrir, onExcluir }) => {
  if (!coletas?.length) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="layers-outline" size={56} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>Nenhuma coleta iniciada</Text>
        <Text style={styles.emptySub}>
          Toque em "Nova Coleta" para começar a contagem cega por setor
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={coletas}
      keyExtractor={c => c.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <Text style={styles.listHeader}>
          {coletas.length} coleta{coletas.length !== 1 ? 's' : ''} em andamento
        </Text>
      }
      renderItem={({ item }) => (
        <ColetaCard coleta={item} onAbrir={onAbrir} onExcluir={onExcluir} />
      )}
      ListFooterComponent={<View style={{ height: 16 }} />}
    />
  );
};

const enhanceColetas = withObservables([], () => ({
  coletas: database.get('coletas').query(),
}));
const ColetasList = enhanceColetas(ColetasListBase);

// =============================================================================
// Tela de Gestão de Coletas
// =============================================================================
export default function ColetasScreen() {
  const db         = useDatabase();
  const navigation = useNavigation();
  const insets     = useSafeAreaInsets();

  const [showModal,        setShowModal]        = useState(false);
  const [nomeNovaColeta,   setNomeNovaColeta]   = useState('');
  const [zerarNaoContados, setZerarNaoContados] = useState(false);
  const [consolidando,     setConsolidando]     = useState(false);

  // ── Criar nova coleta ────────────────────────────────────────────────────
  const handleCriarColeta = async () => {
    const nome = nomeNovaColeta.trim().toUpperCase();
    if (!nome) {
      Alert.alert('Atenção', 'Informe um nome para a coleta.');
      return;
    }
    try {
      await db.write(async () => {
        await db.get('coletas').create(c => {
          c.nome        = nome;
          c.dataCriacao = new Date();
        });
      });
      setNomeNovaColeta('');
      setShowModal(false);
    } catch (err) {
      Alert.alert('Erro', err.message);
    }
  };

  // ── Excluir coleta e seus itens ──────────────────────────────────────────
  const handleExcluirColeta = (coleta) => {
    Alert.alert(
      'Excluir Coleta',
      `Excluir "${coleta.nome}" e todos os ${0} itens contados?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              await db.write(async () => {
                const itens = await db
                  .get('coleta_itens')
                  .query(Q.where('coleta_id', coleta.id))
                  .fetch();
                const ops = [
                  ...itens.map(i => i.prepareDestroyPermanently()),
                  coleta.prepareDestroyPermanently(),
                ];
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

  // ── Confirmar antes de consolidar ────────────────────────────────────────
  const handleFinalizarBalanco = () => {
    Alert.alert(
      'Finalizar Balanço Geral',
      zerarNaoContados
        ? 'Os produtos contados terão o estoque ajustado. Produtos NÃO contados em nenhuma coleta terão o estoque zerado.'
        : 'Os estoques dos produtos contados serão ajustados. Produtos não contados permanecem inalterados.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Finalizar', style: 'destructive', onPress: consolidar },
      ]
    );
  };

  // ── A Mágica: rotina de consolidação ────────────────────────────────────
  const consolidar = async () => {
    setConsolidando(true);
    try {
      // ── Passo A: somar quantidades por produto_id em todas as coletas ───
      const todosItens = await db.get('coleta_itens').query().fetch();

      if (todosItens.length === 0 && !zerarNaoContados) {
        Alert.alert(
          'Coletas vazias',
          'Nenhum produto foi contado. Adicione contagens antes de finalizar.'
        );
        return;
      }

      const mapa = new Map(); // produto_id → qtd consolidada
      for (const item of todosItens) {
        mapa.set(item.produtoId, (mapa.get(item.produtoId) ?? 0) + item.quantidade);
      }

      // ── Passo B: ajustar estoques dos produtos ativos ───────────────────
      const produtos = await db.get('produtos').query(Q.where('ativo', true)).fetch();
      const coletas  = await db.get('coletas').query().fetch();

      let alterados = 0;

      await db.write(async () => {
        const ops = [];

        for (const produto of produtos) {
          if (mapa.has(produto.id)) {
            const novaQtd = mapa.get(produto.id);
            if (novaQtd !== produto.qtdEstoque) {
              // prepareUpdate toca updated_at automaticamente
              // → o sync reconhece a mudança na próxima sincronização
              ops.push(produto.prepareUpdate(p => { p.qtdEstoque = novaQtd; }));
              alterados++;
            }
          } else if (zerarNaoContados && produto.qtdEstoque !== 0) {
            ops.push(produto.prepareUpdate(p => { p.qtdEstoque = 0; }));
            alterados++;
          }
        }

        // ── Passo C: limpar coletas e coleta_itens ──────────────────────
        for (const item of todosItens) ops.push(item.prepareDestroyPermanently());
        for (const c of coletas)       ops.push(c.prepareDestroyPermanently());

        if (ops.length > 0) await db.batch(...ops);
      });

      Alert.alert(
        'Balanço Concluído!',
        `${alterados} produto(s) com estoque ajustado.`,
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert('Erro ao consolidar', err.message);
    } finally {
      setConsolidando(false);
    }
  };

  return (
    <View style={styles.container}>

      {/* Botão Nova Coleta */}
      <View style={styles.topBar}>
        <TouchableOpacity
          style={[styles.novaColetaBtn, SHADOW.sm]}
          onPress={() => setShowModal(true)}
        >
          <Ionicons name="add-circle-outline" size={20} color={COLORS.primary} />
          <Text style={styles.novaColetaBtnText}>Nova Coleta</Text>
        </TouchableOpacity>
      </View>

      {/* Lista reativa de coletas */}
      <View style={{ flex: 1 }}>
        <ColetasList
          onAbrir={coleta =>
            navigation.navigate('ColetaDetalhe', {
              coletaId:   coleta.id,
              coletaNome: coleta.nome,
            })
          }
          onExcluir={handleExcluirColeta}
        />
      </View>

      {/* Rodapé: switch + botão Finalizar Balanço Geral */}
      <View style={[styles.footer, SHADOW.lg, {
        paddingBottom: Math.max(SPACING.md, (insets.bottom || 0) + SPACING.xs),
      }]}>
        <TouchableOpacity
          style={styles.switchRow}
          onPress={() => setZerarNaoContados(v => !v)}
          activeOpacity={0.75}
        >
          <Ionicons
            name="warning-outline"
            size={17}
            color={zerarNaoContados ? COLORS.error : COLORS.textSecondary}
          />
          <Text style={[
            styles.switchLabel,
            zerarNaoContados && styles.switchLabelAtivo,
          ]}>
            Zerar produtos não contados
          </Text>
          <Switch
            value={zerarNaoContados}
            onValueChange={setZerarNaoContados}
            trackColor={{ false: COLORS.border, true: COLORS.errorLight }}
            thumbColor={zerarNaoContados ? COLORS.error : '#ccc'}
          />
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.finalizarBtn, SHADOW.md, consolidando && { opacity: 0.6 }]}
          onPress={handleFinalizarBalanco}
          disabled={consolidando}
        >
          {consolidando ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="checkmark-done-circle" size={22} color="#fff" />
              <Text style={styles.finalizarBtnText}>Finalizar Balanço Geral</Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Modal: Nova Coleta */}
      <Modal visible={showModal} animationType="fade" transparent>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.modalOverlay}>
            <View style={[styles.modalCard, SHADOW.lg]}>
              <Text style={styles.modalTitulo}>Nova Coleta</Text>
              <Text style={styles.modalSub}>
                Dê um nome ao setor ou prateleira que será contado
              </Text>
              <TextInput
                style={styles.modalInput}
                value={nomeNovaColeta}
                onChangeText={v => setNomeNovaColeta(v.toUpperCase())}
                placeholder="EX: PRATELEIRA A, CORREDOR B..."
                placeholderTextColor={COLORS.textLight}
                autoCapitalize="characters"
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleCriarColeta}
              />
              <View style={styles.modalBtns}>
                <TouchableOpacity
                  style={styles.btnCancelar}
                  onPress={() => { setShowModal(false); setNomeNovaColeta(''); }}
                >
                  <Text style={styles.btnCancelarText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.btnConfirmar}
                  onPress={handleCriarColeta}
                >
                  <Text style={styles.btnConfirmarText}>Criar Coleta</Text>
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

  topBar: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  novaColetaBtn: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderWidth: 1.5, borderColor: COLORS.primary,
    borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight,
  },
  novaColetaBtnText: {
    fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary,
  },

  list:       { paddingHorizontal: SPACING.md, gap: SPACING.sm },
  listHeader: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: SPACING.xs,
  },

  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardIcon: {
    width: 42, height: 42, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  cardNome: { fontSize: FONT.md, fontWeight: '700', color: COLORS.text },
  cardMeta: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },

  emptyWrap: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.sm,
  },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySub:   { fontSize: FONT.sm, color: COLORS.textLight, textAlign: 'center' },

  // Rodapé de consolidação
  footer: {
    backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderTopColor: COLORS.border,
    padding: SPACING.md, gap: SPACING.sm,
  },
  switchRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  switchLabel: {
    flex: 1, fontSize: FONT.sm, color: COLORS.textSecondary, fontWeight: '500',
  },
  switchLabelAtivo: { color: COLORS.error, fontWeight: '700' },

  finalizarBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md + 2, gap: SPACING.sm,
  },
  finalizarBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '800' },

  // Modal Nova Coleta (card central)
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center',
    padding: SPACING.lg,
  },
  modalCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.xl,
    padding: SPACING.lg, width: '100%',
    borderWidth: 1, borderColor: COLORS.border,
  },
  modalTitulo: { fontSize: FONT.lg, fontWeight: '800', color: COLORS.text },
  modalSub: {
    fontSize: FONT.sm, color: COLORS.textSecondary,
    marginTop: SPACING.xs, marginBottom: SPACING.sm,
  },
  modalInput: {
    borderWidth: 1.5, borderColor: COLORS.primary, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
    fontSize: FONT.md, fontWeight: '700', color: COLORS.text,
    backgroundColor: COLORS.background, marginBottom: SPACING.md,
  },
  modalBtns:       { flexDirection: 'row', gap: SPACING.sm },
  btnCancelar: {
    flex: 1, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center',
  },
  btnCancelarText: { fontSize: FONT.md, color: COLORS.textSecondary, fontWeight: '600' },
  btnConfirmar: {
    flex: 1, paddingVertical: SPACING.sm + 2, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primary, alignItems: 'center',
  },
  btnConfirmarText: { fontSize: FONT.md, color: '#fff', fontWeight: '800' },
});
