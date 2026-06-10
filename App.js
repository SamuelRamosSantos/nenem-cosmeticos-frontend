import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DatabaseProvider } from '@nozbe/watermelondb/DatabaseProvider';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import database                from './src/database';
import { AuthProvider, useAuth } from './src/contexts/AuthContext';

import LoginScreen             from './src/screens/LoginScreen';
import HomeScreen              from './src/screens/HomeScreen';
import PDVScreen               from './src/screens/PDVScreen';
import DashboardScreen         from './src/screens/DashboardScreen';
import ProdutosScreen          from './src/screens/ProdutosScreen';
import ClientesScreen          from './src/screens/ClientesScreen';
import ConfiguracoesScreen     from './src/screens/ConfiguracoesScreen';
import CadastrarProdutoScreen  from './src/screens/CadastrarProdutoScreen';
import CadastrarMarcaScreen    from './src/screens/CadastrarMarcaScreen';
import CadastrarPessoaScreen   from './src/screens/CadastrarPessoaScreen';
import GerenciarMarcasScreen   from './src/screens/GerenciarMarcasScreen';
import FormasPagamentoScreen   from './src/screens/FormasPagamentoScreen';
import GerenciarUsuariosScreen from './src/screens/GerenciarUsuariosScreen';
import BalancoEstoqueScreen    from './src/screens/BalancoEstoqueScreen';

import { COLORS, FONT, SPACING } from './src/theme';

const Tab       = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

const HEADER_OPTS = {
  headerStyle:      { backgroundColor: COLORS.primary },
  headerTintColor:  '#FFFFFF',
  headerTitleStyle: { fontWeight: '700', fontSize: FONT.lg },
};

const TABS = [
  { name: 'Home',      label: 'Início',   component: HomeScreen,      iconA: 'home',       iconI: 'home-outline'      },
  { name: 'PDV',       label: 'PDV',      component: PDVScreen,       iconA: 'cart',        iconI: 'cart-outline'      },
  { name: 'Dashboard', label: 'Análise',  component: DashboardScreen, iconA: 'bar-chart',   iconI: 'bar-chart-outline' },
  { name: 'Produtos',  label: 'Produtos', component: ProdutosScreen,  iconA: 'cube',        iconI: 'cube-outline'      },
  { name: 'Clientes',  label: 'Clientes', component: ClientesScreen,  iconA: 'people',      iconI: 'people-outline'    },
];

function GearButton({ onPress }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={s.gearBtn}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Ionicons name="settings-outline" size={22} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

// =============================================================================
// TabsNavigator — usa useSafeAreaInsets para compensar os botões virtuais
// do Android (Voltar / Home / Recentes) sem sobrepor a tab bar do app.
// =============================================================================
function TabsNavigator() {
  const insets = useSafeAreaInsets();

  // Altura base + espaço necessário para a barra de sistema do Android
  const TAB_HEIGHT     = 62 + insets.bottom;
  const TAB_PAD_BOTTOM = 6  + insets.bottom;

  return (
    <Tab.Navigator
      screenOptions={({ route, navigation }) => {
        const tab = TABS.find(t => t.name === route.name);
        return {
          // Header
          headerStyle:      { backgroundColor: COLORS.primary },
          headerTintColor:  '#FFFFFF',
          headerTitleStyle: { fontWeight: '700', fontSize: FONT.lg },

          // Tab bar — altura dinâmica para respeitar safe area
          tabBarActiveTintColor:   COLORS.accent,
          tabBarInactiveTintColor: 'rgba(255,255,255,0.45)',
          tabBarStyle: {
            backgroundColor: COLORS.primary,
            borderTopWidth:  0,
            paddingTop:      6,
            paddingBottom:   TAB_PAD_BOTTOM,
            height:          TAB_HEIGHT,
          },
          tabBarLabelStyle: { fontSize: FONT.xs, fontWeight: '600', marginTop: 2 },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? tab?.iconA : tab?.iconI} size={24} color={color} />
          ),
          tabBarLabel: tab?.label,

          // Engrenagem no header
          headerLeft: () => (
            <GearButton onPress={() => navigation.navigate('Configuracoes')} />
          ),
        };
      }}
    >
      {TABS.map(tab => (
        <Tab.Screen
          key={tab.name}
          name={tab.name}
          component={tab.component}
          options={{
            title: tab.label,
            ...(tab.name === 'PDV' && {
              headerRight: () => (
                <View style={s.pdvBadge}>
                  <Text style={s.pdvBadgeText}>OFFLINE-FIRST</Text>
                </View>
              ),
            }),
          }}
        />
      ))}
    </Tab.Navigator>
  );
}

// =============================================================================
// AppNavigator
// =============================================================================
function AppNavigator() {
  const { isLoggedIn } = useAuth();

  if (isLoggedIn === null) {
    return (
      <View style={s.splash}>
        <Ionicons name="leaf" size={64} color={COLORS.accent} />
        <Text style={s.splashText}>Neném Cosméticos</Text>
        <ActivityIndicator color={COLORS.accent} style={{ marginTop: SPACING.md }} />
      </View>
    );
  }

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {isLoggedIn ? (
        <>
          <RootStack.Screen name="Tabs" component={TabsNavigator} />

          {/* Cadastros */}
          <RootStack.Screen name="CadastrarProduto" component={CadastrarProdutoScreen}
            options={({ route }) => ({
              ...HEADER_OPTS, headerShown: true,
              title: route.params?.produto ? 'Editar Produto' : 'Cadastrar Produto',
            })}
          />
          <RootStack.Screen name="CadastrarMarca" component={CadastrarMarcaScreen}
            options={({ route }) => ({
              ...HEADER_OPTS, headerShown: true,
              title: route.params?.marca ? 'Editar Marca' : 'Cadastrar Marca',
            })}
          />
          <RootStack.Screen name="CadastrarPessoa" component={CadastrarPessoaScreen}
            options={({ route }) => ({
              ...HEADER_OPTS, headerShown: true,
              title: route.params?.pessoa ? 'Editar Cadastro' : 'Novo Cadastro',
            })}
          />

          {/* Configurações */}
          <RootStack.Screen name="Configuracoes" component={ConfiguracoesScreen}
            options={{ ...HEADER_OPTS, headerShown: true, title: 'Configurações' }}
          />
          <RootStack.Screen name="GerenciarMarcas" component={GerenciarMarcasScreen}
            options={{ ...HEADER_OPTS, headerShown: true, title: 'Gerenciar Marcas' }}
          />
          <RootStack.Screen name="FormasPagamento" component={FormasPagamentoScreen}
            options={{ ...HEADER_OPTS, headerShown: true, title: 'Formas de Pagamento' }}
          />
          <RootStack.Screen name="GerenciarUsuarios" component={GerenciarUsuariosScreen}
            options={{ ...HEADER_OPTS, headerShown: true, title: 'Gestão de Usuários' }}
          />
          <RootStack.Screen name="BalancoEstoque" component={BalancoEstoqueScreen}
            options={{ ...HEADER_OPTS, headerShown: true, title: 'Balanço de Estoque' }}
          />
        </>
      ) : (
        <RootStack.Screen name="Login" component={LoginScreen} />
      )}
    </RootStack.Navigator>
  );
}

// =============================================================================
// App — SafeAreaProvider é obrigatório para useSafeAreaInsets funcionar em
// toda a árvore de componentes (Tab bar, FABs, modais).
// =============================================================================
export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <DatabaseProvider database={database}>
          <StatusBar style="light" backgroundColor={COLORS.primary} />
          <NavigationContainer>
            <AppNavigator />
          </NavigationContainer>
        </DatabaseProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  splash: {
    flex: 1, backgroundColor: COLORS.primary,
    alignItems: 'center', justifyContent: 'center', gap: SPACING.sm,
  },
  splashText: {
    color: '#fff', fontSize: FONT.xl, fontWeight: '700', marginTop: SPACING.sm,
  },
  gearBtn: { marginLeft: SPACING.sm, padding: 4 },
  pdvBadge: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 999, marginRight: 12,
  },
  pdvBadgeText: {
    color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: 0.5,
  },
});
