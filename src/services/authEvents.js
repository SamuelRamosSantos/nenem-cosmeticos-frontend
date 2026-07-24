import { Alert } from 'react-native';

// =============================================================================
// authEvents
//
// Ponte entre módulos comuns (syncService, apiClient — fora da árvore React,
// sem acesso a hooks) e o logout() real do AuthContext. O AuthContext se
// registra aqui uma vez ao montar; qualquer chamada de API que receber 401
// invoca sessaoExpirada(), que mostra o alerta e, na confirmação, dispara
// esse mesmo logout() — sem duplicar a lógica de limpar SecureStore/estado
// que já existe em AuthContext.logout() (NC-86).
// =============================================================================
let logoutHandler = null;

export function registrarLogoutHandler(fn) {
  logoutHandler = fn;
}

// Evita empilhar vários alertas se pull+push (ou telas concorrentes) caírem
// em 401 ao mesmo tempo.
let alertaAberto = false;

export function sessaoExpirada() {
  if (alertaAberto) return;
  alertaAberto = true;
  Alert.alert(
    'Login expirado',
    'Sua sessão expirou. Faça login novamente.',
    [{
      text: 'OK',
      onPress: () => {
        alertaAberto = false;
        logoutHandler?.();
      },
    }],
    { cancelable: false }
  );
}

// Erro dedicado pra chamadas 401 — os catch blocks das telas checam
// err.sessaoExpirada pra não mostrar um segundo alerta genérico em cima do
// "Login expirado" que sessaoExpirada() já exibiu.
export class SessaoExpiradaError extends Error {
  constructor() {
    super('Sessão expirada. Faça login novamente.');
    this.sessaoExpirada = true;
  }
}
