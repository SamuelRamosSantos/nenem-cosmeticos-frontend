import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useDatabase } from '@nozbe/watermelondb/hooks';
import { Q } from '@nozbe/watermelondb';
import withObservables from '@nozbe/with-observables';
import database from '../database';
import { registrarBaixaEmLote, calcularSaldoDevido } from '../services/financeiroService';
import { COLORS, SPACING, FONT, RADIUS, SHADOW } from '../theme';

const fmt = (n) => `R$ ${Number(n || 0).toFixed(2).replace('.', ',')}`;
const fmtData = (ms) => {
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
};

// Só aceita número com vírgula/ponto -> float
function parseValor(texto) {
  const n = parseFloat(String(texto).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

// Máscara de moeda estilo "calculadora": dígitos entram pela direita,
// preenchendo sempre no formato 0,00 (ex.: digitar 5 -> 0,05 -> 0,57 -> 5,79).
function aplicarMascaraMoeda(textoNovo) {
  const digitos = textoNovo.replace(/\D/g, '');
  const centavos = parseInt(digitos || '0', 10);
  return (centavos / 100).toFixed(2).replace('.', ',');
}

// Formas de recebimento aceitas na baixa: só À Vista ('V') e Cartão ('C').
// Busca TODAS reativamente (mesmo padrão já usado no PDV) e filtra em JS —
// evita qualquer particularidade do operador Q.oneOf no filtro do banco.
const FormasBaixaBase = ({ formas, selecionada, onSelecionar }) => (
  <View style={styles.formasRow}>
    {formas.filter(f => f.tipo === 'V' || f.tipo === 'C').map(f => (
      <TouchableOpacity
        key={f.id}
        style={[styles.formaBadge, selecionada?.id === f.id && styles.formaBadgeSelected]}
        onPress={() => onSelecionar(f)}
      >
        <Text style={[styles.formaBadgeText, selecionada?.id === f.id && styles.formaBadgeTextSelected]}>
          {f.descricao}
        </Text>
      </TouchableOpacity>
    ))}
  </View>
);
const enhanceFormasBaixa = withObservables([], () => ({
  formas: database.get('formas_pagamento').query(),
}));
const FormasBaixa = enhanceFormasBaixa(FormasBaixaBase);

// =============================================================================
// Tela Caixa de Recebimento (NC-77)
//
// Só é aberta a partir da tela de Detalhes do Título, com um cliente e um
// conjunto de títulos já selecionados (tituloIdsPreSelecionados) — aqui não
// dá mais pra trocar de cliente nem escolher outros títulos, só confirmar a
// baixa dos que já vieram selecionados.
// =============================================================================
export default function CaixaRecebimentoScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const db = useDatabase();

  const [cliente, setCliente] = useState(null);
  const [titulosSelecionados, setTitulosSelecionados] = useState([]);
  const [saldosPorTitulo, setSaldosPorTitulo] = useState({});
  const [carregando, setCarregando] = useState(true);

  const [formaSelecionada, setFormaSelecionada] = useState(null);
  const [modalidadeCartao, setModalidadeCartao] = useState('D');
  const [parcelasCartao, setParcelasCartao] = useState(1);
  const [valorDesconto, setValorDesconto] = useState('0,00');
  const [valorJuros, setValorJuros] = useState('0,00');
  const [valorPago, setValorPago] = useState('0,00');
  const [valorEditadoManualmente, setValorEditadoManualmente] = useState(false);
  const [dataBaixa, setDataBaixa] = useState(() => new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    const clienteId = route.params?.clienteId;
    const tituloIds = route.params?.tituloIdsPreSelecionados;
    if (!clienteId || !tituloIds?.length) {
      Alert.alert('Nenhum título selecionado', 'Volte aos Detalhes do Título e selecione ao menos uma parcela.');
      navigation.goBack();
      return;
    }

    (async () => {
      try {
        const [p, titulos] = await Promise.all([
          db.get('pessoas').find(clienteId),
          db.get('titulos').query(Q.where('id', Q.oneOf(tituloIds))).fetch(),
        ]);
        titulos.sort((a, b) => a.dataVencimento - b.dataVencimento);

        const saldos = {};
        for (const titulo of titulos) {
          const baixas = await db.get('titulos_baixas').query(Q.where('titulo_id', titulo.id)).fetch();
          saldos[titulo.id] = calcularSaldoDevido(titulo, baixas);
        }

        setCliente(p);
        setTitulosSelecionados(titulos);
        setSaldosPorTitulo(saldos);
      } catch (e) {
        Alert.alert('Erro', e.message);
        navigation.goBack();
      } finally {
        setCarregando(false);
      }
    })();
  }, [route.params?.clienteId, route.params?.tituloIdsPreSelecionados, db, navigation]);

  const handleSelecionarForma = (forma) => {
    setFormaSelecionada(forma);
    setModalidadeCartao('D');
    setParcelasCartao(1);
  };

  const saldoSelecionado = titulosSelecionados.reduce((acc, t) => acc + (saldosPorTitulo[t.id] ?? 0), 0);

  // Sugere o valor a pagar = saldo total selecionado - desconto + juros,
  // mas só enquanto o usuário não editar o campo manualmente (permite parcial)
  useEffect(() => {
    if (valorEditadoManualmente) return;
    const desconto = parseValor(valorDesconto);
    const juros = parseValor(valorJuros);
    const sugestao = Math.max(0, Math.round((saldoSelecionado - desconto + juros) * 100) / 100);
    setValorPago(sugestao.toFixed(2).replace('.', ','));
  }, [saldoSelecionado, valorDesconto, valorJuros, valorEditadoManualmente]);

  const onDataBaixaChange = (event, selecionada) => {
    setShowDatePicker(false);
    if (selecionada && event.type !== 'dismissed') {
      setDataBaixa(selecionada);
    }
  };

  const handleConfirmarBaixa = async () => {
    if (!formaSelecionada) {
      Alert.alert('Selecione a forma de pagamento do recebimento.');
      return;
    }
    const pago = parseValor(valorPago);
    const desconto = parseValor(valorDesconto);
    if (pago <= 0 && desconto <= 0) {
      Alert.alert('Informe um valor de pagamento ou desconto maior que zero.');
      return;
    }

    setSalvando(true);
    try {
      await registrarBaixaEmLote(db, {
        tituloIds: titulosSelecionados.map(t => t.id),
        formaPagamentoId: formaSelecionada.id,
        valorPago: pago,
        valorDesconto: desconto,
        valorJuros: parseValor(valorJuros),
        dataBaixa,
        modalidadeCartao,
        parcelas: parcelasCartao,
      });
      Alert.alert('Baixa registrada', 'O recebimento foi registrado com sucesso.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Erro ao registrar baixa', e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ paddingBottom: SPACING.xl }} keyboardShouldPersistTaps="handled">
        <View style={styles.clienteChip}>
          <Ionicons name="person" size={16} color={COLORS.primary} />
          <Text style={styles.clienteChipText} numberOfLines={1}>{cliente?.nome}</Text>
        </View>

        <Text style={styles.sectionLabel}>
          TÍTULOS SELECIONADOS ({titulosSelecionados.length})
        </Text>
        <View style={{ paddingHorizontal: SPACING.md, gap: SPACING.sm }}>
          {titulosSelecionados.map(item => (
            <View key={item.id} style={[styles.tituloCard, SHADOW.sm]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.tituloCodigo}>
                  Parcela {item.parcelaNumero}/{item.parcelasTotal}
                </Text>
                <Text style={styles.tituloVencimento}>Vence em {fmtData(item.dataVencimento)}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.tituloSaldo}>{fmt(saldosPorTitulo[item.id])}</Text>
                {item.status === 'Parcial' && <Text style={styles.tituloParcialTag}>Parcial</Text>}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.formCard}>
          <View style={styles.selecaoResumoRow}>
            <Text style={styles.selecaoResumoLabel}>Saldo devido total</Text>
            <Text style={styles.selecaoResumoValor}>{fmt(saldoSelecionado)}</Text>
          </View>

          <Text style={styles.sectionLabel}>DATA DA BAIXA</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={15} color={COLORS.primary} />
            <Text style={styles.dateBtnText}>{fmtData(dataBaixa.getTime())}</Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker value={dataBaixa} mode="date" display="default" onChange={onDataBaixaChange} />
          )}

          <Text style={[styles.sectionLabel, { marginTop: SPACING.md }]}>FORMA DE RECEBIMENTO</Text>
          <FormasBaixa selecionada={formaSelecionada} onSelecionar={handleSelecionarForma} />

          {formaSelecionada?.tipo === 'C' && (
            <View style={styles.cartaoWrap}>
              <View style={styles.modalidadeRow}>
                {[{ key: 'D', label: 'Débito' }, { key: 'C', label: 'Crédito' }].map(m => (
                  <TouchableOpacity
                    key={m.key}
                    style={[styles.modalidadeChip, modalidadeCartao === m.key && styles.modalidadeChipAtiva]}
                    onPress={() => { setModalidadeCartao(m.key); setParcelasCartao(1); }}
                  >
                    <Text style={[styles.modalidadeChipText, modalidadeCartao === m.key && styles.modalidadeChipTextAtiva]}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              {modalidadeCartao === 'C' && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.parcelasScroll}>
                  {Array.from({ length: 18 }, (_, i) => i + 1).map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.parcelaChip, parcelasCartao === n && styles.parcelaChipAtiva]}
                      onPress={() => setParcelasCartao(n)}
                    >
                      <Text style={[styles.parcelaChipText, parcelasCartao === n && styles.parcelaChipTextAtiva]}>
                        {n}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}

          <View style={styles.camposRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.campoLabel}>Desconto (R$)</Text>
              <TextInput
                style={styles.campoInput}
                keyboardType="number-pad"
                value={valorDesconto}
                onChangeText={(t) => setValorDesconto(aplicarMascaraMoeda(t))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.campoLabel}>Juros / Mora (R$)</Text>
              <TextInput
                style={styles.campoInput}
                keyboardType="number-pad"
                value={valorJuros}
                onChangeText={(t) => setValorJuros(aplicarMascaraMoeda(t))}
              />
            </View>
          </View>

          <Text style={styles.campoLabel}>Valor a Receber (R$)</Text>
          <TextInput
            style={[styles.campoInput, styles.campoValorPago]}
            keyboardType="number-pad"
            value={valorPago}
            onChangeText={(t) => { setValorEditadoManualmente(true); setValorPago(aplicarMascaraMoeda(t)); }}
          />
          <Text style={styles.dicaParcial}>
            Pode ser parcial — informe um valor menor que o saldo devido.
          </Text>

          <TouchableOpacity
            style={[styles.confirmarBtn, SHADOW.md, salvando && { opacity: 0.7 }]}
            onPress={handleConfirmarBaixa}
            disabled={salvando}
          >
            {salvando
              ? <ActivityIndicator size="small" color="#fff" />
              : <Ionicons name="checkmark-circle" size={20} color="#fff" />}
            <Text style={styles.confirmarBtnText}>{salvando ? 'Registrando...' : 'Confirmar Baixa'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background },

  clienteChip: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary,
    padding: SPACING.sm, margin: SPACING.md, marginBottom: SPACING.sm,
  },
  clienteChipText: { flex: 1, fontSize: FONT.md, fontWeight: '700', color: COLORS.primary },

  sectionLabel: {
    fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary,
    textTransform: 'uppercase', letterSpacing: 0.5,
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm, marginTop: SPACING.xs,
  },

  tituloCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.surface, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.border,
    padding: SPACING.sm + 2,
  },
  tituloCodigo: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.text },
  tituloVencimento: { fontSize: FONT.xs, color: COLORS.textSecondary, marginTop: 2 },
  tituloSaldo: { fontSize: FONT.md, fontWeight: '800', color: COLORS.text },
  tituloParcialTag: { fontSize: FONT.xs, fontWeight: '700', color: COLORS.warning, marginTop: 2 },

  formCard: {
    margin: SPACING.md, padding: SPACING.md,
    backgroundColor: COLORS.surface, borderRadius: RADIUS.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  selecaoResumoRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: SPACING.sm, marginBottom: SPACING.sm,
    borderBottomWidth: 1, borderBottomColor: COLORS.divider,
  },
  selecaoResumoLabel: { fontSize: FONT.sm, color: COLORS.textSecondary },
  selecaoResumoValor: { fontSize: FONT.lg, fontWeight: '800', color: COLORS.primary },

  dateBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start',
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs + 3,
    backgroundColor: COLORS.primaryLight, borderRadius: RADIUS.md,
    borderWidth: 1.5, borderColor: COLORS.primary,
  },
  dateBtnText: { fontSize: FONT.sm, fontWeight: '700', color: COLORS.primary },

  formasRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm, marginBottom: SPACING.md },
  formaBadge: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.xs + 2,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border,
  },
  formaBadgeSelected: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  formaBadgeText: { fontSize: FONT.sm, fontWeight: '600', color: COLORS.text },
  formaBadgeTextSelected: { color: '#fff' },

  cartaoWrap: { marginBottom: SPACING.md },
  modalidadeRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.sm },
  modalidadeChip: {
    flex: 1, alignItems: 'center', paddingVertical: SPACING.sm,
    borderRadius: RADIUS.md, borderWidth: 1.5, borderColor: COLORS.border,
  },
  modalidadeChipAtiva: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  modalidadeChipText: { fontSize: FONT.sm, fontWeight: '600', color: COLORS.textSecondary },
  modalidadeChipTextAtiva: { color: COLORS.primary, fontWeight: '700' },
  parcelasScroll: { flexGrow: 0 },
  parcelaChip: {
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: RADIUS.full, borderWidth: 1.5, borderColor: COLORS.border,
    marginRight: SPACING.xs,
  },
  parcelaChipAtiva: { backgroundColor: COLORS.primaryLight, borderColor: COLORS.primary },
  parcelaChipText: { fontSize: FONT.sm, color: COLORS.textSecondary, fontWeight: '600' },
  parcelaChipTextAtiva: { color: COLORS.primary, fontWeight: '700' },

  camposRow: { flexDirection: 'row', gap: SPACING.sm },
  campoLabel: { fontSize: FONT.xs, fontWeight: '700', color: COLORS.textSecondary, marginBottom: 4, marginTop: SPACING.xs },
  campoInput: {
    borderWidth: 1.5, borderColor: COLORS.border, borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.sm, paddingVertical: SPACING.sm - 2,
    fontSize: FONT.md, color: COLORS.text, backgroundColor: COLORS.background,
  },
  campoValorPago: { fontSize: FONT.lg, fontWeight: '800', color: COLORS.primary },
  dicaParcial: { fontSize: FONT.xs, color: COLORS.textLight, marginTop: 6, marginBottom: SPACING.md },

  confirmarBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: SPACING.xs,
    backgroundColor: COLORS.primary, borderRadius: RADIUS.md, paddingVertical: SPACING.sm + 2,
  },
  confirmarBtnText: { color: '#fff', fontSize: FONT.md, fontWeight: '700' },
});
