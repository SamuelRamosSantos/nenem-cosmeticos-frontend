// Máscara de moeda brasileira "R$ 0,00" — trata o texto digitado como
// centavos (padrão caixa eletrônico): cada dígito novo empurra os
// anteriores, sem depender de vírgula/ponto digitados pelo usuário.

// Texto digitado (dígitos brutos, ex: onChangeText) → "12,50"
export function mascaraPreco(text) {
  const nums = String(text).replace(/\D/g, '');
  if (!nums) return '0,00';
  const val = parseInt(nums, 10);
  return (val / 100).toFixed(2).replace('.', ',');
}

// number (ex: vindo do WatermelonDB) → "12,50"
export function floatParaMascara(value) {
  const cents = Math.round(Number(value || 0) * 100);
  return (cents / 100).toFixed(2).replace('.', ',');
}

// "12,50" → 12.5 (number puro, pronto para gravar no banco)
export function mascaraParaFloat(masked) {
  return parseFloat(String(masked).replace(',', '.')) || 0;
}
