import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Image } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

export default function HomeScreen() {
  const navigation = useNavigation();

  return (
    <View style={styles.container}>
      <Image source={require('../assets/ifpe-logo.png')} style={styles.logo} />
      <TextInput style={styles.input} placeholder="Procurar" />

      <View style={styles.buttonRow}>
        <TouchableOpacity style={styles.button}>
          <Icon name="time-outline" size={20} color="red" />
          <Text>Frequentes</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.button}>
          <Icon name="star-outline" size={20} color="blue" />
          <Text>Recentes</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.fab}
        onPress={() => navigation.navigate('Location')}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', marginTop: 50 },
  logo: { width: 120, height: 120, resizeMode: 'contain' },
  input: {
    borderWidth: 1,
    borderRadius: 25,
    paddingHorizontal: 20,
    width: '90%',
    marginVertical: 20,
  },
  buttonRow: { flexDirection: 'row', gap: 15 },
  button: {
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    elevation: 3,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  fab: {
    position: 'absolute',
    bottom: 40,
    alignSelf: 'center',
    backgroundColor: 'white',
    borderRadius: 30,
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
  },
  fabText: {
    fontSize: 30,
    color: '#000',
  },
});
