import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, Alert, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Q } from '@nozbe/watermelondb';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import FormInput from '../components/FormInput';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

export default function CadastrarMarcaScreen({ navigation, route }) {
  const db       = useDatabase();
  const editando = route.params?.marca;

  const [nome,              setNome]              = useState(editando?.nome ?? '');
  const [percentualComissao, setPercentualComissao] = useState(
    editando?.percentualComissao?.toString() ?? ''
  );
  const [loading, setLoading] = useState(false);

  const handleComissaoChange = (text) => {
    const limpo = text.replace(/[^0-9.,]/g, '');
    const partes = limpo.split(/[.,]/);
    if (partes.length > 2) return;
    setPercentualComissao(limpo);
  };

  const handleSalvar = async () => {
    if (!nome.trim()) {
      Alert.alert('Atenção', 'O nome da marca é obrigatório.');
      return;
    }
    const comissao = parseFloat(percentualComissao.replace(',', '.'));
    if (isNaN(comissao) || comissao < 0 || comissao > 100) {
      Alert.alert('Atenção', 'Informe um percentual de comissão válido (0 a 100).');
      return;
    }

    setLoading(true);
    try {
      if (editando) {
        const comissaoAnterior = editando.percentualComissao;
        const comissaoMudou    = comissaoAnterior !== comissao;

        // Busca todos os produtos desta marca (para batch update de custo)
        const produtos = comissaoMudou
          ? await db.get('produtos').query(Q.where('marca_id', editando.id)).fetch()
          : [];

        await db.write(async () => {
          await editando.update(m => {
            m.nome               = nome.trim();
            m.percentualComissao = comissao;
          });

          // Recalcula custo de todos os produtos da marca em batch
          // Regra: custo = precoVenda * (1 - comissao/100)
          if (comissaoMudou && produtos.length > 0) {
            const ops = produtos.map(p =>
              p.prepareUpdate(prod => {
                prod.custoPreco = prod.precoVenda * (1 - comissao / 100);
              })
            );
            await db.batch(...ops);
          }
        });
      } else {
        await db.write(async () => {
          await db.get('marcas').create(m => {
            m.nome               = nome.trim();
            m.percentualComissao = comissao;
            m.ativo              = true;
          });
        });
      }
      navigation.goBack();
    } catch (err) {
      Alert.alert('Erro ao salvar', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleExcluir = () => {
    if (!editando) return;
    Alert.alert(
      'Excluir Marca',
      `Deseja excluir a marca "${editando.nome}"?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            setLoading(true);
            try {
              const produtos = await db
                .get('produtos')
                .query(Q.where('marca_id', editando.id))
                .fetch();

              if (produtos.length === 0) {
                await db.write(async () => { await editando.markAsDeleted(); });
              } else {
                let temVendas = false;
                for (const p of produtos) {
                  const c = await db
                    .get('vendas_itens')
                    .query(Q.where('produto_id', p.id))
                    .fetchCount();
                  if (c > 0) { temVendas = true; break; }
                }

                if (!temVendas) {
                  await db.write(async () => {
                    for (const p of produtos) await p.markAsDeleted();
                    await editando.markAsDeleted();
                  });
                } else {
                  await db.write(async () => {
                    for (const p of produtos) {
                      await p.update(prod => { prod.ativo = false; });
                    }
                    await editando.update(m => { m.ativo = false; });
                  });
                  Alert.alert('Marca Inativada', 'Possui histórico de vendas — foi inativada.');
                }
              }
              navigation.goBack();
            } catch (err) {
              Alert.alert('Erro', err.message);
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

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
        <FormInput
          label="Nome da Marca"
          required
          value={nome}
          onChangeText={v => setNome(v.toUpperCase())}
          placeholder="EX: O BOTICÁRIO, NATURA..."
          autoCapitalize="characters"
        />

        <FormInput
          label="Percentual de Comissão (%)"
          required
          value={percentualComissao}
          onChangeText={handleComissaoChange}
          placeholder="Ex: 15"
          keyboardType="numeric"
          hint={editando
            ? 'Ao alterar, o custo de todos os produtos desta marca será recalculado'
            : 'Percentual repassado ao fornecedor por venda'
          }
        />
      </View>

      <TouchableOpacity
        style={[styles.salvarBtn, loading && styles.disabled, SHADOW.md]}
        onPress={handleSalvar}
        disabled={loading}
      >
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Ionicons name="checkmark-circle" size={22} color="#fff" />
            <Text style={styles.salvarBtnText}>
              {editando ? 'Atualizar Marca' : 'Cadastrar Marca'}
            </Text>
          </>
        )}
      </TouchableOpacity>

      {editando && (
        <TouchableOpacity
          style={[styles.excluirBtn, loading && styles.disabled]}
          onPress={handleExcluir}
          disabled={loading}
        >
          <Ionicons name="trash-outline" size={20} color={COLORS.error} />
          <Text style={styles.excluirBtnText}>Excluir / Inativar Marca</Text>
        </TouchableOpacity>
      )}
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
  salvarBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.lg,
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center',
    padding: SPACING.md + 2, gap: SPACING.sm,
    marginBottom: SPACING.sm,
  },
  salvarBtnText: { color: '#fff', fontSize: FONT.lg, fontWeight: '800' },
  excluirBtn: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'center', gap: SPACING.sm,
    padding: SPACING.md,
    borderRadius: RADIUS.lg,
    borderWidth: 1.5,
    borderColor: COLORS.errorLight,
    backgroundColor: COLORS.errorLight,
  },
  excluirBtnText: { color: COLORS.error, fontSize: FONT.md, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
