// src/screens/ConfirmationScreen.tsx

import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  Vibration,
  AccessibilityInfo,
  Platform,
} from 'react-native';
import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { AuthContext } from '../contexts/AuthContext';

interface Location {
  latitude: number;
  longitude: number;
}

interface Bus {
  bus_id: string;
  latitude: number;
  longitude: number;
  recorded_at: string;
  distance?: number;
  velocidade?: number;
  trip_headsign?: string;
}

// Ajuste este RootStackParamList de acordo com seu App.tsx
type RootStackParamList = {
  Home: undefined;
  Location: undefined;
  Profile: undefined;
  Confirmation: {
    currentStopLocation: Location;
    tripHeadsign: string;
    origin?: string;
    destination?: string;
    originLocation?: Location;
    destLocation?: Location;
  };
  Login: undefined;
  Register: undefined;
};

type ConfirmationRouteProp = RouteProp<RootStackParamList, 'Confirmation'>;

const ConfirmationScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const route = useRoute<ConfirmationRouteProp>();
  const { signOut } = useContext(AuthContext);

  // Estados de parâmetros e UI
  const [stopLocation, setStopLocation] = useState<Location | null>(null);
  const [selectedTripHeadsign, setSelectedTripHeadsign] = useState<string | null>(null);
  const [displayOriginText, setDisplayOriginText] = useState<string>('');
  const [displayLineText, setDisplayLineText] = useState<string>('');

  // Estados de polling e ônibus
  const [loadingRoute, setLoadingRoute] = useState<boolean>(true);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [nearbyBuses, setNearbyBuses] = useState<Bus[]>([]);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [nearestBusInfo, setNearestBusInfo] = useState<{
    bus: Bus | null;
    timeEstimate: string;
  }>({ bus: null, timeEstimate: 'Calculando...' });

  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const webviewRef = useRef<WebView>(null);
  const hasVibratedNear = useRef(false);

  // Extrair parâmetros de navegação (tanto fluxo novo quanto antigo)
  useEffect(() => {
    const params = route.params;
    let activeStopLocation: Location | undefined;
    let activeTripHeadsign: string | undefined;

    if (params.currentStopLocation && params.tripHeadsign) {
      // Novo fluxo vindo da LocationScreen
      activeStopLocation = params.currentStopLocation;
      activeTripHeadsign = params.tripHeadsign;
      AsyncStorage.getItem('pendingStopAddress').then((addr) => {
        setDisplayOriginText(
          addr ||
            `Lat: ${activeStopLocation!.latitude.toFixed(
              4
            )}, Lon: ${activeStopLocation!.longitude.toFixed(4)}`
        );
      });
      setDisplayLineText(`${activeTripHeadsign}`);
    } else if (params.originLocation && params.destination) {
      // Fluxo antigo/alternativo (FAB da HomeScreen ou similar)
      activeStopLocation = params.originLocation;
      activeTripHeadsign = params.destination;
      setDisplayOriginText(
        params.origin ||
          `Lat: ${activeStopLocation!.latitude.toFixed(
            4
          )}, Lon: ${activeStopLocation!.longitude.toFixed(4)}`
      );
      setDisplayLineText(params.destination || 'Linha não definida');
    }

    if (activeStopLocation && activeTripHeadsign) {
      setStopLocation(activeStopLocation);
      setSelectedTripHeadsign(activeTripHeadsign);
    } else {
      Alert.alert(
        'Erro de Navegação',
        'Informações necessárias para esta tela não foram fornecidas. Retornando...',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    }
  }, [route.params, navigation]);

  // Formatar estimativa de tempo
  function formatTimeEstimate(
    distanceMetros: number | null | undefined,
    speedMetrosPorSegundo: number | null | undefined
  ): string {
    if (
      distanceMetros == null ||
      speedMetrosPorSegundo == null ||
      speedMetrosPorSegundo <= 0.5
    ) {
      return 'Calculando...';
    }
    const seconds = distanceMetros / speedMetrosPorSegundo;
    if (seconds < 0) return 'Calculando...';
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  }

  // Função de fetch & polling
  const fetchNearbyBuses = useCallback(async () => {
    if (!stopLocation || !selectedTripHeadsign) {
      console.log(
        'fetchNearbyBuses: stopLocation ou selectedTripHeadsign ainda não definidos.'
      );
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Autenticação', 'Sessão expirada.');
        signOut();
        navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
        return;
      }

      const url = `${API_URL}/api/buses/nearby?latitude=${stopLocation.latitude}&longitude=${stopLocation.longitude}&radius=2`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          Alert.alert('Autenticação', 'Sessão inválida.');
          await AsyncStorage.removeItem('userToken');
          signOut();
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          return;
        }
        const errorText = await response.text();
        console.error(
          'Erro HTTP ao buscar ônibus:',
          response.status,
          errorText
        );
        throw new Error(`Erro HTTP: ${response.status}`);
      }

      const contentType = response.headers.get('content-type');
      if (!contentType?.includes('application/json')) {
        const text = await response.text();
        console.error('Resposta não-JSON:', text.substring(0, 200));
        throw new Error('Resposta não está no formato JSON');
      }
      const data = await response.json();

      if (!data.buses) {
        throw new Error('Estrutura de dados de ônibus inválida');
      }
      
      // ##########################################################################
      // ## MODIFICAÇÃO AQUI: Filtro flexível para o nome da linha ##
      // ##########################################################################
      const busesOfSelectedLine: Bus[] = data.buses.filter(
        (bus: Bus) =>
          bus.trip_headsign?.trim().toLowerCase() ===
            selectedTripHeadsign?.trim().toLowerCase() &&
          typeof bus.distance === 'number'
      );

      setNearbyBuses(busesOfSelectedLine);

      if (webviewRef.current) {
        webviewRef.current.postMessage(
          JSON.stringify({
            type: 'UPDATE_BUSES',
            buses: busesOfSelectedLine,
            stopLocation: stopLocation,
          })
        );
      }
      setLastUpdate(new Date().toISOString());

      if (busesOfSelectedLine.length > 0) {
        busesOfSelectedLine.sort((a, b) => a.distance! - b.distance!);
        const nearestBus = busesOfSelectedLine[0];
        const timeEstimate = formatTimeEstimate(
          nearestBus.distance,
          nearestBus.velocidade
        );
        setNearestBusInfo({ bus: nearestBus, timeEstimate });

        const arrivalSeconds =
          nearestBus.distance! /
          (nearestBus.velocidade! > 0 ? nearestBus.velocidade! : 1);

        if (arrivalSeconds < 20 && !hasVibratedNear.current) {
          const pattern =
            Platform.OS === 'android'
              ? [0, 300, 300, 300, 300, 300, 300, 300]
              : [0, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3];
          Vibration.vibrate(pattern);
          hasVibratedNear.current = true;
        } else if (arrivalSeconds >= 20) {
          hasVibratedNear.current = false;
        }
      } else {
        setNearestBusInfo({
          bus: null,
          timeEstimate: 'Nenhum ônibus da linha se aproximando',
        });
        hasVibratedNear.current = false;
      }
    } catch (error) {
      console.error('Erro completo em fetchNearbyBuses:', error);
      setNearestBusInfo({ bus: null, timeEstimate: 'Erro ao buscar' });
    }
  }, [stopLocation, selectedTripHeadsign, navigation, signOut]);

  // useEffect para polling periódico
  useEffect(() => {
    let isMounted = true;

    const startPolling = async () => {
      if (!stopLocation || !selectedTripHeadsign) {
        if (isMounted) {
          setTimeout(() => {
            if (isMounted) startPolling();
          }, 7000);
        }
        return;
      }

      const pending = await AsyncStorage.getItem('pendingRequest');
      if (pending !== 'true') {
        console.log(
          'ConfirmationScreen: Não há solicitação pendente. Polling parado.'
        );
        if (pollingIntervalRef.current)
          clearInterval(pollingIntervalRef.current);
        if (fallbackTimeoutRef.current)
          clearTimeout(fallbackTimeoutRef.current);
        return;
      }

      console.log(
        'ConfirmationScreen: Iniciando polling dos ônibus para a linha',
        selectedTripHeadsign
      );
      fetchNearbyBuses();

      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = setInterval(() => {
        if (isMounted) fetchNearbyBuses();
      }, 10000);

      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = setTimeout(() => {
        if (isMounted) setLoadingRoute(false);
      }, 15000);
    };

    startPolling();

    return () => {
      isMounted = false;
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
      console.log('ConfirmationScreen: Polling parado e timeouts limpos.');
    };
  }, [stopLocation, selectedTripHeadsign, fetchNearbyBuses]);

  // Sempre que nearestBusInfo mudar, anuncie para o leitor de tela
  useEffect(() => {
    if (nearestBusInfo && nearestBusInfo.timeEstimate) {
      let announcement = '';
      if (nearestBusInfo.bus) {
        announcement = `Ônibus ${nearestBusInfo.bus.bus_id} chega em ${nearestBusInfo.timeEstimate}`;
      } else {
        announcement = nearestBusInfo.timeEstimate;
      }
      AccessibilityInfo.announceForAccessibility(announcement);
    }
  }, [nearestBusInfo]);

  // Função de confirmação de embarque
  const confirmEmbark = async () => {
    if (!selectedTripHeadsign) {
      Alert.alert(
        'Erro',
        'A linha de ônibus não foi definida para confirmação.'
      );
      return;
    }

    setConfirming(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        throw new Error('Token não encontrado');
      }

      const payload = { trip_headsign: selectedTripHeadsign };
      console.log('Confirmando embarque para:', payload);

      const response = await fetch(`${API_URL}/api/requests/current`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('Status da resposta de confirmação:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({
          error: `Erro HTTP: ${response.status}`,
        }));
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }

      // Limpa chaves relacionadas à solicitação pendente
      await AsyncStorage.multiRemove([
        'pendingRequest',
        'pendingTripHeadsign',
        'pendingStopAddress',
        'pendingStopLat',
        'pendingStopLng',
      ]);
      await AsyncStorage.removeItem('pendingRequest');

      Alert.alert('Sucesso', 'Embarque confirmado!', [
        {
          text: 'OK',
          onPress: () => {
            setShowConfirmModal(false);
            if (pollingIntervalRef.current)
              clearInterval(pollingIntervalRef.current);
            navigation.navigate('Location');
          },
        },
      ]);
    } catch (error: any) {
      console.error('Erro completo na confirmação:', error);
      Alert.alert(
        'Erro',
        error.message || 'Não foi possível confirmar o embarque'
      );
    } finally {
      setConfirming(false);
    }
  };

  // HTML do mapa (Leaflet + WebView)
  const mapHtml = stopLocation
    ? `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css"/>
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; overflow: hidden; }
    .leaflet-control-attribution, .leaflet-routing-container, .leaflet-routing-container-toggle { display: none; }
    .leaflet-control-zoom { border: none !important; background: transparent !important; }
    .leaflet-control-zoom a { background: white !important; border-radius: 4px !important; margin-bottom: 5px !important; box-shadow: 0 1px 5px rgba(0,0,0,0.1) !important; }
    .user-stop-icon { background-color: #d50000; border-radius: 50%; width: 16px !important; height: 16px !important; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5); }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
  <script>
    const stopLat = ${stopLocation.latitude};
    const stopLng = ${stopLocation.longitude};
    const map = L.map('map', { zoomControl: true, attributionControl: false }).setView([stopLat, stopLng], 16);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', { maxZoom: 20 }).addTo(map);

    const stopIcon = L.divIcon({ className: 'user-stop-icon', iconSize: [16, 16], iconAnchor: [8, 8] });
    L.marker([stopLat, stopLng], { icon: stopIcon }).addTo(map).bindPopup('Sua Parada');

    const busIcon = L.icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448315.png',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });

    let busMarkers = [];

    function updateBusMarkers(buses) {
      busMarkers.forEach((marker) => map.removeLayer(marker));
      busMarkers = [];
      if (buses && buses.length > 0) {
        buses.forEach((bus) => {
          const marker = L.marker([bus.latitude, bus.longitude], { icon: busIcon })
            .addTo(map)
            .bindPopup(\`Ônibus \${bus.bus_id || 'Desconhecido'}<br>Linha: \${bus.trip_headsign || 'N/A'}\`);
          busMarkers.push(marker);
        });
      }
    }

    map.whenReady(() => window.ReactNativeWebView.postMessage('MAP_LOADED'));

    window.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'UPDATE_BUSES') {
          updateBusMarkers(message.buses);
        }
      } catch (e) {
        console.error('Erro ao processar mensagem do RN:', e);
      }
    });
  </script>
</body>
</html>`
    : null;

  const handleMessageFromWebview = (event: WebViewMessageEvent) => {
    const data = event.nativeEvent.data;
    if (data === 'MAP_LOADED' || data === 'ROUTE_OK') {
      setLoadingRoute(false);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
    }
  };

  // Se parâmetros não carregaram ainda, exibir loading
  if (!stopLocation || !selectedTripHeadsign) {
    return (
      <View style={styles.containerLoadingParams}>
        <ActivityIndicator size="large" color="#d50000" />
        <Text>Carregando informações da solicitação...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mapa */}
      <View style={styles.mapContainer}>
        {mapHtml && (
          <WebView
            ref={webviewRef}
            key={`${stopLocation.latitude}-${stopLocation.longitude}`}
            source={{ html: mapHtml }}
            originWhitelist={['*']}
            mixedContentMode="always"
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={handleMessageFromWebview}
            onLoadEnd={() => {
              if (loadingRoute) setTimeout(() => setLoadingRoute(false), 3000);
            }}
            renderLoading={() => (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#d50000" />
              </View>
            )}
            scrollEnabled={false}
            nestedScrollEnabled={false}
          />
        )}
        {loadingRoute && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#d50000" />
          </View>
        )}
      </View>

      {/* Card de informações */}
      <View style={styles.card}>
        <Text
          style={styles.title}
          accessible={true}
          accessibilityRole="header"
          accessibilityLabel="Acompanhando Embarque"
        >
          Acompanhando Embarque
        </Text>

        {/* BLOCO “Sua Parada” */}
        <View
          style={styles.infoRow}
          accessible={true}
          accessibilityLabel={`Sua Parada: ${displayOriginText}`}
        >
          <Icon name="location-sharp" size={20} color="#d50000" />
          <View style={styles.infoText}>
            <Text style={styles.label} accessible={false}>
              Sua Parada
            </Text>
            <Text
              style={styles.textValue}
              numberOfLines={1}
              ellipsizeMode="tail"
              accessible={false}
            >
              {displayOriginText}
            </Text>
          </View>
        </View>

        {/* BLOCO “Linha Selecionada” */}
        <View
          style={styles.infoRow}
          accessible={true}
          accessibilityLabel={`Linha selecionada: ${selectedTripHeadsign}`}
        >
          <Icon name="bus-outline" size={20} color="#333" />
          <View style={styles.infoText}>
            <Text style={styles.label} accessible={false}>
              Linha Selecionada
            </Text>
            <Text style={styles.textValue} accessible={false}>
              {selectedTripHeadsign}
            </Text>
          </View>
        </View>

        {/* BLOCO “Próximo ônibus” */}
        <View
          style={[styles.infoRow, styles.etaContainer]}
          accessible={true}
          accessibilityLabel={
            nearestBusInfo.bus
              ? `Próximo ônibus chega em ${nearestBusInfo.timeEstimate}. Veículo ${nearestBusInfo.bus.bus_id}`
              : `Nenhum ônibus da linha se aproximando`
          }
        >
          <Icon
            name="time-outline"
            size={24}
            color={nearestBusInfo.bus ? '#007bff' : '#888'}
          />
          <View style={styles.infoText}>
            <Text style={styles.label} accessible={false}>
              Próximo ônibus da linha chega em:
            </Text>
            <Text
              style={[
                styles.textValue,
                styles.etaText,
                !nearestBusInfo.bus && styles.etaTextError,
              ]}
              accessible={false}
            >
              {nearestBusInfo.timeEstimate}
            </Text>
            {nearestBusInfo.bus && (
              <Text style={styles.busDetailText} accessible={false}>
                Veículo: {nearestBusInfo.bus.bus_id}
              </Text>
            )}
          </View>
        </View>

        {/* BOTÃO “Confirmar Embarque” */}
        <TouchableOpacity
          style={[
            styles.button,
            (confirming || !nearestBusInfo.bus) && styles.buttonDisabled,
          ]}
          onPress={() => setShowConfirmModal(true)}
          disabled={confirming || !nearestBusInfo.bus}
          accessible={true}
          accessibilityRole="button"
          accessibilityLabel={
            nearestBusInfo.bus
              ? `Confirmar embarque no ônibus ${nearestBusInfo.bus.bus_id}`
              : `Botão de confirmação desabilitado: nenhum ônibus próximo`
          }
          accessibilityState={{ disabled: confirming || !nearestBusInfo.bus }}
        >
          <Text style={styles.buttonText}>
            Confirmar Embarque no Ônibus Acima
          </Text>
        </TouchableOpacity>
      </View>

      {/* Modal de confirmação de embarque */}
      <Modal
        transparent
        animationType="fade"
        visible={showConfirmModal}
        onRequestClose={() => {
          if (!confirming) setShowConfirmModal(false);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalQuestion}>
              Deseja confirmar o embarque na linha {selectedTripHeadsign}?
              {nearestBusInfo.bus &&
                `\n(Veículo: ${nearestBusInfo.bus.bus_id})`}
            </Text>
            {confirming ? (
              <ActivityIndicator
                size="large"
                color="#d50000"
                style={{ marginVertical: 20 }}
              />
            ) : (
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#d50000' }]}
                  onPress={confirmEmbark}
                >
                  <Text style={styles.modalBtnText}>Sim, embarquei</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalBtn, { backgroundColor: '#6c757d' }]}
                  onPress={() => setShowConfirmModal(false)}
                >
                  <Text style={styles.modalBtnText}>Não</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  containerLoadingParams: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  mapContainer: {
    height: '40%',
    backgroundColor: '#e9ecef',
  },
  webview: {
    flex: 1,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
    padding: 20,
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
    color: '#000',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  infoText: {
    marginLeft: 12,
    flex: 1,
  },
  label: {
    fontSize: 13,
    color: '#555',
    marginBottom: 2,
  },
  textValue: {
    fontSize: 16,
    color: '#000',
    fontWeight: '500',
  },
  etaContainer: {
    backgroundColor: '#f8f9fa',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderRadius: 8,
    borderBottomWidth: 0,
    alignItems: 'center',
  },
  etaText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#007bff',
  },
  etaTextError: {
    color: '#888',
    fontStyle: 'italic',
  },
  busDetailText: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  button: {
    marginTop: 24,
    backgroundColor: '#d50000',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20,
    zIndex: 50,
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
  },
  modalQuestion: {
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 24,
    textAlign: 'center',
    color: '#333',
    lineHeight: 24,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
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
    fontWeight: 'bold',
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

export default ConfirmationScreen;