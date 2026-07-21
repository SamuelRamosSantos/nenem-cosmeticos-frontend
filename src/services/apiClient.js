import * as SecureStore from 'expo-secure-store';
import { API_URL } from './syncService';

// Fetch autenticado — anexa o JWT salvo no primeiro/último login (ver
// AuthContext.js). Usado pelas telas que falam direto com o backend em vez
// de ler do WatermelonDB (hoje: Gestão de Usuários — NC-68).
export async function fetchAutenticado(caminho, options = {}) {
  const token = await SecureStore.getItemAsync('jwt');

  const response = await fetch(`${API_URL}${caminho}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || `Erro na requisição (${response.status}).`);
  }

  return data;
}
