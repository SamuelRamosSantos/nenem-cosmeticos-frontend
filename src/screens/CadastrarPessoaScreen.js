import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import FormInput from '../components/FormInput';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const TIPOS = [
  { key: 'C', label: 'Cliente',    icon: 'person-outline' },
  { key: 'F', label: 'Fornecedor', icon: 'business-outline' },
];

// Formata enquanto o usuário digita: (DD) 9XXXX-XXXX ou (DD) XXXX-XXXX
function formatarTelefone(texto) {
  const nums = texto.replace(/\D/g, '').slice(0, 11);
  if (nums.length === 0) return '';
  if (nums.length <= 2)  return `(${nums}`;
  if (nums.length <= 6)  return `(${nums.slice(0, 2)}) ${nums.slice(2)}`;
  if (nums.length <= 10) return `(${nums.slice(0, 2)}) ${nums.slice(2, 6)}-${nums.slice(6)}`;
  return `(${nums.slice(0, 2)}) ${nums.slice(2, 7)}-${nums.slice(7)}`;
}

export default function CadastrarPessoaScreen({ navigation, route }) {
  const database = useDatabase();
  const editando = route.params?.pessoa;

  const [nome,     setNome]     = useState(editando?.nome ?? '');
  const [telefone, setTelefone] = useState(
    editando?.telefone ? formatarTelefone(editando.telefone) : ''
  );
  const [tipo,    setTipo]    = useState(editando?.tipo ?? 'C');
  const [loading, setLoading] = useState(false);

  const handleTelefoneChange = (text) => {
    setTelefone(formatarTelefone(text));
  };

  const handleSalvar = async () => {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'O nome é obrigatório.');
      return;
    }

    // Salva apenas os dígitos no banco
    const telefoneLimpo = telefone.replace(/\D/g, '') || null;

    setLoading(true);
    try {
      await database.write(async () => {
        if (editando) {
          await editando.update(p => {
            p.nome     = nome.trim();
            p.telefone = telefoneLimpo;
            p.tipo     = tipo;
          });
        } else {
          await database.get('pessoas').create(p => {
            p.nome     = nome.trim();
            p.telefone = telefoneLimpo;
            p.tipo     = tipo;
          });
        }
      });
      navigation.goBack();
    } catch (err) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setLoading(false);
    }
  };

  const labelTipo = tipo === 'C' ? 'Cliente' : 'Fornecedor';

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
        {/* Toggle tipo */}
        <View style={styles.field}>
          <Text style={styles.label}>Tipo de Cadastro <Text style={styles.required}>*</Text></Text>
          <View style={styles.tiposRow}>
            {TIPOS.map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tipoBtn, tipo === t.key && styles.tipoBtnActive]}
                onPress={() => setTipo(t.key)}
              >
                <Ionicons
                  name={t.icon}
                  size={20}
                  color={tipo === t.key ? COLORS.primary : COLORS.textSecondary}
                />
                <Text style={[styles.tipoText, tipo === t.key && styles.tipoTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <FormInput
          label="Nome Completo"
          required
          value={nome}
          onChangeText={v => setNome(v.toUpperCase())}
          placeholder={tipo === 'C' ? 'EX: MARIA DA SILVA' : 'EX: DISTRIBUIDORA BELLA LTDA'}
          autoCapitalize="characters"
        />

        <FormInput
          label="Telefone / WhatsApp"
          value={telefone}
          onChangeText={handleTelefoneChange}
          placeholder="(11) 99999-9999"
          keyboardType="phone-pad"
        />
      </View>

      <TouchableOpacity
        style={[styles.salvarBtn, loading && styles.salvarBtnDisabled, SHADOW.md]}
        onPress={handleSalvar}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
            <Text style={styles.salvarBtnText}>
              {editando ? `Atualizar ${labelTipo}` : `Cadastrar ${labelTipo}`}
            </Text>
          </>
        )}
      </TouchableOpacity>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content:   { flexGrow: 1, padding: SPACING.md, paddingBottom: SPACING.xl },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  field: { marginBottom: SPACING.md },
  label: {
    fontSize: FONT.sm,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  required: { color: COLORS.error },
  tiposRow: { flexDirection: 'row', gap: SPACING.sm },
  tipoBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.md,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.surface,
  },
  tipoBtnActive:  { borderColor: COLORS.primary, backgroundColor: COLORS.primaryLight },
  tipoText:       { fontSize: FONT.md, fontWeight: '500', color: COLORS.textSecondary },
  tipoTextActive: { color: COLORS.primary, fontWeight: '700' },
  salvarBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md + 2,
    gap: SPACING.sm,
  },
  salvarBtnDisabled: { opacity: 0.6 },
  salvarBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '800' },
});
