// src/screens/ConfirmationScreen.tsx

import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';

interface Location {
  latitude: number;
  longitude: number;
}

type RootStackParamList = {
  Confirmation: {
    origin: string;
    destination: string;
    originLocation: Location;
    destLocation: Location;
  };
};

type ConfirmationRouteProp = RouteProp<RootStackParamList, 'Confirmation'>;

const ConfirmationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<ConfirmationRouteProp>();
  const { origin, destination, originLocation, destLocation } = route.params;

  const [loadingRoute, setLoadingRoute] = useState<boolean>(true);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);

  const mapHtml = `
<!DOCTYPE html>
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

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{ maxZoom:30 }).addTo(map);
    L.marker(origin).addTo(map).bindPopup('Origem');
    L.marker(dest).addTo(map).bindPopup('Destino');
    map.fitBounds([ origin, dest ], { padding:[50,50], maxZoom:5 });

    const control = L.Routing.control({
      waypoints: [ origin, dest ],
      router: L.Routing.osrmv1({ serviceUrl:'https://router.project-osrm.org/route/v1', requestOptions:{ timeout:1000 } }),
      routeWhileDragging: false,
      showAlternatives: false,
      lineOptions: { styles:[{ color:'#d50000', weight:4 }] },
      createMarker: (i, wp) => L.marker(wp.latLng, {
        icon: L.icon({
          iconUrl:'https://unpkg.com/leaflet@1.9.3/dist/images/marker-icon.png',
          iconSize:[25,41], iconAnchor:[12,41]
        })
      }).bindPopup(i===0?'Origem':'Destino')
    }).addTo(map);

    control.on('routesfound', () => {
      const wps = control.getPlan().getWaypoints().map(wp => wp.latLng);
      map.fitBounds(wps, { padding:[30,30], maxZoom:5 });
      window.ReactNativeWebView.postMessage('ROUTE_OK');
    });
    control.on('routingerror', () => window.ReactNativeWebView.postMessage('ROUTE_ERROR'));
  </script>
</body>
</html>
`;

  const handleMessage = (e: WebViewMessageEvent) => {
    if (e.nativeEvent.data === 'ROUTE_OK' || e.nativeEvent.data === 'ROUTE_ERROR') {
      setLoadingRoute(false);
    }
  };

  // ** Esta função é chamada ao clicar em "Sim" **
  const confirmEmbark = async () => {
    setConfirming(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const resp = await fetch('http://192.168.31.101:5000/api/requests/current', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });
      if (!resp.ok) throw new Error(`Status ${resp.status}`);
      Alert.alert('Sucesso', 'Embarque confirmado!'
          ,
                [
                  {
                    text: 'OK',
                    onPress: () => {
                      setShowConfirmModal(false);
                      navigation.navigate('Home');
                    }
                  }
                ],
                { cancelable: false }
              );

      // se quiser, volta ao início:
      // navigation.popToTop();
    } catch (err: any) {
      console.error('Erro na confirmação:', err);
      Alert.alert('Erro', 'Não foi possível confirmar o embarque.');
    } finally {
      setConfirming(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Mapa */}
      <View style={styles.mapContainer}>
        <WebView
          source={{ html: mapHtml }}
          originWhitelist={['*']}
          mixedContentMode="always"
          allowUniversalAccessFromFileURLs
          allowFileAccess
          onMessage={handleMessage}
          style={styles.webview}
        />
        {loadingRoute && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#d50000" />
          </View>
        )}
      </View>

      {/* Card */}
      <View style={styles.card}>
        <Text style={styles.title}>Apoio ao embarque solicitado</Text>

        <View style={styles.infoRow}>
          <Icon name="location-sharp" size={20} color="#d50000" />
          <View style={styles.infoText}>
            <Text style={styles.label}>Seu endereço atual</Text>
            <Text style={styles.text}>{origin}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Icon name="location-outline" size={20} color="#d50000" />
          <View style={styles.infoText}>
            <Text style={styles.label}>Endereço de destino</Text>
            <Text style={styles.text}>{destination}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, confirming && { opacity: 0.6 }]}
          onPress={() => setShowConfirmModal(true)}
          disabled={confirming}
        >
          <Text style={styles.buttonText}>Confirmar embarque</Text>
        </TouchableOpacity>
      </View>

      {/* Botão redondo de feedback (mantido) */}
      <TouchableOpacity
        style={styles.feedbackButton}
        onPress={() => setShowConfirmModal(true)}
      >
        <Icon name="alert-circle-outline" size={26} color="#fff" />
      </TouchableOpacity>

      {/* Modal de confirmação */}
      <Modal
        transparent
        animationType="fade"
        visible={showConfirmModal}
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalQuestion}>
              Deseja realmente confirmar o embarque?
            </Text>

            {confirming
              ? <ActivityIndicator size="large" color="#d50000" />
              : (
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: '#d50000' }]}
                    onPress={confirmEmbark}  // <-- chama a função certa
                  >
                    <Text style={styles.modalBtnText}>Sim</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modalBtn, { backgroundColor: '#6c757d' }]}
                    onPress={() => setShowConfirmModal(false)}
                  >
                    <Text style={styles.modalBtnText}>Não</Text>
                  </TouchableOpacity>
                </View>
              )
            }
          </View>
        </View>
      </Modal>

      {/* Barra inferior */}
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
  // ... (seus estilos originais, sem alteração)
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  mapContainer: { height: '45%', backgroundColor: '#e9ecef' },
  webview: { flex: 1 },
  loadingOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    marginTop: -24,
    padding: 24,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#000' },
  infoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  infoText: { marginLeft: 12 },
  label: { fontSize: 14, color: '#343a40' },
  text: { fontSize: 16, color: '#000' },
  button: {
    marginTop: 24,
    backgroundColor: '#d50000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  feedbackButton: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#d50000',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    zIndex: 20,
  },
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 60,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
  },
  modalQuestion: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
    color: '#000',
  },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around' },
  modalBtn: {
    flex: 1,
    marginHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  bottomNav: {
    height: 60,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  fabContainer: { width: 60, alignItems: 'center', marginTop: -30 },
  fab: {
    width: 60, height: 60, borderRadius: 30,
    backgroundColor: '#fff', justifyContent: 'center',
    alignItems: 'center', elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 4.65,
  },
  fabText: { fontSize: 32, color: '#000', lineHeight: 36 },
});

export default ConfirmationScreen;
