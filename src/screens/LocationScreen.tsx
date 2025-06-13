// src/screens/LocationScreen.tsx
import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { AuthContext } from '../contexts/AuthContext';

const FIXED_LOCATION = {
  latitude: -8.059715,
  longitude: -34.952233,
};

interface Location {
  latitude: number;
  longitude: number;
}

interface BusFromAPI {
  bus_id: string;
  latitude: number;
  longitude: number;
  velocidade?: number;
  trip_headsign?: string;
  recorded_at: string;
  distance?: number;
}

type RootStackParamList = {
  Home: undefined;
  Location: undefined;
  Confirmation: {
    currentStopLocation: Location;
    tripHeadsign: string;
  };
  Login: undefined;
  Register: undefined;
};

type LocationScreenNavigationProp = StackNavigationProp<
  RootStackParamList,
  'Location'
>;

const LocationScreen: React.FC = () => {
  const navigation = useNavigation<LocationScreenNavigationProp>();
  const { signOut } = useContext(AuthContext);

  const [currentLocation, setCurrentLocation] = useState<Location | null>(null);
  const [currentAddress, setCurrentAddress] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [availableTripHeadsigns, setAvailableTripHeadsigns] = useState<string[]>([]);

  const fetchReverseGeocode = async (loc: Location) => {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.latitude}&lon=${loc.longitude}&accept-language=pt-BR&zoom=18`,
        { headers: { 'User-Agent': 'SigabemApp/1.0' } }
      );
      const data = await resp.json();
      const addr = data.address || {};
      const street = addr.road || addr.pedestrian || addr.residential || '';
      const neighbourhood = addr.suburb || addr.neighbourhood || '';
      setCurrentAddress(`${street}, ${neighbourhood}`.trim().replace(/^,|,$/g, '') || 'Localização Fixa');
    } catch {
      console.warn('Erro no reverse geocoding.');
      setCurrentAddress('Localização Fixa');
    }
  };

  const fetchAvailableLines = useCallback(async (location: Location) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await fetch(
        `${API_URL}/api/buses/nearby?latitude=${location.latitude}&longitude=${location.longitude}&radius=0.5`,
        { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } }
      );
      if (!response.ok) throw new Error('Falha ao buscar linhas.');
      const data = await response.json();
      if (!data.success || !data.buses) throw new Error('Resposta inválida da API.');

      const uniqueHeadsigns = Array.from(
        new Set(
          data.buses
            .map((bus: BusFromAPI) => bus.trip_headsign)
            .filter((h): h is string => !!h && h.trim() !== '')
        )
      ).sort();
      setAvailableTripHeadsigns(uniqueHeadsigns);
    } catch (error) {
      setAvailableTripHeadsigns([]);
      console.error(error);
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setCurrentLocation(FIXED_LOCATION);
    await fetchReverseGeocode(FIXED_LOCATION);
    await fetchAvailableLines(FIXED_LOCATION);
    setLoading(false);
  }, [fetchAvailableLines]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });
    return unsubscribe;
  }, [navigation, loadData]);

  const handleSelectLine = (tripHeadsign: string) => {
    if (!currentLocation) return;
    navigation.navigate('Confirmation', {
      currentStopLocation: currentLocation,
      tripHeadsign: tripHeadsign,
    });
  };

  const mapHtmlForStop = currentLocation
    ? `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="file:///android_asset/leaflet.css" />
      <script src="file:///android_asset/leaflet.js"></script>
      <style> html, body, #map { height: 100%; margin: 0; padding: 0; } </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
          var map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${currentLocation.latitude}, ${currentLocation.longitude}], 17);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
          }).addTo(map);
          L.marker([${currentLocation.latitude}, ${currentLocation.longitude}]).addTo(map);
      </script>
    </body>
  </html>`
    : null;

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {mapHtmlForStop ? (
          <WebView
            source={{ html: mapHtmlForStop }}
            style={styles.webview}
            allowFileAccess={true} // Permite acesso aos arquivos locais
          />
        ) : (
          <View style={styles.mapPlaceholder}>
             <ActivityIndicator size="large" color="#d50000" />
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.headerContainer}>
          <Text style={styles.title}>Parada Atual</Text>
          <TouchableOpacity onPress={loadData} style={styles.refreshButton}>
            <Icon name="refresh-outline" size={26} color="#d50000" />
          </TouchableOpacity>
        </View>
        <Text style={styles.addressText} numberOfLines={2}>
          {loading ? 'Carregando...' : currentAddress}
        </Text>

        {loading ? (
            <ActivityIndicator color="#d50000" style={{flex: 1, marginTop: 20}}/>
        ) : (
          <FlatList
            data={availableTripHeadsigns}
            ListHeaderComponent={() => <Text style={styles.subtitle}>Selecione uma linha para embarcar:</Text>}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.lineButton} onPress={() => handleSelectLine(item)}>
                <Icon name="bus-outline" size={20} color="#d50000" style={styles.lineIcon} />
                <Text style={styles.lineButtonText}>{item}</Text>
              </TouchableOpacity>
            )}
            keyExtractor={(item) => item}
            ListEmptyComponent={() => <Text style={styles.noLinesText}>Nenhuma linha de ônibus encontrada nas proximidades.</Text>}
          />
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f0f0f0' },
    mapContainer: { height: '35%', backgroundColor: '#e9ecef' },
    webview: { flex: 1 },
    mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    card: {
      flex: 1,
      backgroundColor: '#fff',
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 20,
      marginTop: -24,
      elevation: 5,
    },
    headerContainer: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    title: { fontSize: 20, fontWeight: 'bold', color: '#222' },
    refreshButton: { padding: 5 },
    addressText: { fontSize: 14, color: '#555', marginBottom: 16, minHeight: 20 },
    subtitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 12 },
    noLinesText: { textAlign: 'center', color: '#666', marginTop: 20, fontStyle: 'italic' },
    lineButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: '#f9f9f9',
      padding: 16,
      borderRadius: 10,
      marginBottom: 10,
    },
    lineIcon: { marginRight: 12 },
    lineButtonText: { fontSize: 16, color: '#333', fontWeight: '500' },
});

export default LocationScreen;