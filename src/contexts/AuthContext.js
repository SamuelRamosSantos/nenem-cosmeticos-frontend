import React, { createContext, useContext, useState, useEffect } from 'react';
import { Q } from '@nozbe/watermelondb';
import * as SecureStore from 'expo-secure-store';
import database from '../database';

const AuthContext = createContext({
  isLoggedIn: null,
  login:  async () => {},
  logout: async () => {},
});

// Garante que exista ao menos um usuário ativo; se a tabela estiver vazia,
// injeta o usuário padrão admin/1234 para o primeiro acesso.
async function garantirUsuarioPadrao() {
  const count = await database
    .get('usuarios')
    .query(Q.where('ativo', true))
    .fetchCount();
  if (count === 0) {
    await database.write(async () => {
      await database.get('usuarios').create(u => {
        u.nome  = 'admin';
        u.senha = '1234';
        u.ativo = true;
      });
    });
  }
}

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(null); // null = carregando

  useEffect(() => {
    SecureStore.getItemAsync('session')
      .then(val => setIsLoggedIn(val === 'authenticated'))
      .catch(() => setIsLoggedIn(false));
  }, []);

  const login = async (usuario, senha) => {
    await garantirUsuarioPadrao();

    const ativos = await database
      .get('usuarios')
      .query(Q.where('ativo', true))
      .fetch();

    const match = ativos.find(
      u => u.nome.toLowerCase() === usuario.trim().toLowerCase() && u.senha === senha
    );

    if (!match) throw new Error('Usuário ou senha incorretos.');

    await SecureStore.setItemAsync('session', 'authenticated');
    setIsLoggedIn(true);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('session');
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
