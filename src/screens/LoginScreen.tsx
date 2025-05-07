// src/screens/LoginScreen.tsx
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';


const LoginScreen: React.FC = () => {
  const navigation = useNavigation();

  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const formatCpf = (input: string) => {
    const numericValue = input.replace(/\D/g, '');

    if (numericValue.length <= 3) {
      return numericValue;
    } else if (numericValue.length <= 6) {
      return `${numericValue.slice(0, 3)}.${numericValue.slice(3)}`;
    } else if (numericValue.length <= 9) {
      return `${numericValue.slice(0, 3)}.${numericValue.slice(3, 6)}.${numericValue.slice(6)}`;
    } else {
      return `${numericValue.slice(0, 3)}.${numericValue.slice(3, 6)}.${numericValue.slice(6, 9)}-${numericValue.slice(9, 11)}`;
    }
  };

  const handleCpfChange = (text: string) => {
    const formattedCpf = formatCpf(text);
    setCpf(formattedCpf);
  };

  const handleLogin = async () => {
    if (!cpf || !password) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    try {
      const response = await fetch('http://seu-endereco-api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ cpf, password }),
      });

      const data = await response.json();

      if (response.ok) {
        await AsyncStorage.setItem('userToken', 'dummy-token');
        await AsyncStorage.setItem('userId', data.userId);
        navigation.navigate('Home');
      } else {
        Alert.alert('Erro', data.message || 'Falha no login');
      }
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível conectar ao servidor');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Acesse sua conta</Text>

        <Text style={styles.label}>CPF</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Digite seu CPF"
            placeholderTextColor="#666"
            value={cpf}
            onChangeText={handleCpfChange}
            keyboardType="numeric"
            maxLength={14}
          />
          <Icon name="person-outline" size={20} color="#666" style={styles.icon} />
        </View>

        <Text style={styles.label}>Senha</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Digite sua senha"
            placeholderTextColor="#666"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
          <Icon name="lock-closed-outline" size={20} color="#666" style={styles.icon} />
        </View>

        <TouchableOpacity
          style={[styles.button, isLoading && styles.buttonDisabled]}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Entrar</Text>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.link}
          onPress={() => navigation.navigate('Register')}
          disabled={isLoading}
        >
          <Text style={styles.linkText}>Não tem uma conta? Cadastre-se</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.forgotPasswordLink}
          onPress={() => navigation.navigate('ForgotPassword')}
          disabled={isLoading}
        >
          <Text style={styles.linkText}>Esqueceu sua senha?</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 24,
    color: '#000',
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    color: '#343a40',
    marginBottom: 8,
    marginTop: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    paddingVertical: 14,
    color: '#000',
    fontSize: 16,
  },
  icon: {
    marginLeft: 8,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#d50000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    opacity: 1,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  link: {
    marginTop: 16,
    alignItems: 'center',
  },
  forgotPasswordLink: {
    marginTop: 8,
    alignItems: 'center',
  },
  linkText: {
    color: '#d50000',
    fontSize: 14,
  },
});

export default LoginScreen;