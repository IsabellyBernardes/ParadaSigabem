// src/screens/ConfirmationScreen.tsx
import React, { useState, useEffect, useRef } from 'react';
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

interface Bus {
  bus_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  distance?: number; // Adicionando campo distance
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
  const [nearbyBuses, setNearbyBuses] = useState<Bus[]>([]);
  const [selectedBus, setSelectedBus] = useState<string | null>(null);
  const [busHistory, setBusHistory] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [nearestBusDistance, setNearestBusDistance] = useState<number | null>(null);
  const pollingInterval = useRef<NodeJS.Timeout | null>(null);
  const fallbackTimeout = useRef<NodeJS.Timeout | null>(null);

  // Função para formatar a distância
  const formatDistance = (meters: number | null) => {
    if (meters === null) return 'Calculando...';
    if (meters < 1000) return `${Math.round(meters)} metros`;
    return `${(meters / 1000).toFixed(1)} km`;
  };

  // Modifique a função fetchNearbyBuses para lidar melhor com erros:
  const fetchNearbyBuses = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        throw new Error('Usuário não autenticado');
      }

      const url = `http://192.168.126.112:5000/api/buses/nearby?latitude=${originLocation.latitude}&longitude=${originLocation.longitude}&radius=2`;
      console.log('URL da API:', url);
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Resposta do servidor:', errorText);
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await response.text();
        console.error('Resposta não-JSON:', text.substring(0, 100));
        throw new Error('Resposta não está no formato JSON');
      }

      const data = await response.json();
      console.log('Dados recebidos:', data);

      if (!data.buses) {
        throw new Error('Estrutura de dados inválida');
      }

      // Atualização do estado
      setNearbyBuses(data.buses);
      setLastUpdate(new Date().toISOString());

      // Calcula e armazena a distância do ônibus mais próximo
      if (data.buses && data.buses.length > 0) {
        const nearest = data.buses[0].distance; // Já vem ordenado por distância
        setNearestBusDistance(nearest);
      } else {
        setNearestBusDistance(null);
      }

    } catch (error) {
      console.error('Erro completo:', error);
      Alert.alert(
        'Erro de Conexão',
        'Não foi possível obter dados dos ônibus. Verifique sua conexão ou tente novamente mais tarde.'
      );
    }
  };

  // Inicia polling quando a tela é montada
  useEffect(() => {
    fetchNearbyBuses();
    pollingInterval.current = setInterval(fetchNearbyBuses, 5000);

    // Timeout de fallback para o spinner
    fallbackTimeout.current = setTimeout(() => {
      setLoadingRoute(false);
    }, 15000);

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current);
      }
      if (fallbackTimeout.current) {
        clearTimeout(fallbackTimeout.current);
      }
    };
  }, [originLocation]);

  // Busca histórico quando um ônibus é selecionado
  useEffect(() => {
    if (!selectedBus) return;

    const fetchBusHistory = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        const resp = await fetch(
          `http://192.168.126.112:5000/api/buses/${selectedBus}/history`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        const data = await resp.json();
        setBusHistory(data);
      } catch (err) {
        console.error('Erro ao buscar histórico:', err);
      }
    };

    fetchBusHistory();
  }, [selectedBus]);

  const mapHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.css"/>
  <style>
    html, body, #map {
      height: 100%;
      margin: 0;
      padding: 0;
    }
    .leaflet-control-attribution {
      display: none;
    }
    .leaflet-routing-container,
    .leaflet-routing-container-toggle {
      display: none;
    }
    .leaflet-control-zoom {
      border: none !important;
      background: transparent !important;
    }
    .leaflet-control-zoom a {
      background: white !important;
      border-radius: 4px !important;
      margin-bottom: 5px !important;
      box-shadow: 0 1px 5px rgba(0,0,0,0.1) !important;
    }
  </style>
</head>
<body>
  <div id="map"></div>

  <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
  <script src="https://unpkg.com/leaflet-routing-machine@latest/dist/leaflet-routing-machine.js"></script>

  <script>
    const origin = L.latLng(${originLocation.latitude}, ${originLocation.longitude});
    const dest = L.latLng(${destLocation.latitude}, ${destLocation.longitude});

    const map = L.map('map', {
      zoomControl: true,
      attributionControl: false
    });

    // Tile layer minimalista
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      detectRetina: true
    }).addTo(map);

    const control = L.Routing.control({
      waypoints: [origin, dest],
      router: L.Routing.osrmv1({
        serviceUrl: 'https://router.project-osrm.org/route/v1',
        requestOptions: { timeout: 10000 }
      }),
      routeWhileDragging: false,
      showAlternatives: false,
      lineOptions: {
        styles: [{ color: '#d50000', weight: 4, opacity: 0.8 }]
      },
      createMarker: (i, wp) => L.marker(wp.latLng).bindPopup(i === 0 ? 'Origem' : 'Destino')
    }).addTo(map);

    control.on('routesfound', () => window.ReactNativeWebView.postMessage('ROUTE_OK'));
    control.on('routingerror', () => window.ReactNativeWebView.postMessage('ROUTE_ERROR'));

    map.fitBounds([origin, dest], { padding: [50, 50] });

    const busIcon = L.icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448315.png',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });

    const buses = ${JSON.stringify(nearbyBuses)};
    buses.forEach(bus => {
      L.marker([bus.latitude, bus.longitude], { icon: busIcon })
        .addTo(map)
        .bindPopup("Ônibus " + bus.bus_id);
    });

    // Evento de carregamento
    map.whenReady(() => {
      window.ReactNativeWebView.postMessage('MAP_LOADED');
    });
  </script>
</body>
</html>
`;

  const confirmEmbark = async () => {
    setConfirming(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      const resp = await fetch('http://192.168.126.112:5000/api/requests/current', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      });

      if (!resp.ok) throw new Error(`Status ${resp.status}`);

      Alert.alert(
        'Sucesso',
        'Embarque confirmado!',
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

    } catch (err: any) {
      console.error('Erro na confirmação:', err);
      Alert.alert('Erro', 'Não foi possível confirmar o embarque.');
    } finally {
      setConfirming(false);
    }
  };

  const handleMessage = (e: WebViewMessageEvent) => {
    const data = e.nativeEvent.data;
    console.log('Mensagem do WebView:', data);

    if (data === 'MAP_LOADED' || data === 'ROUTE_OK') {
      setLoadingRoute(false);
      if (fallbackTimeout.current) {
        clearTimeout(fallbackTimeout.current);
      }
    }

    if (data === 'ROUTE_ERROR') {
      Alert.alert('Erro', 'Não foi possível calcular a rota');
      setLoadingRoute(false);
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
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={true}
          onMessage={handleMessage}
          style={styles.webview}
          onLoadEnd={() => {
            setTimeout(() => setLoadingRoute(false), 5000);
          }}
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator size="large" color="#d50000" />
            </View>
          )}
        />
        {loadingRoute && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#d50000" />
          </View>
        )}
      </View>

      {/* Card de informações */}
      <View style={styles.card}>
        <Text style={styles.title}>Apoio ao embarque solicitado</Text>

        {/* Adicionando a distância do ônibus mais próximo */}
        <View style={styles.distanceContainer}>
          <Icon name="bus" size={20} color="#d50000" />
          <Text style={styles.distanceText}>
            Ônibus mais próximo: {formatDistance(nearestBusDistance)}
          </Text>
        </View>

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

      {/* Card de informações do ônibus (aparece quando selecionado) */}
      {selectedBus && (
        <View style={styles.busInfoContainer}>
          <Text style={styles.busInfoTitle}>Ônibus {selectedBus}</Text>
          <Text style={styles.busInfoText}>
            Última atualização: {new Date(nearbyBuses.find(b => b.bus_id === selectedBus)?.recorded_at || '').toLocaleTimeString()}
          </Text>
          <Text style={styles.busInfoText}>
            Posição: {nearbyBuses.find(b => b.bus_id === selectedBus)?.latitude.toFixed(6)}, {nearbyBuses.find(b => b.bus_id === selectedBus)?.longitude.toFixed(6)}
          </Text>
          <Text style={styles.busInfoText}>
            Distância: {formatDistance(nearbyBuses.find(b => b.bus_id === selectedBus)?.distance || null)}
          </Text>
        </View>
      )}

      {/* Botão de feedback */}
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
                    onPress={confirmEmbark}
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

      {/* Barra de navegação inferior */}
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
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#000'
  },
  distanceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    backgroundColor: '#f8f9fa',
    padding: 12,
    borderRadius: 8,
  },
  distanceText: {
    marginLeft: 8,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  infoText: {
    marginLeft: 12
  },
  label: {
    fontSize: 14,
    color: '#343a40'
  },
  text: {
    fontSize: 16,
    color: '#000'
  },
  button: {
    marginTop: 24,
    backgroundColor: '#d50000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
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
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  modalBtn: {
    flex: 1,
    marginHorizontal: 8,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  modalBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold'
  },
  bottomNav: {
    height: 60,
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  fabContainer: {
    width: 60,
    alignItems: 'center',
    marginTop: -30
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
    lineHeight: 36
  },
  busInfoContainer: {
    position: 'absolute',
    bottom: 150,
    left: 20,
    right: 20,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 16,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  busInfoTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#000',
  },
  busInfoText: {
    fontSize: 14,
    color: '#333',
  },
});

export default ConfirmationScreen;