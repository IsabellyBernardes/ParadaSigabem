import React, { useContext, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  Switch,
  Modal,
} from 'react-native';
import { API_URL } from '../config'
import { AuthContext } from '../contexts/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Icon from 'react-native-vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';

type UserData = {
  id: number;
  cpf: string;
  created_at: string;
};

const ProfileScreen: React.FC = () => {
  const { signOut } = useContext(AuthContext);
  const navigation = useNavigation<any>();
  const [userData, setUserData] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState<boolean>(true);
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);

  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          signOut();
          return;
        }

        const response = await fetch(`${API_URL}/api/user`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (!response.ok) throw new Error('Falha ao carregar dados');

        const data = await response.json();
        setUserData(data);
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível carregar os dados do usuário');
      } finally {
        setLoading(false);
      }
    };

    const loadVibrationSetting = async () => {
      const setting = await AsyncStorage.getItem('vibrationEnabled');
      if (setting !== null) setVibrationEnabled(setting === 'true');
    };

    fetchUserData();
    loadVibrationSetting();
  }, []);

  const handleLogout = () => {
    Alert.alert('Sair', 'Tem certeza que deseja sair?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sair',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#d50000" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Perfil</Text>

        {userData && (
          <View style={styles.infoBox}>
            <Text style={styles.infoLabel}>CPF:</Text>
            <Text style={styles.infoValue}>
              {userData.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')}
            </Text>
            <Text style={[styles.infoLabel, { marginTop: 10 }]}>Cadastrado em:</Text>
            <Text style={styles.infoValue}>
              {new Date(userData.created_at).toLocaleDateString('pt-BR')}
            </Text>
          </View>
        )}

        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={() => setSettingsModalVisible(true)}>
            <Icon name="settings-outline" size={20} color="#666" />
            <Text style={styles.buttonLabel}>Configurações</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.button}>
            <Icon name="help-circle-outline" size={20} color="#666" />
            <Text style={styles.buttonLabel}>Ajuda</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={[styles.button, styles.logoutButton]} onPress={handleLogout}>
          <Icon name="log-out-outline" size={20} color="#fff" />
          <Text style={[styles.buttonLabel, { color: '#fff' }]}>Sair</Text>
        </TouchableOpacity>
      </View>

      <Modal
        animationType="slide"
        transparent={true}
        visible={settingsModalVisible}
        onRequestClose={() => setSettingsModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Configurações</Text>
            <View style={styles.settingRow}>
              <Text style={styles.settingLabel}>Vibração ao chegar perto</Text>
              <Switch
                value={vibrationEnabled}
                onValueChange={async (value) => {
                  setVibrationEnabled(value);
                  await AsyncStorage.setItem('vibrationEnabled', value.toString());
                }}
              />
            </View>
            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSettingsModalVisible(false)}>
              <Text style={styles.modalCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
            onPress={async () => {
              const pending = await AsyncStorage.getItem('pendingRequest');
              if (pending === 'true') {
                const origin = await AsyncStorage.getItem('origin');
                const destination = await AsyncStorage.getItem('destination');
                const originLat = await AsyncStorage.getItem('originLat');
                const originLng = await AsyncStorage.getItem('originLng');
                const destLat = await AsyncStorage.getItem('destLat');
                const destLng = await AsyncStorage.getItem('destLng');

                if (origin && destination && originLat && originLng && destLat && destLng) {
                  navigation.navigate('Confirmation', {
                    origin,
                    destination,
                    originLocation: { latitude: Number(originLat), longitude: Number(originLng) },
                    destLocation: { latitude: Number(destLat), longitude: Number(destLng) }
                  });
                } else {
                  Alert.alert('Erro', 'Informações da solicitação pendente estão incompletas.');
                }
                return;
              }
              navigation.navigate('Location');
            }}
          >
            <Text style={styles.fabText}>+</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => navigation.navigate('History')}>
          <Icon name="time-outline" size={24} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Profile')}>
          <Icon name="person-outline" size={24} color="#d50000" />
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8f9fa' },
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  content: { alignItems: 'center', marginTop: 50, flex: 1 },
  title: { fontSize: 22, fontWeight: 'bold', color: '#000', marginBottom: 30 },
  infoBox: { backgroundColor: '#fff', padding: 20, borderRadius: 15, width: '90%', marginBottom: 30, elevation: 3 },
  infoLabel: { fontSize: 16, color: '#666' },
  infoValue: { fontSize: 16, fontWeight: '500', color: '#000' },
  buttonRow: { flexDirection: 'row', gap: 15, marginBottom: 20 },
  button: { backgroundColor: '#fff', padding: 10, borderRadius: 10, elevation: 3, flexDirection: 'row', alignItems: 'center', gap: 5 },
  buttonLabel: { fontSize: 16, color: '#000' },
  logoutButton: { marginTop: 10, backgroundColor: '#d50000' },
  bottomNav: { height: 60, flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 20, elevation: 4 },
  fabContainer: { width: 60, alignItems: 'center', marginTop: -30 },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65, elevation: 8 },
  fabText: { fontSize: 32, color: '#000', lineHeight: 36 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%', backgroundColor: '#fff', padding: 12, borderRadius: 10, elevation: 3, marginTop: 10 },
  settingLabel: { fontSize: 16, color: '#000' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '85%', backgroundColor: '#fff', borderRadius: 12, padding: 20, alignItems: 'center' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 20 },
  modalCloseBtn: { marginTop: 20, paddingVertical: 10, paddingHorizontal: 20, backgroundColor: '#d50000', borderRadius: 8 },
  modalCloseText: { color: '#fff', fontSize: 16 },
});

export default ProfileScreen;
