import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity, Image,
  KeyboardAvoidingView, ScrollView, Platform, Alert, ActivityIndicator, Modal,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../contexts/AuthContext';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();

  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Todo login valida na nuvem e sincroniza antes de liberar a Home — a UI
  // fica bloqueada com esse loading enquanto isso acontece (NC-68/69).
  const [entrando, setEntrando] = useState(false);

  const handleLogin = async () => {
    if (!usuario.trim() || !senha) {
      Alert.alert('Atenção', 'Preencha usuário e senha.');
      return;
    }
    setEntrando(true);
    try {
      await login(usuario.trim(), senha);
    } catch (err) {
      Alert.alert('Não foi possível entrar', err.message);
    } finally {
      setEntrando(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Branding */}
        <View style={styles.brandingArea}>
          <Image
            source={require('../../assets/logo-icon-transparente.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
          <Text style={styles.appName}>Neném Cosméticos</Text>
          <Text style={styles.appSub}>Sistema de Vendas</Text>
        </View>

        {/* Card de login */}
        <View style={[styles.card, SHADOW.lg]}>
          <Text style={styles.cardTitle}>Entrar</Text>

          {/* Usuário */}
          <View style={styles.inputWrap}>
            <Ionicons name="person-outline" size={20} color={COLORS.textLight} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Usuário"
              placeholderTextColor={COLORS.textLight}
              value={usuario}
              onChangeText={setUsuario}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />
          </View>

          {/* Senha */}
          <View style={styles.inputWrap}>
            <Ionicons name="lock-closed-outline" size={20} color={COLORS.textLight} style={styles.inputIcon} />
            <TextInput
              style={[styles.input, { flex: 1 }]}
              placeholder="Senha"
              placeholderTextColor={COLORS.textLight}
              value={senha}
              onChangeText={setSenha}
              secureTextEntry={!showPass}
              returnKeyType="done"
              onSubmitEditing={handleLogin}
            />
            <TouchableOpacity onPress={() => setShowPass(v => !v)} style={styles.eyeBtn}>
              <Ionicons
                name={showPass ? 'eye-off-outline' : 'eye-outline'}
                size={20}
                color={COLORS.textLight}
              />
            </TouchableOpacity>
          </View>

          {/* Botão Entrar */}
          <TouchableOpacity
            style={[styles.loginBtn, entrando && styles.loginBtnDisabled, SHADOW.md]}
            onPress={handleLogin}
            disabled={entrando}
          >
            {entrando ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="log-in-outline" size={20} color="#fff" />
                <Text style={styles.loginBtnText}>Entrar</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Overlay bloqueante — validando login e baixando dados da loja */}
      <Modal visible={entrando} animationType="fade" transparent>
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.overlayText}>Baixando dados da loja...</Text>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.primary,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: SPACING.lg,
  },
  brandingArea: {
    alignItems: 'center',
    marginBottom: SPACING.lg,
  },
  logoImage: {
    width: 120, height: 120,
    marginBottom: SPACING.md,
  },
  appName: { fontSize: FONT.xl, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  appSub: { fontSize: FONT.sm, color: 'rgba(255,255,255,0.65)', marginTop: 4 },

  // Card de login
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.xl,
    padding: SPACING.lg,
  },
  cardTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.text, marginBottom: SPACING.md },

  inputWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.background,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
    marginBottom: SPACING.sm, paddingRight: SPACING.xs,
  },
  inputIcon: { padding: SPACING.sm + 2 },
  input: {
    flex: 1, fontSize: FONT.md, color: COLORS.text,
    paddingVertical: SPACING.sm + 2, paddingRight: SPACING.sm,
  },
  eyeBtn: { padding: SPACING.sm },

  loginBtn: {
    backgroundColor: COLORS.primary, borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md, gap: SPACING.sm, marginTop: SPACING.xs,
  },
  loginBtnDisabled: { opacity: 0.6 },
  loginBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '800' },

  // Overlay bloqueante
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center', justifyContent: 'center', gap: SPACING.md,
  },
  overlayText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
});
