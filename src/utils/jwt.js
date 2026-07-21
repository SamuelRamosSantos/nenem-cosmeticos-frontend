// Decodificação local do payload do JWT — só pra ler o "exp" e decidir se a
// sessão expirou. NÃO valida assinatura (isso é sempre feito pelo backend em
// cada requisição); aqui é puramente uma checagem de UX no app.

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function base64UrlDecode(input) {
  const str = input.replace(/-/g, '+').replace(/_/g, '/');
  let output = '';
  let buffer = 0;
  let bits = 0;
  for (const char of str) {
    if (char === '=') break;
    const value = BASE64_CHARS.indexOf(char);
    if (value === -1) continue;
    buffer = (buffer << 6) | value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      output += String.fromCharCode((buffer >> bits) & 0xff);
    }
  }
  return output;
}

// Retorna o instante de expiração em ms (Date.now()-comparável), ou null se
// o token não puder ser lido / não tiver "exp".
export function obterExpiracaoJwt(token) {
  try {
    const payloadBase64 = token.split('.')[1];
    const payload = JSON.parse(base64UrlDecode(payloadBase64));
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}
