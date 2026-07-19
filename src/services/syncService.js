import { synchronize } from '@nozbe/watermelondb/sync';
import { estaConectado } from './networkService';

// Expo expõe variáveis de ambiente com prefixo EXPO_PUBLIC_
// Defina EXPO_PUBLIC_API_URL no arquivo .env para sobrescrever o padrão.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://nenem-cosmeticos.onrender.com/api';

// Mesma lista de tabelas sincronizáveis do backend (TABLE_CONFIG em
// sync.controller.js). 'coletas'/'coleta_itens' ficam de fora: são locais,
// nunca sobem pro servidor.
export const TABELAS_SINCRONIZAVEIS = [
  'usuarios', 'pessoas', 'marcas', 'formas_pagamento',
  'produtos', 'produto_kit_itens',
  'vendas', 'vendas_itens', 'vendas_pagamentos',
  'compras', 'compras_itens', 'compras_pagamentos',
  'estoque_movimentacoes',
];

// =============================================================================
// sincronizar
//
// Executa um ciclo completo de sincronização com o servidor:
//   1. Pull: busca mudanças do servidor desde o último sync
//   2. Push: envia mudanças locais pendentes para o servidor
//
// Deve ser chamada:
//   - Ao abrir o app (se houver conexão)
//   - Após finalizar uma venda
//   - Via botão manual de sincronização na UI
// =============================================================================
export async function sincronizar(database) {
  await synchronize({
    database,

    pullChanges: async ({ lastPulledAt, schemaVersion }) => {
      const params = new URLSearchParams({
        lastPulledAt: lastPulledAt ?? 0,
        schemaVersion,
      });

      const response = await fetch(`${API_URL}/sync/pull?${params}`);

      if (!response.ok) {
        throw new Error(
          `Falha no pull de sincronização: ${response.status} ${response.statusText}`
        );
      }

      // Formato esperado: { changes: { tabela: { created, updated, deleted } }, timestamp }
      return response.json();
    },

    pushChanges: async ({ changes, lastPulledAt }) => {
      const response = await fetch(
        `${API_URL}/sync/push?lastPulledAt=${lastPulledAt ?? 0}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ changes }),
        }
      );

      if (!response.ok) {
        throw new Error(
          `Falha no push de sincronização: ${response.status} ${response.statusText}`
        );
      }
    },

    // Informa ao WatermelonDB a partir de qual versão de schema as migrations
    // estão ativas (usar 1 enquanto não houver migrations implementadas)
    migrationsEnabledAtVersion: 1,
  });
}

// Lock simples: evita duas sincronizações automáticas concorrentes e também
// evita que o próprio pull do sync (que grava nas tabelas observadas) dispare
// uma nova sincronização reativa em cadeia.
let sincronizacaoEmAndamento = false;

// =============================================================================
// sincronizarSeConectado
//
// Versão "silenciosa" de sincronizar(): só executa se houver conexão, não
// lança para o chamador (loga em caso de falha) e nunca roda em paralelo com
// outra sincronização automática já em curso. Pensada para os gatilhos
// automáticos (onLoad, pós-movimentação) — o botão manual de sincronização
// continua usando sincronizar() diretamente, com feedback de erro ao usuário.
// =============================================================================
export async function sincronizarSeConectado(database) {
  if (sincronizacaoEmAndamento) return;
  if (!(await estaConectado())) return;

  sincronizacaoEmAndamento = true;
  try {
    await sincronizar(database);
  } catch (err) {
    console.warn('[AutoSync] Falha na sincronização automática:', err.message);
  } finally {
    sincronizacaoEmAndamento = false;
  }
}

// =============================================================================
// iniciarSincronizacaoReativa
//
// Assina mudanças em qualquer tabela sincronizável e dispara sincronizarSeConectado
// com debounce (agrupa múltiplas gravações próximas — ex.: uma venda que grava
// vendas + vendas_itens + estoque_movimentacoes em write()s separados — numa
// única sincronização). Retorna uma função de cleanup (unsubscribe).
// =============================================================================
export function iniciarSincronizacaoReativa(database, delayMs = 2000) {
  let timer = null;

  const unsubscribe = database.experimentalSubscribe(
    TABELAS_SINCRONIZAVEIS,
    () => {
      // Mudança gerada pelo próprio pull do sync em andamento — ignora,
      // senão o sync reagendaria a si mesmo indefinidamente.
      if (sincronizacaoEmAndamento) return;
      clearTimeout(timer);
      timer = setTimeout(() => sincronizarSeConectado(database), delayMs);
    },
    'sincronizacao-reativa'
  );

  return () => {
    clearTimeout(timer);
    unsubscribe();
  };
}
