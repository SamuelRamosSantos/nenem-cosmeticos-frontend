import React, { createContext, useContext, useState, useEffect } from 'react';
import * as SecureStore from 'expo-secure-store';
import database from '../database';
import { sincronizar, API_URL } from '../services/syncService';
import { registrarLogoutHandler } from '../services/authEvents';
import { obterExpiracaoJwt } from '../utils/jwt';

const AuthContext = createContext({
  isLoggedIn: null,
  usuarioLogado: null,
  login:  async () => {},
  logout: async () => {},
});

export function AuthProvider({ children }) {
  const [isLoggedIn, setIsLoggedIn] = useState(null); // null = carregando
  const [usuarioLogado, setUsuarioLogado] = useState(null); // nome do usuário autenticado (NC-85)

  // Toda entrada no app checa se a sessão (JWT) ainda é válida — se expirou,
  // força novo login (ele já é sempre em nuvem, ver login() abaixo).
  useEffect(() => {
    (async () => {
      const [session, token, nomeUsuario] = await Promise.all([
        SecureStore.getItemAsync('session'),
        SecureStore.getItemAsync('jwt'),
        SecureStore.getItemAsync('usuarioNome'),
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
        await SecureStore.deleteItemAsync('usuarioNome');
        setIsLoggedIn(false);
        return;
      }

      setUsuarioLogado(nomeUsuario ?? null);
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
    await SecureStore.setItemAsync('usuarioNome', data.usuario.nome);
    setUsuarioLogado(data.usuario.nome);
    setIsLoggedIn(true);
  };

  const logout = async () => {
    await SecureStore.deleteItemAsync('session');
    await SecureStore.deleteItemAsync('jwt');
    await SecureStore.deleteItemAsync('usuarioNome');
    setUsuarioLogado(null);
    setIsLoggedIn(false);
  };

  // Registra esse mesmo logout() como o handler global de sessão expirada
  // (NC-86) — assim qualquer chamada de API 401, mesmo fora de um
  // componente React (syncService, apiClient), força a volta ao Login sem
  // duplicar a lógica de limpeza de SecureStore/estado.
  useEffect(() => {
    registrarLogoutHandler(logout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- logout não depende de estado que mude entre renders

  return (
    <AuthContext.Provider value={{ isLoggedIn, usuarioLogado, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
