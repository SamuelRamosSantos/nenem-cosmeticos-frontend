import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Alert, Modal, TextInput, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import withObservables from '@nozbe/with-observables';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

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
          <Text style={styles.cardDesc}>{item.descricao}</Text>
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
  const [loading,      setLoading]      = useState(false);

  const abrirModal = (forma = null) => {
    setEditando(forma);
    setDescricao(forma?.descricao ?? '');
    setModalVisible(true);
  };

  const fecharModal = () => {
    setModalVisible(false);
    setEditando(null);
    setDescricao('');
  };

  const handleSalvar = async () => {
    if (!descricao.trim()) {
      Alert.alert('Atenção', 'Informe a descrição.');
      return;
    }
    setLoading(true);
    try {
      await db.write(async () => {
        if (editando) {
          await editando.update(f => { f.descricao = descricao.trim(); });
        } else {
          await db.get('formas_pagamento').create(f => {
            f.descricao = descricao.trim();
          });
        }
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
              await db.write(async () => { await forma.destroyPermanently(); });
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
                autoFocus
                returnKeyType="done"
                onSubmitEditing={handleSalvar}
              />
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
  cardDesc: { flex: 1, fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
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
    padding: SPACING.lg,
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
  salvarBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md, gap: SPACING.sm,
  },
  salvarBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '800' },
});
