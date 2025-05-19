// src/screens/DestinationScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface Location {
  latitude: number;
  longitude: number;
}

type RootStackParamList = {
  Location: undefined;
  Destination: { origin: string; originLocation: Location };
  Confirmation: {
    origin: string;
    destination: string;
    originLocation: Location;
    destLocation: Location;
  };
};

type DestinationRouteProp = RouteProp<RootStackParamList, 'Destination'>;

/**
 * Faz POST com retry. Retorna:
 *  - true se HTTP 2xx,
 *  - false se 401 ou 403,
 *  - lança em outros erros.
 */
async function sendRequestWithRetry(
  url: string,
  body: any,
  retries = 3,
  delay = 2000
): Promise<boolean> {
  const token = await AsyncStorage.getItem('userToken');
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`[sendRequest] tentativa ${attempt} para ${url}`, body);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      });
      console.log(`[sendRequest] status ${resp.status}`);
      if (resp.status === 401 || resp.status === 403) {
        return false;
      }
      if (!resp.ok) {
        throw new Error(`Status ${resp.status}`);
      }
      return true;
    } catch (err) {
      console.warn(`[sendRequest] erro:`, err);
      if (attempt < retries) {
        await new Promise(res => setTimeout(res, delay * attempt));
        continue;
      }
      throw err;
    }
  }
  return false;
}

const DestinationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<DestinationRouteProp>();
  const { origin, originLocation } = route.params;

  const [destination, setDestination] = useState<string>('');
  const [destLocation, setDestLocation] = useState<Location | null>(null);
  const [loadingRoute, setLoadingRoute] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);

  const handleSearchDestination = async () => {
    if (!destination.trim()) {
      Alert.alert('Erro', 'Digite um destino.');
      return;
    }
    setLoadingRoute(true);
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(destination)}`
      );
      const results = (await resp.json()) as Array<{ lat: string; lon: string }>;
      if (results.length > 0) {
        const { lat, lon } = results[0];
        setDestLocation({ latitude: parseFloat(lat), longitude: parseFloat(lon) });
      } else {
        Alert.alert('Não encontrado', 'Destino não encontrado.');
      }
    } catch (err) {
        console.error('Erro ao buscar destino:', err);
      Alert.alert('Erro', 'Não foi possível buscar o destino.');
    } finally {
      setLoadingRoute(false);
    }
  };

  const mapHtml = originLocation && destLocation
    ? `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.css"/>
  <style>
    html, body, #map { height:100%; margin:0; padding:0; }
    .leaflet-control-attribution { display:none; }
    .leaflet-routing-container,
    .leaflet-routing-container-toggle { display:none; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.js"></script>
  <script>
    const origin = L.latLng(${originLocation.latitude}, ${originLocation.longitude});
    const dest   = L.latLng(${destLocation.latitude},   ${destLocation.longitude});
    const map    = L.map('map', { zoomControl:true, attributionControl:false });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{ maxZoom:20 }).addTo(map);
    const control = L.Routing.control({
      waypoints:[ origin, dest ],
      router:L.Routing.osrmv1({ serviceUrl:'https://router.project-osrm.org/route/v1', requestOptions:{ timeout:1000 } }),
      routeWhileDragging:false,
      showAlternatives:false,
      lineOptions:{ styles:[{ color:'#d50000', weight:4 }] },
      createMarker:(i,wp)=>L.marker(wp.latLng).bindPopup(i===0?'Origem':'Destino')
    }).addTo(map);
    control.on('routesfound', ()=>window.ReactNativeWebView.postMessage('ROUTE_OK'));
    control.on('routingerror', ()=>window.ReactNativeWebView.postMessage('ROUTE_ERROR'));
    map.fitBounds([ origin, dest ], { padding:[50,50] });
  </script>
</body>
</html>`
    : `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css"/>
  <style>html, body, #map { height:100%; margin:0; padding:0; } .leaflet-control-attribution { display:none; }</style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
  <script>
    const map = L.map('map',{ zoomControl:true, attributionControl:false })
      .setView([${originLocation.latitude},${originLocation.longitude}],16);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{ maxZoom:20 }).addTo(map);
    L.marker([${originLocation.latitude},${originLocation.longitude}]).addTo(map).bindPopup('Origem');
  </script>
</body>
</html>`;

  const handleMessage = (event: WebViewMessageEvent) => {
    if (event.nativeEvent.data === 'ROUTE_OK' || event.nativeEvent.data === 'ROUTE_ERROR') {
      setLoadingRoute(false);
    }
  };

  const handleRequest = async () => {
    if (!destLocation) {
      Alert.alert('Erro', 'Busque um destino primeiro.');
      return;
    }
    const payload = { origin, destination, requested: true, timestamp: new Date().toISOString() };
    const url = 'http://192.168.126.112:5000/api/requests';

    setSending(true);
    try {
      const ok = await sendRequestWithRetry(url, payload);
      if (!ok) {
        // se 401/403, desloga e volta ao login
        await AsyncStorage.removeItem('userToken');
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }
      navigation.navigate('Confirmation', { origin, destination, originLocation, destLocation: destLocation! });
    } catch {
      Alert.alert('Erro', 'Não foi possível enviar o pedido.');
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Mapa */}
      <View style={styles.mapContainer}>
        <WebView
          key={mapHtml}
          source={{ html: mapHtml }}
          originWhitelist={['*']}
          mixedContentMode="always"
          allowUniversalAccessFromFileURLs
          allowFileAccess
          onMessage={handleMessage}
          style={styles.webview}
        />
        {(loadingRoute || sending) && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#d50000" />
          </View>
        )}
      </View>

      {/* Card */}
      <View style={styles.card}>
        <View style={styles.headerCard}>
          <TouchableOpacity onPress={() => navigation.goBack()}>
            <Icon name="chevron-back" size={24} color="#000" />
          </TouchableOpacity>
          <Text style={styles.cardTitle}>Informe seu destino</Text>
        </View>

        <Text style={styles.label}>Lugar de origem</Text>
        <View style={styles.originField}>
          <Icon name="location-sharp" size={16} color="#d50000" />
          <Text style={styles.originText}>{origin}</Text>
        </View>

        <Text style={[styles.label, { marginTop: 24 }]}>Lugar de destino</Text>
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Digite o destino"
            placeholderTextColor="#666"
            value={destination}
            onChangeText={setDestination}
            returnKeyType="search"
            onSubmitEditing={handleSearchDestination}
          />
          <TouchableOpacity style={styles.searchButton} onPress={handleSearchDestination}>
            <Icon name="search-outline" size={20} color="#666" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.requestButton, sending && { opacity: 0.6 }]}
          onPress={handleRequest}
          disabled={sending}
        >
          <Text style={styles.requestButtonText}>Solicitar apoio</Text>
        </TouchableOpacity>
      </View>

      {/* Bottom Nav */}
      <View style={styles.bottomNav}>
        <TouchableOpacity onPress={() => navigation.navigate('Home')}>
          <Icon name="home-outline" size={24} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity onPress={() => navigation.navigate('Search')}>
          <Icon name="search-outline" size={24} color="#666" />
        </TouchableOpacity>
        <View style={styles.fabContainer}>
          <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('Location')}>
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
  mapContainer: { height: '45%', backgroundColor: '#e9ecef' },
  webview: { flex: 1 },
  loadingOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  card: {
    flex: 1, backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -24, padding: 24, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1, shadowRadius: 4,
  },
  headerCard: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  cardTitle: { fontSize: 20, fontWeight: 'bold', marginLeft: 12, color: '#000' },
  label: { fontSize: 14, color: '#343a40', marginBottom: 8 },
  originField: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  originText: { marginLeft: 8, fontSize: 16, color: '#000' },
  inputContainer: { flexDirection: 'row', backgroundColor: '#f1f1f1', borderRadius: 8, alignItems: 'center', paddingHorizontal: 8 },
  input: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 14 : 10, color: '#000' },
  searchButton: { padding: 8, marginLeft: 8 },
  requestButton: { marginTop: 24, backgroundColor: '#d50000', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  requestButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  bottomNav: { height: 60, flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0', justifyContent: 'space-around', alignItems: 'center' },
  fabContainer: { width: 60, alignItems: 'center', marginTop: -30 },
  fab: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65 },
  fabText: { fontSize: 32, color: '#000', lineHeight: 36 },
});

export default DestinationScreen;
