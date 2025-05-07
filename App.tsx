// App.tsx
import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from './src/screens/HomeScreen';
import LocationScreen from './src/screens/LocationScreen';
import DestinationScreen from './src/screens/DestinationScreen';
import ConfirmationScreen from './src/screens/ConfirmationScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';

export type RootStackParamList = {
  Home: undefined;
  Location: undefined;
  Destination: {
    origin: string;
    originLocation: { latitude: number; longitude: number };
  };
  Confirmation: {
    origin: string;
    destination: string;
    originLocation: { latitude: number; longitude: number };
    destLocation: { latitude: number; longitude: number };
  };
  Login: undefined;
  Register: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator();

function AuthStackScreen() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="Login" component={LoginScreen} />
      <AuthStack.Screen name="Register" component={RegisterScreen} />
    </AuthStack.Navigator>
  );
}

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Verifica se o usuário está logado ao iniciar o app
  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const userToken = await AsyncStorage.getItem('userToken');
        setIsLoggedIn(!!userToken);
      } catch (error) {
        console.error('Erro ao verificar login:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkLoginStatus();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#d50000" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {isLoggedIn ? (
          <>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Location" component={LocationScreen} />
            <Stack.Screen name="Destination" component={DestinationScreen} />
            <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
          </>
        ) : (
          <Stack.Screen name="Auth" component={AuthStackScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}