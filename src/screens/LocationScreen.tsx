// src/screens/LocationScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  TextInput,
  Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import Geolocation, {
  GeolocationResponse,
  GeolocationError,
} from 'react-native-geolocation-service';
import {
  requestMultiple,
  PERMISSIONS,
  RESULTS,
} from 'react-native-permissions';

interface Location {
  latitude: number;
  longitude: number;
}

const LocationScreen: React.FC = () => {
  const [location, setLocation] = useState<Location | null>(null);
  const [address, setAddress] = useState<string>('');
  const navigation = useNavigation<any>();

  // Solicita permissões de localização e retorna se a precisa (fine) foi concedida
  const requestLocationPermissions = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const statuses = await requestMultiple([
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
        ]);
        const fine =
          statuses[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] ===
          RESULTS.GRANTED;
        const coarse =
          statuses[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION] ===
          RESULTS.GRANTED;

        if (!fine && !coarse) {
          Alert.alert(
            'Permissão negada',
            'Conceda permissão de localização ao app para prosseguir.'
          );
          return false;
        }
        return fine;
      } else {
        // iOS: já cai no diálogo do sistema
        const status = await requestMultiple([
          PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
        ]);
        return (
          status[PERMISSIONS.IOS.LOCATION_WHEN_IN_USE] === RESULTS.GRANTED
        );
      }
    } catch (err) {
      Alert.alert('Erro', 'Não foi possível solicitar permissão.');
      return false;
    }
  };

  // ao clicar em "usar localização atual"
  const handleUseCurrentLocation = async () => {
    const hasFine = await requestLocationPermissions();
    if (!hasFine) {
      // usuário não concedeu permissão de localização precisa
      return;
    }

    Geolocation.getCurrentPosition(
      (pos: GeolocationResponse) => {
        setLocation({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
        });
      },
      (err: GeolocationError) => {
        // exibe código e mensagem de erro
        Alert.alert(
          'Erro ao obter localização',
          `Código ${err.code}: ${err.message}`
        );
      },
      {
        enableHighAccuracy: true, // já garantimos permissão fina
        timeout: 15000,
        maximumAge: 10000,
        distanceFilter: 0,
      }
    );
  };

  // busca manual por endereço
  const handleSearch = async () => {
    if (!address.trim()) {
      Alert.alert('Erro', 'Digite um endereço.');
      return;
    }
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          address
        )}`
      );
      const results = (await resp.json()) as Array<{
        lat: string;
        lon: string;
      }>;
      if (results.length > 0) {
        const { lat, lon } = results[0];
        setLocation({
          latitude: parseFloat(lat),
          longitude: parseFloat(lon),
        });
      } else {
        Alert.alert('Não encontrado', 'Endereço não encontrado.');
      }
    } catch {
      Alert.alert('Erro', 'Não foi possível buscar o endereço.');
    }
  };

  // HTML do Leaflet
  const mapHtml = location
    ? `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css"/>
    <style>
      html, body, #map { height:100%; margin:0; padding:0; }
      .leaflet-control-attribution { display:none; }
      .leaflet-bar a { background:#fff; border-radius:4px; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
    <script>
      const map = L.map('map', {
        zoomControl: true,
        attributionControl: false
      }).setView([${location.latitude}, ${location.longitude}], 16);

      L.tileLayer(
        'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        { maxZoom: 20 }
      ).addTo(map);

      L.marker([${location.latitude}, ${location.longitude}]).addTo(map);
    </script>
  </body>
</html>
`
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {mapHtml ? (
          <WebView
            source={{ html: mapHtml }}
            originWhitelist={['*']}
            mixedContentMode="always"
            allowUniversalAccessFromFileURLs
            allowFileAccess
            style={styles.webview}
          />
        ) : (
          <View style={styles.mapPlaceholder}>
            <Text style={styles.mapPlaceholderText}>
              Mapa aguardando busca...
            </Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Informe a sua localização</Text>

        <View style={styles.rowHeader}>
          <Text style={styles.label}>Sua localização</Text>
          <TouchableOpacity onPress={handleUseCurrentLocation}>
            <Text style={styles.currentLocationLink}>
              Deseja utilizar a localização atual?
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Digite o endereço"
            placeholderTextColor="#000"
            value={address}
            onChangeText={setAddress}
            returnKeyType="search"
            onSubmitEditing={handleSearch}
          />
          <TouchableOpacity onPress={handleSearch} style={styles.iconButton}>
            <Icon name="search-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.buttonSmall}
            onPress={() => navigation.navigate('Home')}
          >
            <Text style={styles.buttonText}>🏠 Casa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.buttonSmall}>
            <Text style={styles.buttonText}>🏢 Trabalho</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity style={styles.buttonFull}>
          <Text style={styles.buttonText}>📍 Outros</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveButton}>
          <Text style={styles.saveText}>Salvar endereço</Text>
        </TouchableOpacity>
      </View>

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
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  mapContainer: { height: '50%', backgroundColor: '#e9ecef' },
  webview: { flex: 1 },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  mapPlaceholderText: { color: '#6c757d', fontSize: 16 },

  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: -24,
    flex: 1,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: {
      fontSize: 20,
      fontWeight: 'bold',
      color: '#000',
      },

  rowHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  label: { fontSize: 16, color: '#343a40' },
  currentLocationLink: { fontSize: 14, color: 'red' },

  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  input: {
    flex: 1,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    color: '#000',
  },
  iconButton: {
    padding: 8,
  },

  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  buttonSmall: {
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    width: '48%',
    paddingVertical: 12,
    alignItems: 'center',
  },
  buttonFull: {
    backgroundColor: '#f1f1f1',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  buttonText: { fontSize: 16, color: '#000', },

  saveButton: {
    backgroundColor: '#d50000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },

  bottomNav: {
    height: 60,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    justifyContent: 'space-around',
    alignItems: 'center',
    elevation: 4,
    paddingHorizontal: 20,
  },
  fabContainer: {
    width: 60,
    alignItems: 'center',
    marginTop: -30,
  },
  fab: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  fabText: {
    fontSize: 32,
    color: '#000',
    lineHeight: 36,
  },
});

export default LocationScreen;
