import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, ScrollView,
  Modal, Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import FormInput from '../components/FormInput';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

export default function GerenciarUsuariosScreen() {
  const db     = useDatabase();
  const insets = useSafeAreaInsets();

  const [usuarios,        setUsuarios]        = useState([]);
  const [loading,         setLoading]         = useState(false);
  const [showModal,       setShowModal]       = useState(false);
  const [editandoUsuario, setEditandoUsuario] = useState(null);
  const [nome,            setNome]            = useState('');
  const [senha,           setSenha]           = useState('');
  const [saving,          setSaving]          = useState(false);

  const carregarUsuarios = useCallback(async () => {
    setLoading(true);
    try {
      const lista = await db.get('usuarios').query().fetch();
      lista.sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome));
      setUsuarios(lista);
    } catch (e) {
      Alert.alert('Erro', e.message);
    } finally {
      setLoading(false);
    }
  }, [db]);

  useFocusEffect(useCallback(() => {
    carregarUsuarios();
  }, [carregarUsuarios]));

  const abrirCriar = () => {
    setEditandoUsuario(null);
    setNome('');
    setSenha('');
    setShowModal(true);
  };

  const abrirEditar = (u) => {
    setEditandoUsuario(u);
    setNome(u.nome);
    setSenha(u.senha);
    setShowModal(true);
  };

  const handleToggleAtivo = async (usuario) => {
    if (usuario.ativo) {
      const ativos = usuarios.filter(u => u.ativo);
      if (ativos.length <= 1) {
        Alert.alert('Atenção', 'Não é possível inativar o único usuário ativo do sistema.');
        return;
      }
    }
    try {
      await db.write(async () => {
        await usuario.update(u => { u.ativo = !u.ativo; });
      });
      carregarUsuarios();
    } catch (e) {
      Alert.alert('Erro', e.message);
    }
  };

  const handleSalvar = async () => {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'O nome de usuário é obrigatório.');
      return;
    }
    if (!senha.trim()) {
      Alert.alert('Atenção', 'A senha é obrigatória.');
      return;
    }
    const duplicata = usuarios.find(
      u => u.nome.toLowerCase() === nome.trim().toLowerCase() && u.id !== editandoUsuario?.id
    );
    if (duplicata) {
      Alert.alert('Atenção', 'Já existe um usuário com este nome.');
      return;
    }

    setSaving(true);
    try {
      await db.write(async () => {
        if (editandoUsuario) {
          await editandoUsuario.update(u => {
            u.nome  = nome.trim();
            u.senha = senha;
          });
        } else {
          await db.get('usuarios').create(u => {
            u.nome  = nome.trim();
            u.senha = senha;
            u.ativo = true;
          });
        }
      });
      setShowModal(false);
      carregarUsuarios();
    } catch (e) {
      Alert.alert('Erro ao salvar', e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <FlatList
          data={usuarios}
          keyExtractor={u => u.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={56} color={COLORS.textLight} />
              <Text style={styles.emptyTitle}>Nenhum usuário cadastrado</Text>
              <Text style={styles.emptySub}>Toque no + para adicionar o primeiro usuário</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={[styles.card, SHADOW.sm]}>
              <View style={[styles.avatar, !item.ativo && styles.avatarInativo]}>
                <Ionicons
                  name="person" size={22}
                  color={item.ativo ? COLORS.primary : COLORS.textLight}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.cardNome, !item.ativo && styles.cardNomeInativo]}>
                  {item.nome}
                </Text>
                <View style={[styles.statusBadge, !item.ativo && styles.statusBadgeInativo]}>
                  <Text style={[styles.statusText, !item.ativo && styles.statusTextInativo]}>
                    {item.ativo ? 'Ativo' : 'Inativo'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity style={styles.actionBtn} onPress={() => abrirEditar(item)}>
                <Ionicons name="create-outline" size={18} color={COLORS.textSecondary} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  { borderColor: item.ativo ? COLORS.errorLight : COLORS.successLight },
                ]}
                onPress={() => handleToggleAtivo(item)}
              >
                <Ionicons
                  name={item.ativo ? 'close-circle-outline' : 'checkmark-circle-outline'}
                  size={18}
                  color={item.ativo ? COLORS.error : COLORS.success}
                />
              </TouchableOpacity>
            </View>
          )}
        />
      )}

      {/* FAB — bottom dinâmico respeita barra de navegação do Android */}
      <TouchableOpacity
        style={[styles.fab, SHADOW.lg, { bottom: SPACING.lg + (insets.bottom || 0) }]}
        onPress={abrirCriar}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Modal criar / editar */}
      <Modal visible={showModal} animationType="slide" transparent onRequestClose={() => setShowModal(false)}>
        <View style={styles.modalOverlay}>
          {/* KAV envolve apenas o card para empurrar o bottom-sheet acima do teclado */}
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={[styles.modalCard, SHADOW.lg, {
              paddingBottom: Math.max(SPACING.xl, (insets.bottom || 0) + SPACING.md),
            }]}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitulo}>
                  {editandoUsuario ? 'Editar Usuário' : 'Novo Usuário'}
                </Text>
                <TouchableOpacity onPress={() => setShowModal(false)}>
                  <Ionicons name="close" size={24} color={COLORS.text} />
                </TouchableOpacity>
              </View>

              {/* ScrollView interno permite rolar se o teclado for alto */}
              <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <FormInput
                  label="Nome de Usuário"
                  required
                  value={nome}
                  onChangeText={setNome}
                  placeholder="Ex: admin"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <FormInput
                  label="Senha"
                  required
                  value={senha}
                  onChangeText={setSenha}
                  placeholder="Senha de acesso"
                  secureTextEntry
                />
              </ScrollView>

              <TouchableOpacity
                style={[styles.salvarBtn, saving && { opacity: 0.6 }]}
                onPress={handleSalvar}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                    <Text style={styles.salvarBtnText}>
                      {editandoUsuario ? 'Salvar Alterações' : 'Criar Usuário'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container:   { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list: { padding: SPACING.md, gap: SPACING.sm, paddingBottom: 100 },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md, gap: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  avatar: {
    width: 44, height: 44, borderRadius: RADIUS.full,
    backgroundColor: COLORS.primaryLight,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarInativo:      { backgroundColor: COLORS.background },
  cardNome:           { fontSize: FONT.md, fontWeight: '600', color: COLORS.text, marginBottom: 4 },
  cardNomeInativo:    { color: COLORS.textLight },
  statusBadge: {
    alignSelf: 'flex-start', paddingHorizontal: SPACING.sm, paddingVertical: 2,
    borderRadius: RADIUS.full, backgroundColor: COLORS.successLight,
  },
  statusBadgeInativo: { backgroundColor: COLORS.background, borderWidth: 1, borderColor: COLORS.border },
  statusText:         { fontSize: FONT.xs, color: COLORS.success, fontWeight: '700' },
  statusTextInativo:  { color: COLORS.textLight },
  actionBtn: {
    width: 36, height: 36, borderRadius: RADIUS.sm,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  fab: {
    position: 'absolute', right: SPACING.md,
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center',
  },
  empty:      { alignItems: 'center', paddingTop: 60, gap: SPACING.sm },
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
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.md,
  },
  modalTitulo:   { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text },
  salvarBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md, gap: SPACING.sm, marginTop: SPACING.xs,
  },
  salvarBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '800' },
});
