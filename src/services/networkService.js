import NetInfo from '@react-native-community/netinfo';

// isInternetReachable pode vir `null` enquanto o NetInfo ainda está checando;
// nesse caso confiamos em isConnected (presença de interface de rede).
export async function estaConectado() {
  const estado = await NetInfo.fetch();
  return Boolean(estado.isConnected && estado.isInternetReachable !== false);
}
