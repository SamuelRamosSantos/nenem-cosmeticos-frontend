import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import database from '../database';
import { sincronizar, API_URL } from '../services/syncService';
import { obterExpiracaoJwt } from '../utils/jwt';

const AuthContext = createContext({
  isLoggedIn: null,
  login:  async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(null); // null = carregando

  // Toda entrada no app checa se a sessão (JWT) ainda é válida — se expirou,
  // força novo login (ele já é sempre em nuvem, ver login() abaixo).
  useEffect(() => {
    (async () => {
      const [session, token] = await Promise.all([
        SecureStore.getItemAsync('session'),
        SecureStore.getItemAsync('jwt'),
      ]);

      if (session !== 'authenticated' || !token) {
        setIsLoggedIn(false);
        return;
      }

      const expiraEm = obterExpiracaoJwt(token);
      const expirado = expiraEm !== null && Date.now() >= expiraEm;
      if (expirado) {
        await SecureStore.deleteItemAsync('session');
        await SecureStore.deleteItemAsync('jwt');
        setIsLoggedIn(false);
        return;
      }

      setIsLoggedIn(true);
    })().catch(() => setIsLoggedIn(false));
  }, []);

  // Login — sempre em nuvem. Não existe mais fallback local nem cópia de
  // senha no aparelho (ver NC-68). Cada login também garante a sincronização
  // em dia: só libera a Home depois do pull completo terminar (NC-69) — a
  // tela de Login mostra "Baixando dados da loja..." bloqueando a UI
  // enquanto essa função está em andamento.
  const login = async (usuario, senha) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: usuario, senha }),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Não foi possível validar as credenciais na nuvem.');
    }

    await SecureStore.setItemAsync('jwt', data.token);
    await sincronizar(database);

    await SecureStore.setItemAsync('session', 'authenticated');
    setIsLoggedIn(true);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('session');
    await SecureStore.deleteItemAsync('jwt');
    setIsLoggedIn(false);
  };

  return (
    <AuthContext.Provider value={{ isLoggedIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
