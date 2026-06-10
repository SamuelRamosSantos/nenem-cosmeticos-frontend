import React, { useState } from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TextInput, TouchableOpacity,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { useNavigation } from '@react-navigation/native';
import withObservables from '@nozbe/with-observables';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const FILTROS = [
  { key: 'todos', label: 'Todos' },
  { key: 'C',     label: 'Clientes' },
  { key: 'F',     label: 'Fornecedores' },
];

// Formata dígitos brutos como número de telefone para exibição
function formatarTelefone(nums) {
  if (!nums) return '';
  const d = nums.replace(/\D/g, '');
  if (d.length === 0)  return nums; // já está formatado ou texto livre
  if (d.length <= 10)  return `(${d.slice(0,2)}) ${d.slice(2,6)}-${d.slice(6)}`;
  return `(${d.slice(0,2)}) ${d.slice(2,7)}-${d.slice(7)}`;
}

// =============================================================================
// Lista reativa com withObservables — filtro por tipo e busca por nome
// =============================================================================
const PessoasListBase = ({ pessoas, onEditar }) => {
  if (!pessoas?.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="people-outline" size={56} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>Nenhum cadastro</Text>
        <Text style={styles.emptySub}>Toque no + para cadastrar</Text>
      </View>
    );
  }

  return (
    <FlatList
      data={pessoas}
      keyExtractor={item => item.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => {
        const isCliente = item.tipo === 'C';
        return (
          <TouchableOpacity
            style={[styles.card, SHADOW.sm]}
            onPress={() => onEditar(item)}
            activeOpacity={0.7}
          >
            <View style={[styles.avatar, { backgroundColor: isCliente ? COLORS.primaryLight : '#E3F2FD' }]}>
              <Ionicons
                name={isCliente ? 'person' : 'business'}
                size={22}
                color={isCliente ? COLORS.primary : '#1565C0'}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardNome} numberOfLines={1}>{item.nome}</Text>
              {item.telefone ? (
                <View style={styles.phoneRow}>
                  <Ionicons name="call-outline" size={12} color={COLORS.textSecondary} />
                  <Text style={styles.cardTelefone}>{formatarTelefone(item.telefone)}</Text>
                </View>
              ) : (
                <Text style={styles.semTelefone}>Sem telefone</Text>
              )}
            </View>
            <View style={[styles.tipoBadge, !isCliente && styles.tipoBadgeForn]}>
              <Text style={[styles.tipoBadgeText, !isCliente && styles.tipoBadgeTextForn]}>
                {isCliente ? 'Cliente' : 'Fornecedor'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={COLORS.textLight} />
          </TouchableOpacity>
        );
      }}
    />
  );
};

const enhance = withObservables(
  ['filtro', 'searchQuery'],
  ({ filtro, searchQuery }) => {
    const conditions = [];
    if (filtro !== 'todos') conditions.push(Q.where('tipo', filtro));
    if (searchQuery?.trim().length > 0) {
      conditions.push(Q.where('nome', Q.like(`%${searchQuery.trim()}%`)));
    }
    return { pessoas: database.get('pessoas').query(...conditions) };
  }
);
const PessoasList = enhance(PessoasListBase);

// =============================================================================
// Tela de Clientes
// =============================================================================
export default function ClientesScreen() {
  const navigation  = useNavigation();
  const [filtro,      setFiltro]      = useState('todos');
  const [searchQuery, setSearchQuery] = useState('');

  return (
    <View style={styles.container}>
      {/* Busca */}
      <View style={styles.searchContainer}>
        <View style={[styles.searchBar, SHADOW.sm]}>
          <Ionicons name="search-outline" size={18} color={COLORS.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Buscar pelo nome..."
            placeholderTextColor={COLORS.textLight}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filtros */}
      <View style={styles.filtrosRow}>
        {FILTROS.map(f => (
          <TouchableOpacity
            key={f.key}
            style={[styles.filtroBtn, filtro === f.key && styles.filtroBtnActive]}
            onPress={() => setFiltro(f.key)}
          >
            <Text style={[styles.filtroText, filtro === f.key && styles.filtroTextActive]}>
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <PessoasList
        filtro={filtro}
        searchQuery={searchQuery}
        onEditar={(p) => navigation.navigate('CadastrarPessoa', { pessoa: p })}
      />

      {/* FAB */}
      <TouchableOpacity
        style={[styles.fab, SHADOW.lg]}
        onPress={() => navigation.navigate('CadastrarPessoa')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: COLORS.background },
  searchContainer: { padding: SPACING.md, paddingBottom: SPACING.sm },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm + 2,
    gap: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  searchInput: { flex: 1, fontSize: FONT.md, color: COLORS.text, padding: 0 },
  filtrosRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  filtroBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full,
    backgroundColor: COLORS.surface,
    borderWidth: 1.5,
    borderColor: COLORS.border,
  },
  filtroBtnActive:  { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  filtroText:       { fontSize: FONT.sm, color: COLORS.textSecondary, fontWeight: '500' },
  filtroTextActive: { color: COLORS.primary, fontWeight: '700' },
  list: { padding: SPACING.md, paddingTop: SPACING.xs, gap: SPACING.sm, paddingBottom: 100 },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    gap: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  avatar: {
    width: 44, height: 44,
    borderRadius: RADIUS.full,
    alignItems: 'center', justifyContent: 'center',
  },
  cardNome:     { fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
  phoneRow:     { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  cardTelefone: { fontSize: FONT.sm, color: COLORS.textSecondary },
  semTelefone:  { fontSize: FONT.sm, color: COLORS.textLight, fontStyle: 'italic', marginTop: 3 },
  tipoBadge: {
    paddingHorizontal: SPACING.sm, paddingVertical: 4,
    borderRadius: RADIUS.full, backgroundColor: COLORS.primaryLight,
  },
  tipoBadgeForn:     { backgroundColor: '#E3F2FD' },
  tipoBadgeText:     { fontSize: FONT.xs, color: COLORS.primary, fontWeight: '700' },
  tipoBadgeTextForn: { color: '#1565C0' },
  fab: {
    position: 'absolute',
    right: SPACING.md,
    bottom: SPACING.lg,
    width: 56, height: 56,
    borderRadius: 28,
    backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  empty: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    padding: SPACING.xl, gap: SPACING.sm, marginTop: 60,
  },
  emptyTitle: { fontSize: FONT.lg, fontWeight: '700', color: COLORS.textSecondary },
  emptySub:   { fontSize: FONT.sm, color: COLORS.textLight, textAlign: 'center' },
});
