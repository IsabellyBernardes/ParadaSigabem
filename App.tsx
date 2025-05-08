// App.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { View, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { AuthContext } from './src/contexts/AuthContext';
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

export default function App() {
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Ao montar, lê o token e define login
  useEffect(() => {
    AsyncStorage.getItem('userToken')
      .then(token => setIsLoggedIn(!!token))
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  // funções de signIn / signOut
  const authContext = useMemo(() => ({
    signIn: (token: string) => {
      AsyncStorage.setItem('userToken', token);
      setIsLoggedIn(true);
    },
    signOut: () => {
      AsyncStorage.removeItem('userToken');
      setIsLoggedIn(false);
    },
    isLoggedIn,
  }), [isLoggedIn]);

  if (isLoading) {
    return (
      <View style={{ flex:1,justifyContent:'center',alignItems:'center' }}>
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
