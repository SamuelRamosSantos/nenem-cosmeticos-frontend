import { synchronize } from '@nozbe/watermelondb/sync';

// Expo expõe variáveis de ambiente com prefixo EXPO_PUBLIC_
// Defina EXPO_PUBLIC_API_URL no arquivo .env para sobrescrever o padrão.
const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'https://nenem-cosmeticos.onrender.com/api';

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
