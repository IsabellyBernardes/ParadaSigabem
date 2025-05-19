import React, { useContext } from 'react';

import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Image,
  Platform,
} from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { AuthContext } from '../contexts/AuthContext';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
  const navigation = useNavigation<any>();
  const { signOut } = useContext(AuthContext);

  return (
    <View style={styles.container}>
      {/* Conteúdo Principal */}
      <View style={styles.content}>
        <Image source={require('../assets/sigabem.jpg')} style={styles.logo} />
        <TextInput
          style={styles.input}
          placeholder="Procurar"
          placeholderTextColor="#000"
        />

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button}>
            <Icon name="time-outline" size={20} color="red" />
            <Text style={styles.buttonLabel}>Frequentes</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button}>
            <Icon name="star-outline" size={20} color="blue" />
            <Text style={styles.buttonLabel}>Recentes</Text>
          </TouchableOpacity>
        </View>
      </View>

        {/* Botão de logout */}
      <TouchableOpacity onPress={signOut} style={[styles.button, { marginTop: 20 }]}>
        <Icon name="log-out-outline" size={20} color="black" />
        <Text style={styles.buttonLabel}>Sair</Text>
      </TouchableOpacity>


      {/* Barra de Navegação Inferior + FAB */}
      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Icon name="home-outline" size={24} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Search')}>
          <Icon name="search-outline" size={24} color="#666" />
        </TouchableOpacity>

        <View style={styles.fabContainer}>
          <TouchableOpacity
            style={styles.fab}
            onPress={() => navigation.navigate('Location')}
          >
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity onPress={() => navigation.navigate('History')}>
          <Icon name="time-outline" size={24} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Icon name="person-outline" size={24} color="#666" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  content: {
    alignItems: 'center',
    marginTop: 50,
    flex: 1,
  },
  logo: {
    width: 120,
    height: 120,
    resizeMode: 'contain',
    marginBottom: 20,
  },
  input: {
    borderWidth: 1,
    borderRadius: 25,
    paddingHorizontal: 20,
    width: '90%',
    marginBottom: 20,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    backgroundColor: '#fff',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 15,
  },
  button: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  buttonLabel: {
    fontSize: 16,
    color: '#000',
  },
  bottomNav: {
    height: 60,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    elevation: 4,
  },
  fabContainer: {
    width: 60,
    alignItems: 'center',
    marginTop: -30, // sobe o FAB acima da barra
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    // sombra iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    // sombra Android
    elevation: 8,
  },
  fabText: {
    fontSize: 32,
    color: '#000',
    lineHeight: 36,
  },
});
