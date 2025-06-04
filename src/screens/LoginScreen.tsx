// src/screens/LoginScreen.tsx
import React, { useState, useContext } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { API_URL } from '../config';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';

const LoginScreen: React.FC = () => {
  const { signIn } = useContext(AuthContext);
  const navigation = useNavigation<any>();
  const [cpf, setCpf] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const formatCpf = (input: string) => {
    const numeric = input.replace(/\D/g, '');
    if (numeric.length <= 3) return numeric;
    if (numeric.length <= 6)
      return `${numeric.slice(0, 3)}.${numeric.slice(3)}`;
    if (numeric.length <= 9)
      return `${numeric.slice(0, 3)}.${numeric.slice(3, 6)}.${numeric.slice(6)}`;
    return `${numeric.slice(0, 3)}.${numeric.slice(3, 6)}.${numeric.slice(6, 9)}-${numeric.slice(9, 11)}`;
  };

  const handleCpfChange = (text: string) => {
    setCpf(formatCpf(text));
  };

  const handleLogin = async () => {
    if (!cpf || !password) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }
    setIsLoading(true);

    try {
      console.log('🚀 Tentando logar com CPF:', cpf.replace(/\D/g, ''));
      const resp = await fetch(`${API_URL}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cpf: cpf.replace(/\D/g, ''), // CPF sem pontuação
          password,
        }),
      });

      console.log('📶 Status da resposta:', resp.status);
      const data = await resp.json();
      console.log('📋 Corpo da resposta:', data);

      if (!resp.ok) {
        throw new Error(data.error || 'Falha no login');
      }

      console.log('🔐 Login bem-sucedido! Token:', data.token);
      await AsyncStorage.setItem('userToken', data.token);
      signIn(data.token);
      // ❌ Remova este replace:
      // navigation.replace('Home');

      // Depois de signIn, isLoggedIn mudará para true no App.tsx,
      // e o Navigator exibirá a HomeScreen por padrão.
    } catch (err: any) {
      console.error('❌ Erro no login:', err);
      Alert.alert('Erro', err.message || 'Não foi possível conectar ao servidor');
    } finally {
      setIsLoading(false);
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
                  onPress={() => navigation.navigate('Register')} // ✅ corrigido
                  disabled={isLoading}
                >
                  <Text style={styles.linkText}>Não tem uma conta? Cadastre-se</Text>
                </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex:1, backgroundColor:'#f8f9fa', justifyContent:'center', padding:20 },
  card: { backgroundColor:'#fff', borderRadius:24, padding:24,
    elevation:5, shadowColor:'#000', shadowOffset:{width:0,height:2},
    shadowOpacity:0.1, shadowRadius:4 },
  title: { fontSize:24, fontWeight:'bold', marginBottom:24, color:'#000', textAlign:'center' },
  label: { fontSize:14, color:'#343a40', marginBottom:8, marginTop:16 },
  inputContainer: { flexDirection:'row', backgroundColor:'#f1f1f1',
    borderRadius:8, alignItems:'center', paddingHorizontal:12 },
  input: { flex:1, paddingVertical:14, color:'#000', fontSize:16 },
  icon: { marginLeft:8 },
  button: { marginTop:24, backgroundColor:'#d50000', borderRadius:12,
    paddingVertical:16, alignItems:'center' },
  buttonDisabled: { opacity:0.6 },
  buttonText: { color:'#fff', fontSize:16, fontWeight:'bold' },
  link: { marginTop:16, alignItems:'center' },
  linkText: { color:'#d50000', fontSize:14 },
});

export default LoginScreen;
