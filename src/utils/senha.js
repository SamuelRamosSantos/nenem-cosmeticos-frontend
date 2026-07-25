// Regra de senha forte: mínimo 8 caracteres, com maiúscula, minúscula,
// número e caractere especial. Mesma regra é aplicada no backend
// (usuarios.controller.js) — nunca confie só na validação do app.
const REGEX_SENHA_FORTE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const MENSAGEM_REGRA_SENHA =
  'A senha deve ter no mínimo 8 caracteres, com letra maiúscula, minúscula, número e caractere especial.';

export function senhaEhForte(senha) {
  return REGEX_SENHA_FORTE.test(senha);
}
