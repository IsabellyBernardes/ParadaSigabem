// App.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import HomeScreen from './src/screens/HomeScreen';
import LocationScreen from './src/screens/LocationScreen';
import DestinationScreen from './src/screens/DestinationScreen';

// 1) Defina todos os parâmetros do seu stack aqui:
export type RootStackParamList = {
  Home: undefined;
  Location: undefined;
  Destination: {
    origin: string;
    originLocation: { latitude: number; longitude: number };
  };
};

// 2) Passe esse tipo ao criar o stack:
const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="Home"
        screenOptions={{ headerShown: false }}
      >
        <Stack.Screen name="Home" component={HomeScreen} />
        <Stack.Screen name="Location" component={LocationScreen} />
        <Stack.Screen name="Destination" component={DestinationScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
