// App.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthContext } from './src/contexts/AuthContext'; // <–– importe o contexto
import HomeScreen from './src/screens/HomeScreen';
import LocationScreen from './src/screens/LocationScreen';
import DestinationScreen from './src/screens/DestinationScreen';
import ConfirmationScreen from './src/screens/ConfirmationScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

import { API_URL } from './src/config'; // sua URL de API

const Stack = createNativeStackNavigator();

export default function App() {
  const [isLoading, setIsLoading]   = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Montamos o contexto apenas uma vez, e toda vez que isLoggedIn mudar ele atualiza
  const authContext = useMemo(
    () => ({
      signIn: (token: string) => {
        AsyncStorage.setItem('userToken', token);
        setIsLoggedIn(true);
      },
      signOut: async () => {
        await AsyncStorage.removeItem('userToken');
        setIsLoggedIn(false);
      },
      isLoggedIn,
    }),
    [isLoggedIn]
  );

  useEffect(() => {
    if (__DEV__) {
      // → AUTO‐LOGIN EM DEV (opcional)
      (async () => {
        try {
          const resp = await fetch(`${API_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              cpf: '11111111111',        // CPF dev
              password: 'senha123', // senha dev cadastrada no backend
            }),
          });
          if (!resp.ok) {
            console.warn('Auto-login DEV falhou:', resp.status);
            await AsyncStorage.removeItem('userToken');
            setIsLoggedIn(false);
            setIsLoading(false);
            return;
          }
          const data = await resp.json();
          console.log('🤖 Auto-login DEV pegou token:', data.token);
          await AsyncStorage.setItem('userToken', data.token);
          setIsLoggedIn(true);
        } catch (err) {
          console.warn('Erro no auto-login DEV:', err);
          await AsyncStorage.removeItem('userToken');
          setIsLoggedIn(false);
        } finally {
          setIsLoading(false);
        }
      })();
      return;
    }

    // → MODO PRODUÇÃO / TESTE REAL: verifica se já existe token salvo
    AsyncStorage.getItem('userToken')
      .then(token => setIsLoggedIn(!!token))
      .catch(() => setIsLoggedIn(false))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex:1, justifyContent:'center', alignItems:'center' }}>
        <ActivityIndicator size="large" color="#d50000" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={authContext}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {isLoggedIn ? (
            <>
              <Stack.Screen name="Home" component={HomeScreen} />
              <Stack.Screen name="Profile" component={ProfileScreen} />
              <Stack.Screen name="Location" component={LocationScreen} />
              <Stack.Screen name="Destination" component={DestinationScreen} />
              <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
            </>
          ) : (
            <>
              <Stack.Screen name="Login" component={LoginScreen} />
              <Stack.Screen name="Register" component={RegisterScreen} />
            </>
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </AuthContext.Provider>
  );
}
