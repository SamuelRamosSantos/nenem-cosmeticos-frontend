import React from 'react';
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import { useNavigation } from '@react-navigation/native';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import database from '../database';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

// Lista reativa — apenas marcas ativas
const MarcasListBase = ({ marcas, onEditar, onExcluir }) => {
  if (!marcas?.length) {
    return (
      <View style={styles.empty}>
        <Ionicons name="pricetag-outline" size={52} color={COLORS.textLight} />
        <Text style={styles.emptyTitle}>Nenhuma marca cadastrada</Text>
        <Text style={styles.emptySub}>Use o botão + para criar a primeira</Text>
      </View>
    );
  }
  return (
    <FlatList
      data={marcas}
      keyExtractor={m => m.id}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
        <View style={[styles.card, SHADOW.sm]}>
          <View style={styles.cardIcon}>
            <Ionicons name="pricetag" size={20} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardNome}>{item.nome}</Text>
            <Text style={styles.cardComissao}>{item.percentualComissao}% de comissão</Text>
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
  marcas: database.get('marcas').query(Q.where('ativo', true)),
}));
const MarcasList = enhance(MarcasListBase);

export default function GerenciarMarcasScreen() {
  const db         = useDatabase();
  const navigation = useNavigation();

  const handleExcluir = (marca) => {
    Alert.alert(
      'Excluir Marca',
      `Deseja excluir a marca "${marca.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              // Verifica se há produtos vinculados
              const produtos = await db
                .get('produtos')
                .query(Q.where('marca_id', marca.id))
                .fetch();

              if (produtos.length === 0) {
                // Sem produtos → hard delete direto
                await db.write(async () => {
                  await marca.destroyPermanently();
                });
                return;
              }

              // Verifica se algum produto foi vendido
              let temVendas = false;
              for (const p of produtos) {
                const count = await db
                  .get('vendas_itens')
                  .query(Q.where('produto_id', p.id))
                  .fetchCount();
                if (count > 0) { temVendas = true; break; }
              }

              if (!temVendas) {
                // Sem histórico → hard delete da marca; produtos ficam sem marca (marcaId = null)
                await db.write(async () => {
                  for (const p of produtos) {
                    await p.update(prod => { prod.marcaId = null; });
                  }
                  await marca.destroyPermanently();
                });
              } else {
                // Com histórico de vendas → soft delete (preserva tudo)
                await db.write(async () => {
                  for (const p of produtos) {
                    await p.update(prod => { prod.ativo = false; });
                  }
                  await marca.update(m => { m.ativo = false; });
                });
                Alert.alert(
                  'Marca Inativada',
                  'Possui histórico de vendas — foi inativada e seus produtos foram ocultados.'
                );
              }
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
      <MarcasList
        onEditar={m => navigation.navigate('CadastrarMarca', { marca: m })}
        onExcluir={handleExcluir}
      />
      <TouchableOpacity
        style={[styles.fab, SHADOW.lg]}
        onPress={() => navigation.navigate('CadastrarMarca')}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
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
  cardNome:     { fontSize: FONT.md, fontWeight: '600', color: COLORS.text },
  cardComissao: { fontSize: FONT.sm, color: COLORS.textSecondary, marginTop: 2 },
  actionBtn: {
    width: 36, height: 36, borderRadius: RADIUS.sm,
    borderWidth: 1.5, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  fab: {
    position: 'absolute', right: SPACING.md, bottom: SPACING.lg,
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
});
