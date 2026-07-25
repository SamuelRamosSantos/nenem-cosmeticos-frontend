import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { useAuth } from '../contexts/AuthContext';
import { sincronizar, obterUltimaSincronizacao } from '../services/syncService';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const DB_NAME = 'watermelon';

const fmtDataHora = (ms) => {
  const d = new Date(ms);
  const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${data} às ${hora}`;
};

// =============================================================================
// Função Híbrida Universal (Funciona em Desenvolvimento, Dev Client e APK Final)
// =============================================================================
async function exportarBancoDeDados() {
  const baseDir = FileSystem.documentDirectory;
  if (!baseDir) throw new Error("Sistema de arquivos indisponível.");

  const raizDoApp = baseDir.replace('files/', '');

  // 1. Mapeamento dos caminhos absolutos e oficiais de Produção/Standalone
  const caminhosEstaticos = [
    `${raizDoApp}databases/watermelon`,          // Padrão nativo Android em Produção
    `${raizDoApp}databases/watermelon.db`,       // Variação nativa Android
    `${baseDir}SQLite/watermelon`,              // Padrão Expo SQLite em Produção
    `${baseDir}SQLite/watermelon.db`,           // Variação Expo SQLite
    `${baseDir}watermelon`,                     // Fallback raiz (o que vimos no Dev Client)
    `${baseDir}watermelon.db`                   // Fallback raiz com extensão
  ];

  // Estratégia 1: Tenta o acesso direto e ultra-rápido nos caminhos oficiais
  for (const caminho of caminhosEstaticos) {
    try {
      const info = await FileSystem.getInfoAsync(caminho);
      if (info.exists && !info.isDirectory) {
        return await gerarCopiaDeSeguranca(caminho);
      }
    } catch (e) {
      // Ignora erro de permissão e tenta o próximo da lista
    }
  }

  // Estratégia 2: Se os caminhos mudarem por atualizações do SDK, o radar varre tudo
  const pastasParaVarrer = [
    raizDoApp,
    baseDir,
    `${raizDoApp}databases/`,
    `${baseDir}SQLite/`
  ];

  for (const pasta of pastasParaVarrer) {
    try {
      const info = await FileSystem.getInfoAsync(pasta);
      if (info.exists && info.isDirectory) {
        const arquivos = await FileSystem.readDirectoryAsync(pasta);

        // Procura o arquivo do banco eliminando logs, caches e bundles JS
        const bancoEncontrado = arquivos.find(f =>
          (f.includes('watermelon') || f.includes('.db')) &&
          !f.includes('-journal') &&
          !f.includes('-wal') &&
          !f.endsWith('.js')
        );

        if (bancoEncontrado) {
          return await gerarCopiaDeSeguranca(pasta + bancoEncontrado);
        }
      }
    } catch (e) {
      // Avança se a pasta estiver bloqueada ou vazia
    }
  }

  throw new Error("Banco de dados não localizado. Certifique-se de realizar uma sincronização antes de exportar.");
}

// Função auxiliar para isolar a lógica de cópia e renomeação
async function gerarCopiaDeSeguranca(caminhoOrigem) {
  const destino = `${FileSystem.cacheDirectory}Backup_NenemCosmeticos.db`;
  await FileSystem.copyAsync({ from: caminhoOrigem, to: destino });
  return destino;
}

// =============================================================================
// Tela Principal de Configurações
// =============================================================================
export default function ConfiguracoesScreen() {
  const navigation = useNavigation();
  const db = useDatabase();
  const { logout, usuarioLogado } = useAuth();
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState(null);

  useFocusEffect(useCallback(() => {
    obterUltimaSincronizacao().then(setUltimaSincronizacao);
  }, []));

  const handleLogout = () => {
    Alert.alert(
      'Sair', 'Deseja encerrar a sessão?',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Sair', style: 'destructive', onPress: () => logout() },
      ],
    );
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await sincronizar(db);
      setUltimaSincronizacao(Date.now());
      Alert.alert('Sincronização concluída', `Às ${new Date().toLocaleTimeString('pt-BR')}`);
    } catch (err) {
      // Sessão expirada já mostrou seu próprio alerta e força o logout (NC-86).
      if (!err.sessaoExpirada) {
        Alert.alert('Erro na sincronização', err.message);
      }
    } finally {
      setSyncing(false);
    }
  };

  // Esta função agora está dentro da tela, então o setExporting vai funcionar perfeitamente
  const handleExportarBD = async () => {
    setExporting(true);
    try {
      const destino = await exportarBancoDeDados();

      const disponivel = await Sharing.isAvailableAsync();
      if (!disponivel) {
        Alert.alert('Indisponível', 'Compartilhamento não suportado neste dispositivo.');
        return;
      }

      await Sharing.shareAsync(destino, {
        mimeType: 'application/x-sqlite3',
        dialogTitle: 'Exportar Banco de Dados',
        UTI: 'public.database',
      });
    } catch (err) {
      Alert.alert('Erro ao exportar', err.message);
    } finally {
      setExporting(false);
    }
  };

  const GRUPOS = [
    {
      titulo: 'Dados',
      itens: [
        {
          key: 'sync', loading: syncing,
          label: syncing ? 'Sincronizando...' : 'Sincronizar Dados',
          sub: 'Envia e recebe dados com o servidor',
          icon: 'sync-outline', onPress: handleSync,
        },
        {
          key: 'export', loading: exporting,
          label: exporting ? 'Exportando...' : 'Exportar Banco de Dados',
          sub: 'Gera um backup .db e compartilha',
          icon: 'download-outline', onPress: handleExportarBD,
        },
      ],
    },
    {
      titulo: 'Cadastros',
      itens: [
        { key: 'usuarios', label: 'Gestão de Usuários', sub: 'Cadastrar, editar e inativar usuários', icon: 'people-outline', tela: 'GerenciarUsuarios' },
        { key: 'marcas', label: 'Gerenciar Marcas', sub: 'Ver, editar e inativar marcas', icon: 'pricetag-outline', tela: 'GerenciarMarcas' },
        { key: 'pagamentos', label: 'Formas de Pagamento', sub: 'Adicionar ou remover formas de pagamento', icon: 'card-outline', tela: 'FormasPagamento' },
      ],
    },
  ];

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={[styles.infoCard, SHADOW.sm]}>
        <View style={styles.infoRow}>
          <Ionicons name="person-circle-outline" size={18} color={COLORS.primary} />
          <Text style={styles.infoLabel}>Usuário logado</Text>
          <Text style={styles.infoValor} numberOfLines={1}>{usuarioLogado ?? '—'}</Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Ionicons name="sync-outline" size={18} color={COLORS.primary} />
          <Text style={styles.infoLabel}>Última sincronização</Text>
          <Text style={styles.infoValor} numberOfLines={1}>
            {ultimaSincronizacao ? fmtDataHora(ultimaSincronizacao) : 'Nunca'}
          </Text>
        </View>
        <View style={[styles.infoRow, styles.infoRowBorder]}>
          <Ionicons name="information-circle-outline" size={18} color={COLORS.primary} />
          <Text style={styles.infoLabel}>Versão do app</Text>
          <Text style={styles.infoValor}>{Constants.expoConfig?.version ?? '—'}</Text>
        </View>
      </View>

      {GRUPOS.map(grupo => (
        <View key={grupo.titulo} style={styles.grupo}>
          <Text style={styles.grupoTitulo}>{grupo.titulo}</Text>
          <View style={[styles.card, SHADOW.sm]}>
            {grupo.itens.map((item, idx) => (
              <TouchableOpacity
                key={item.key}
                style={[
                  styles.menuItem,
                  idx < grupo.itens.length - 1 && styles.menuItemBorder,
                  item.loading && { opacity: 0.7 },
                ]}
                onPress={item.tela ? () => navigation.navigate(item.tela) : item.onPress}
                disabled={item.loading}
                activeOpacity={0.7}
              >
                <View style={styles.menuIconWrap}>
                  {item.loading
                    ? <ActivityIndicator size="small" color={COLORS.primary} />
                    : <Ionicons name={item.icon} size={22} color={COLORS.primary} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuLabel}>{item.label}</Text>
                  <Text style={styles.menuSub}>{item.sub}</Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      ))}

      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
        <Ionicons name="log-out-outline" size={20} color={COLORS.error} />
        <Text style={styles.logoutText}>Sair</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.md, paddingBottom: SPACING.xl },

  infoCard: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: SPACING.lg, overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm + 2,
  },
  infoRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.divider },
  infoLabel: { flex: 1, fontSize: FONT.sm, color: COLORS.textSecondary },
  infoValor: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text, maxWidth: '45%' },

  grupo: { marginBottom: SPACING.lg },
  grupoTitulo: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginBottom: SPACING.sm, marginLeft: SPACING.xs,
  },
  card: {
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border, overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', padding: SPACING.md, gap: SPACING.md,
  },
  menuItemBorder: { borderBottomWidth: 1, borderBottomColor: COLORS.divider },
  menuIconWrap: {
    width: 40, height: 40, borderRadius: RADIUS.md,
    backgroundColor: COLORS.primaryLight, alignItems: 'center', justifyContent: 'center',
  },
  menuLabel: { fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
  menuSub: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: SPACING.sm, padding: SPACING.md, marginTop: SPACING.sm,
    borderRadius: RADIUS.lg, borderWidth: 1.5, borderColor: COLORS.errorLight,
    backgroundColor: COLORS.errorLight,
  },
  logoutText: { fontSize: FONT.md, fontWeight: '700', color: COLORS.error },
});