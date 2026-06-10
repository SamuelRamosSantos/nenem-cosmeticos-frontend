import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  KeyboardAvoidingView, ScrollView, Platform, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useAuth } from '../contexts/AuthContext';
import { sincronizar } from '../services/syncService';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

export default function LoginScreen() {
  const { login } = useAuth();
  const db = useDatabase();

  const [usuario, setUsuario] = useState('');
  const [senha, setSenha] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);

  // true  → tabela usuarios vazia: primeiro acesso ou banco limpo
  // false → há ao menos um usuário ativo
  // null  → verificação ainda em curso
  const [semUsuarios, setSemUsuarios] = useState(null);

  // Verifica se há usuários locais cadastrados
  useEffect(() => {
    db.get('usuarios')
      .query(Q.where('ativo', true))
      .fetchCount()
      .then(count => setSemUsuarios(count === 0))
      .catch(() => setSemUsuarios(false));
  }, [db]);

  const handleLogin = async () => {
    if (!usuario.trim() || !senha) {
      Alert.alert('Atenção', 'Preencha usuário e senha.');
      return;
    }
    setLoading(true);
    try {
      await login(usuario.trim(), senha);
    } catch (err) {
      Alert.alert('Acesso negado', err.message);
    } finally {
      setLoading(false);
    }
  };

  // Sincroniza com o servidor para baixar usuários no primeiro acesso
  const handleSincronizarPrimeiroAcesso = async () => {
    setSincronizando(true);
    try {
      await sincronizar(db);

      const count = await db
        .get('usuarios')
        .query(Q.where('ativo', true))
        .fetchCount();
      setSemUsuarios(count === 0);

      if (count > 0) {
        Alert.alert(
          'Pronto!',
          'Usuários sincronizados. Faça login com as credenciais recebidas.',
        );
      } else {
        Alert.alert(
          'Nenhum usuário encontrado',
          'Certifique-se de que o servidor está acessível e de que o seed foi executado (npx prisma db seed).',
        );
      }
    } catch (err) {
      Alert.alert(
        'Erro na sincronização',
        `Não foi possível conectar ao servidor.\n\n${err.message}\n\nVerifique a variável EXPO_PUBLIC_API_URL e se o servidor está online.`,
      );
    } finally {
      setSincronizando(false);
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
        <View style={styles.logoCircle}>
          <Ionicons name="leaf" size={52} color={COLORS.accent} />
        </View>
        <Text style={styles.appName}>Neném Cosméticos</Text>
        <Text style={styles.appSub}>Sistema de Vendas</Text>
      </View>

      {/* Banner de primeiro acesso */}
      {semUsuarios === true && (
        <View style={styles.banner}>
          <Ionicons name="information-circle-outline" size={20} color={COLORS.warning} />
          <Text style={styles.bannerText}>
            Nenhum usuário cadastrado localmente.{'\n'}
            Sincronize para fazer o primeiro login.
          </Text>
        </View>
      )}

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
          style={[styles.loginBtn, (loading || sincronizando) && styles.loginBtnDisabled, SHADOW.md]}
          onPress={handleLogin}
          disabled={loading || sincronizando}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <>
              <Ionicons name="log-in-outline" size={20} color="#fff" />
              <Text style={styles.loginBtnText}>Entrar</Text>
            </>
          )}
        </TouchableOpacity>

        {/* Divisor */}
        <View style={styles.divisor}>
          <View style={styles.divisorLine} />
          <Text style={styles.divisorText}>ou</Text>
          <View style={styles.divisorLine} />
        </View>

        {/* Botão Sincronizar Primeiro Acesso */}
        <TouchableOpacity
          style={[styles.syncBtn, (loading || sincronizando) && { opacity: 0.6 }]}
          onPress={handleSincronizarPrimeiroAcesso}
          disabled={loading || sincronizando}
        >
          {sincronizando ? (
            <ActivityIndicator color={COLORS.primary} size="small" />
          ) : (
            <Ionicons name="cloud-download-outline" size={18} color={COLORS.primary} />
          )}
          <Text style={styles.syncBtnText}>
            {sincronizando ? 'Sincronizando...' : 'Sincronizar Primeiro Acesso'}
          </Text>
        </TouchableOpacity>

      </View>
      </ScrollView>
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
  logoCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: 'rgba(255,255,255,0.12)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.md,
    borderWidth: 2, borderColor: 'rgba(243,213,127,0.4)',
  },
  appName: { fontSize: FONT.xl, fontWeight: '800', color: '#FFFFFF', letterSpacing: 0.5 },
  appSub: { fontSize: FONT.sm, color: 'rgba(255,255,255,0.65)', marginTop: 4 },

  // Banner primeiro acesso
  banner: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.xs,
    backgroundColor: COLORS.warningLight, borderRadius: RADIUS.md,
    padding: SPACING.sm, marginBottom: SPACING.md,
    borderWidth: 1, borderColor: COLORS.warning,
  },
  bannerText: { flex: 1, fontSize: FONT.xs, color: COLORS.warning, fontWeight: '600', lineHeight: 18 },

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

  divisor: {
    flexDirection: 'row', alignItems: 'center',
    marginVertical: SPACING.md, gap: SPACING.sm,
  },
  divisorLine: { flex: 1, height: 1, backgroundColor: COLORS.divider },
  divisorText: { fontSize: FONT.xs, color: COLORS.textLight },

  // Botão Sincronizar
  syncBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.xs,
    paddingVertical: SPACING.sm + 2,
    borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.primary,
    backgroundColor: COLORS.primaryLight,
  },
  syncBtnText: { fontSize: FONT.sm, color: COLORS.primary, fontWeight: '700' },

  hint: {
    textAlign: 'center', marginTop: SPACING.md,
    fontSize: FONT.xs, color: COLORS.textLight,
  },
});
