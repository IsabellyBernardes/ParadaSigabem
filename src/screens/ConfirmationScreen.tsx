// src/screens/ConfirmationScreen.tsx

import React, { useState, useEffect, useRef, useContext, useCallback } from 'react'; // Adicionado useContext
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Alert,
  Vibration,
} from 'react-native';
import { API_URL } from '../config';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WebView, WebViewMessageEvent } from 'react-native-webview';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { AuthContext } from '../contexts/AuthContext'; // Para signOut em caso de erro

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

// Ajuste este RootStackParamList para corresponder ao de App.tsx e LocationScreen.tsx
type RootStackParamList = {
  Home: undefined;
  Location: undefined;
  Profile: undefined;
  Confirmation: {
    // Parâmetros da LocationScreen (novo fluxo)
    currentStopLocation: Location;
    tripHeadsign: string;

    // Parâmetros antigos (se ainda usados por algum fluxo, ex: FAB da HomeScreen)
    origin?: string;
    destination?: string; // No novo fluxo, tripHeadsign é o "destino" conceitual
    originLocation?: Location; // Pode ser o mesmo que currentStopLocation em alguns casos
    destLocation?: Location; // Provavelmente obsoleto no novo fluxo
  };
  Login: undefined;
  Register: undefined;
};

type ConfirmationRouteProp = RouteProp<RootStackParamList, 'Confirmation'>;

const ConfirmationScreen: React.FC = () => {
  const navigation = useNavigation<any>(); // Use StackNavigationProp se preferir tipagem mais forte
  const route = useRoute<ConfirmationRouteProp>();
  const { signOut } = useContext(AuthContext);


  // --- INÍCIO DA LÓGICA DE PARÂMETROS ATUALIZADA ---
  const [stopLocation, setStopLocation] = useState<Location | null>(null);
  const [selectedTripHeadsign, setSelectedTripHeadsign] = useState<string | null>(null);
  const [displayOriginText, setDisplayOriginText] = useState<string>(''); // Para UI
  const [displayLineText, setDisplayLineText] = useState<string>(''); // Para UI

  useEffect(() => {
    const params = route.params;
    let activeStopLocation: Location | undefined;
    let activeTripHeadsign: string | undefined;
    let originTextForDisplay: string = "Parada não definida";
    let lineTextForDisplay: string = "Linha não definida";

    if (params.currentStopLocation && params.tripHeadsign) {
      // Novo fluxo vindo da LocationScreen
      activeStopLocation = params.currentStopLocation;
      activeTripHeadsign = params.tripHeadsign;
      // Para exibição, podemos tentar pegar o endereço salvo pela LocationScreen
      AsyncStorage.getItem('pendingStopAddress').then(addr => {
        setDisplayOriginText(addr || `Lat: ${activeStopLocation?.latitude.toFixed(4)}, Lon: ${activeStopLocation?.longitude.toFixed(4)}`);
      });
      setDisplayLineText(`Linha: ${activeTripHeadsign}`);

    } else if (params.originLocation && params.destination) {
      // Fluxo antigo/alternativo (ex: FAB da HomeScreen se 'destination' for o tripHeadsign)
      // Adapte conforme necessário se 'destination' não for o tripHeadsign neste fluxo
      activeStopLocation = params.originLocation;
      activeTripHeadsign = params.destination; // Assumindo que destination É o tripHeadsign
      setDisplayOriginText(params.origin || `Lat: ${activeStopLocation?.latitude.toFixed(4)}, Lon: ${activeStopLocation?.longitude.toFixed(4)}`);
      setDisplayLineText(params.destination ? `Linha: ${params.destination}` : "Linha não definida");
    }

    if (activeStopLocation && activeTripHeadsign) {
      setStopLocation(activeStopLocation);
      setSelectedTripHeadsign(activeTripHeadsign);
    } else {
      console.error("ConfirmationScreen: Parâmetros de navegação inválidos ou ausentes!", params);
      Alert.alert("Erro de Navegação", "Informações necessárias para esta tela não foram fornecidas. Retornando...", [
        { text: "OK", onPress: () => navigation.goBack() }
      ]);
    }
  }, [route.params, navigation]);
  // --- FIM DA LÓGICA DE PARÂMETROS ATUALIZADA ---


  const [loadingRoute, setLoadingRoute] = useState<boolean>(true); // Mantido para o mapa
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [nearbyBuses, setNearbyBuses] = useState<Bus[]>([]);
  // const [selectedBus, setSelectedBus] = useState<string | null>(null); // Parece não ser usado para seleção, mas para exibir info do histórico
  // const [busHistory, setBusHistory] = useState<any[]>([]); // Relacionado a selectedBus
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [nearestBusInfo, setNearestBusInfo] = useState<{ bus: Bus | null; timeEstimate: string }>({ bus: null, timeEstimate: 'Calculando...' });
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null); // Renomeado para clareza
  const fallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null); // Renomeado
  const webviewRef = useRef<WebView>(null);
  const hasVibratedNear = useRef(false); // Renomeado para clareza


  function formatTimeEstimate(distanceMetros: number | null | undefined, speedMetrosPorSegundo: number | null | undefined): string {
    if (distanceMetros == null || speedMetrosPorSegundo == null || speedMetrosPorSegundo <= 0.5) { // Considerar velocidade mínima
        return 'Calculando...';
    }
    const seconds = distanceMetros / speedMetrosPorSegundo;
    if (seconds < 0) return 'Calculando...'; // Evitar tempo negativo se dados inconsistentes
    if (seconds < 60) {
      return `${Math.round(seconds)}s`;
    }
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  }

  const fetchNearbyBuses = useCallback(async () => {
    if (!stopLocation || !selectedTripHeadsign) { // VERIFICA SE stopLocation e selectedTripHeadsign ESTÃO DEFINIDOS
      console.log('fetchNearbyBuses: stopLocation ou selectedTripHeadsign ainda não definidos. Aguardando...');
      return;
    }

    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert("Autenticação", "Sessão expirada.");
        signOut();
        navigation.reset({ index: 0, routes: [{ name: 'Login' }]});
        return;
      }

      // USA stopLocation AQUI
      const url = `${API_URL}/api/buses/nearby?latitude=${stopLocation.latitude}&longitude=${stopLocation.longitude}&radius=2`;
      console.log('ConfirmationScreen: Buscando ônibus em:', url, 'para a linha:', selectedTripHeadsign);
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
      });

      if (!response.ok) {
        // ... (tratamento de erro de resposta, como no original)
        if (response.status === 401 || response.status === 403) {
            Alert.alert("Autenticação", "Sessão inválida.");
            await AsyncStorage.removeItem('userToken');
            signOut();
            navigation.reset({ index: 0, routes: [{ name: 'Login' }]});
            return;
        }
        const errorText = await response.text();
        console.error('Erro HTTP ao buscar ônibus:', response.status, errorText);
        throw new Error(`Erro HTTP: ${response.status}`);
      }
      // ... (resto do processamento da resposta)

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

      // Filtra APENAS para os ônibus da linha selecionada (selectedTripHeadsign)
      const busesOfSelectedLine = data.buses.filter(
        (bus: Bus) => bus.trip_headsign === selectedTripHeadsign && typeof bus.distance === 'number'
      );

      console.log(`Encontrados ${busesOfSelectedLine.length} ônibus para a linha ${selectedTripHeadsign}`);
      setNearbyBuses(busesOfSelectedLine); // Atualiza o estado com os ônibus filtrados

      if (webviewRef.current) {
        webviewRef.current.postMessage(JSON.stringify({
          type: 'UPDATE_BUSES',
          buses: busesOfSelectedLine, // Envia apenas os ônibus da linha selecionada para o mapa
          stopLocation: stopLocation // Envia a localização da parada para o mapa
        }));
      }
      setLastUpdate(new Date().toISOString());

      if (busesOfSelectedLine.length > 0) {
        // Ordena para pegar o mais próximo (menor distância)
        busesOfSelectedLine.sort((a, b) => a.distance! - b.distance!);
        const nearestBus = busesOfSelectedLine[0];
        const timeEstimate = formatTimeEstimate(nearestBus.distance, nearestBus.velocidade);
        setNearestBusInfo({ bus: nearestBus, timeEstimate });

        const arrivalSeconds = nearestBus.distance! / (nearestBus.velocidade! > 0 ? nearestBus.velocidade! : 1);

        if (arrivalSeconds < 20 && !hasVibratedNear.current) {
          const pattern = Platform.OS === 'android' ? [0, 300, 300, 300, 300, 300, 300, 300] : [0, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3, 0.3]; // iOS usa segundos
          Vibration.vibrate(pattern);
          hasVibratedNear.current = true;
        } else if (arrivalSeconds >= 20) {
          hasVibratedNear.current = false;
        }
      } else {
        setNearestBusInfo({ bus: null, timeEstimate: 'Nenhum ônibus da linha se aproximando' });
        hasVibratedNear.current = false; // Reseta se nenhum ônibus for encontrado
      }

    } catch (error) {
      console.error('Erro completo em fetchNearbyBuses:', error);
      // Evitar alert aqui para não interromper o polling, apenas logar ou tratar de forma suave
      // Alert.alert('Erro de Conexão', 'Não foi possível obter dados dos ônibus.');
      setNearestBusInfo({ bus: null, timeEstimate: 'Erro ao buscar' });
    }
  }, [stopLocation, selectedTripHeadsign, navigation, signOut]); // Adicionado signOut


  // useEffect para o polling
  useEffect(() => {
    let isMounted = true; // Para evitar updates em componente desmontado

    const startPolling = async () => {
      // Verifica se os parâmetros essenciais (stopLocation, selectedTripHeadsign) já foram definidos
      if (!stopLocation || !selectedTripHeadsign) {
        console.log('Polling: Aguardando stopLocation e selectedTripHeadsign...');
        // Tenta novamente em breve se ainda não estiverem definidos
        if (isMounted) {
            setTimeout(() => { if(isMounted) startPolling(); }, 1000);
        }
        return;
      }

      const pending = await AsyncStorage.getItem('pendingRequest');
      if (pending !== 'true') {
        console.log('ConfirmationScreen: Não há solicitação pendente. Polling não iniciado/parado.');
        if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
        if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
        // Pode ser útil navegar de volta ou mostrar uma mensagem se o pedido foi cancelado em outro lugar
        // Alert.alert("Informação", "Sua solicitação de embarque não está mais ativa.", [{text: "OK", onPress: () => navigation.goBack()}]);
        return;
      }

      console.log('ConfirmationScreen: Iniciando polling dos ônibus para a linha', selectedTripHeadsign);
      fetchNearbyBuses(); // Chamada inicial

      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); // Limpa interval anterior se houver
      pollingIntervalRef.current = setInterval(() => {
        if (isMounted) fetchNearbyBuses();
      }, 7000); // Aumentado para 7 segundos

      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
      fallbackTimeoutRef.current = setTimeout(() => {
        if (isMounted) setLoadingRoute(false); // Para o loading do mapa se demorar muito
      }, 15000);
    };

    startPolling(); // Chama a função de polling

    return () => {
      isMounted = false;
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
      console.log('ConfirmationScreen: Polling parado e timeouts limpos.');
    };
  }, [stopLocation, selectedTripHeadsign, fetchNearbyBuses]); // Adicionado fetchNearbyBuses e outros estados relevantes


  const confirmEmbark = async () => {
    if (!selectedTripHeadsign) { // USA selectedTripHeadsign
      Alert.alert("Erro", "A linha de ônibus não foi definida para confirmação.");
      return;
    }
    // ... (resto da lógica de confirmEmbark, usando selectedTripHeadsign para o payload)
    // ... (o payload para PUT /api/requests/current já espera trip_headsign, o que é bom)
    setConfirming(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        throw new Error('Token não encontrado');
      }

      // A API espera { trip_headsign: string }
      const payload = { trip_headsign: selectedTripHeadsign };
      console.log("Confirmando embarque para:", payload);

      const response = await fetch(`${API_URL}/api/requests/current`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      console.log('Status da resposta de confirmação:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({error: `Erro HTTP: ${response.status}`})); // Garante que errorData.error exista
        throw new Error(errorData.error || `Erro HTTP: ${response.status}`);
      }

      // Limpa TODOS os dados pendentes do AsyncStorage
       await AsyncStorage.multiRemove([
              'pendingRequest',
              'pendingTripHeadsign',
              'pendingStopAddress',
              'pendingStopLat',
              'pendingStopLng',
              // 'pendingInitialNearestBusId', // Se você salvou este
            ]);
            // Garante que pendingRequest seja removido se multiRemove falhar por alguma razão ou não incluir
            await AsyncStorage.removeItem('pendingRequest');

            Alert.alert('Sucesso', 'Embarque confirmado!', [
              {
                text: 'OK',
                onPress: () => {
                  setShowConfirmModal(false);
                  if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current); // Para o polling

                  // ### ALTERAÇÃO AQUI ###
                  // Antes: navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
                  // Agora: Navega para LocationScreen
                  navigation.navigate('Location');
                  // ### FIM DA ALTERAÇÃO ###
                },
              },
            ]);
          } catch (error: any) {
            console.error('Erro completo na confirmação:', error);
            Alert.alert('Erro', error.message || 'Não foi possível confirmar o embarque');
          } finally {
            setConfirming(false);
          }
        };

  // --- ATUALIZAR O mapHtml ---
  // O mapa agora deve focar na stopLocation e mostrar os nearbyBuses (que já são da linha correta)
  const mapHtml = stopLocation ? `
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
    /* Ícone customizado para o ponto de parada */
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

    // Marcador para a parada do usuário
    const stopIcon = L.divIcon({ className: 'user-stop-icon', iconSize: [16, 16], iconAnchor: [8, 8] });
    L.marker([stopLat, stopLng], { icon: stopIcon }).addTo(map).bindPopup('Sua Parada');

    const busIcon = L.icon({
      iconUrl: 'https://cdn-icons-png.flaticon.com/512/3448/3448315.png', // Ícone de ônibus
      iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
    });

    let busMarkers = []; // Array para guardar os marcadores dos ônibus

    function updateBusMarkers(buses) {
      busMarkers.forEach(marker => map.removeLayer(marker)); // Remove marcadores antigos
      busMarkers = [];
      if (buses && buses.length > 0) {
        buses.forEach(bus => {
          const marker = L.marker([bus.latitude, bus.longitude], { icon: busIcon })
            .addTo(map)
            .bindPopup(\`Ônibus \${bus.bus_id || 'Desconhecido'}<br>Linha: \${bus.trip_headsign || selectedTripHeadsign}\`);
          busMarkers.push(marker);
        });
        // Opcional: ajustar o zoom para ver a parada e os ônibus, se necessário
        // const allPoints = buses.map(b => [b.latitude, b.longitude]);
        // allPoints.push([stopLat, stopLng]);
        // map.fitBounds(allPoints, { padding: [50, 50] });
      }
    }

    map.whenReady(() => window.ReactNativeWebView.postMessage('MAP_LOADED'));

    // Listener para mensagens do React Native
    window.addEventListener('message', event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'UPDATE_BUSES') {
          updateBusMarkers(message.buses);
          // Se message.stopLocation for enviado, podemos usá-lo para re-centralizar, mas já temos stopLat/Lng
        }
      } catch (e) { console.error('Erro ao processar mensagem do RN:', e); }
    });
  </script>
</body>
</html>`
: null; // Se stopLocation for null, não renderiza o mapa

  const handleMessageFromWebview = (event: WebViewMessageEvent) => { // Renomeado para clareza
    const data = event.nativeEvent.data;
    console.log('Mensagem do WebView (ConfirmationScreen):', data);
    if (data === 'MAP_LOADED' || data === 'ROUTE_OK') { // ROUTE_OK pode ser removido se não houver mais rotas P2P
      setLoadingRoute(false);
      if (fallbackTimeoutRef.current) clearTimeout(fallbackTimeoutRef.current);
    }
    // Adicione mais tratamentos de mensagem se necessário
  };


  // JSX do return
  if (!stopLocation || !selectedTripHeadsign) {
    // Se os parâmetros ainda não foram carregados pelo useEffect inicial, mostra um loading ou null
    return (
      <View style={styles.containerLoadingParams}>
        <ActivityIndicator size="large" color="#d50000" />
        <Text>Carregando informações da solicitação...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {mapHtml && ( // Só renderiza WebView se mapHtml estiver pronto
           <WebView
            ref={webviewRef} // Adicionado ref
            key={`${stopLocation.latitude}-${stopLocation.longitude}`} // Chave para forçar recarga se a parada mudar
            source={{ html: mapHtml }}
            originWhitelist={['*']}
            mixedContentMode="always" // Ou 'never' se não precisar de conteúdo misto
            javaScriptEnabled={true}
            domStorageEnabled={true}
            onMessage={handleMessageFromWebview}
            onLoadEnd={() => { // Se MAP_LOADED não for confiável ou como fallback
                if (loadingRoute) setTimeout(() => setLoadingRoute(false), 3000);
            }}
            renderLoading={() => ( /* Este loading é para o WebView em si */
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color="#d50000" />
              </View>
            )}
            scrollEnabled={false}
            nestedScrollEnabled={false}
          />
        )}
        {/* Loading overlay para o carregamento inicial da rota/mapa, se ainda for útil */}
        {loadingRoute && (
          <View style={styles.loadingOverlay}>
            <ActivityIndicator size="large" color="#d50000" />
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Acompanhando Embarque</Text>

        <View style={styles.infoRow}>
          <Icon name="location-sharp" size={20} color="#d50000" />
          <View style={styles.infoText}>
            <Text style={styles.label}>Sua Parada</Text>
            <Text style={styles.textValue} numberOfLines={1} ellipsizeMode="tail">{displayOriginText}</Text>
          </View>
        </View>

        <View style={styles.infoRow}>
          <Icon name="bus-outline" size={20} color="#333" />
          <View style={styles.infoText}>
            <Text style={styles.label}>Linha Selecionada</Text>
            <Text style={styles.textValue}>{selectedTripHeadsign}</Text>
          </View>
        </View>

        <View style={[styles.infoRow, styles.etaContainer]}>
          <Icon name="time-outline" size={24} color={nearestBusInfo.bus ? "#007bff" : "#888"} />
          <View style={styles.infoText}>
            <Text style={styles.label}>Próximo ônibus da linha chega em:</Text>
            <Text style={[styles.textValue, styles.etaText, !nearestBusInfo.bus && styles.etaTextError]}>
              {nearestBusInfo.timeEstimate}
            </Text>
            {nearestBusInfo.bus && <Text style={styles.busDetailText}>Veículo: {nearestBusInfo.bus.bus_id}</Text>}
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, (confirming || !nearestBusInfo.bus) && styles.buttonDisabled]} // Desabilita se não houver ônibus próximo
          onPress={() => setShowConfirmModal(true)}
          disabled={confirming || !nearestBusInfo.bus} // Desabilita se não houver ônibus próximo
        >
          <Text style={styles.buttonText}>Confirmar Embarque no Ônibus Acima</Text>
        </TouchableOpacity>
      </View>

      {/* Botão de feedback/denúncia - manter se a lógica for implementada */}
      {/* <TouchableOpacity style={styles.feedbackButton} onPress={() => { /* Lógica de feedback }}>
        <Icon name="alert-circle-outline" size={26} color="#fff" />
      </TouchableOpacity> */}

      <Modal
        transparent
        animationType="fade"
        visible={showConfirmModal}
        onRequestClose={() => { if(!confirming) setShowConfirmModal(false); }}
      >
        {/* ... (Modal JSX sem alterações significativas, exceto talvez o texto da pergunta) ... */}
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalQuestion}>
              Deseja confirmar o embarque na linha {selectedTripHeadsign}?
              {nearestBusInfo.bus && `\n(Veículo: ${nearestBusInfo.bus.bus_id})`}
            </Text>
            {confirming
              ? <ActivityIndicator size="large" color="#d50000" style={{marginVertical: 20}}/>
              : (
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
              )
            }
          </View>
        </View>
      </Modal>


    </View>
  );
};

// Adicionar ou ajustar estilos conforme necessário para as novas informações
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  containerLoadingParams: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  mapContainer: { height: '40%', backgroundColor: '#e9ecef' }, // Ajustado
  webview: { flex: 1 },
  loadingOverlay: { /* ... (como antes) ... */
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  card: { /* ... (como antes, talvez com padding ajustado) ... */
    flex: 1, backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    marginTop: -24, padding: 20, elevation: 5,
    shadowColor: '#000', shadowOffset: { width: 0, height: -3 }, shadowOpacity: 0.1, shadowRadius: 4,
  },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 16, color: '#000' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, paddingVertical: 8, borderBottomWidth:1, borderBottomColor: '#f0f0f0'},
  infoText: { marginLeft: 12, flex: 1 },
  label: { fontSize: 13, color: '#555', marginBottom: 2 },
  textValue: { fontSize: 16, color: '#000', fontWeight: '500' },
  etaContainer: { backgroundColor: '#f8f9fa', paddingHorizontal:10, paddingVertical:12, borderRadius: 8, borderBottomWidth:0, alignItems:'center'},
  etaText: { fontSize: 18, fontWeight: 'bold', color: '#007bff'},
  etaTextError: { color: '#888', fontStyle:'italic'},
  busDetailText: {fontSize: 12, color: '#666', marginTop: 2},
  button: { /* ... (como antes) ... */
    marginTop: 24, backgroundColor: '#d50000', borderRadius: 12, paddingVertical: 16, alignItems: 'center',
  },
  buttonDisabled: { backgroundColor: '#ccc' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  // feedbackButton: { /* ... */ },
  modalOverlay: { /* ... (como antes) ... */
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, /* Ajustado para cobrir toda a tela */
    backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', padding: 20, zIndex: 50,
  },
  modalBox: { /* ... (como antes) ... */
    backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems:'center'
  },
  modalQuestion: { fontSize: 17, fontWeight: '600', marginBottom: 24, textAlign: 'center', color: '#333', lineHeight:24 },
  modalButtons: { flexDirection: 'row', justifyContent: 'space-around', width:'100%'},
  modalBtn: { flex: 1, marginHorizontal: 8, paddingVertical: 12, borderRadius: 8, alignItems: 'center'},
  modalBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  bottomNav: { /* ... (como antes) ... */
    height: 60, flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e0e0e0',
    justifyContent: 'space-around', alignItems: 'center',
  },
  fabContainer: { width: 60, alignItems: 'center', marginTop: -30 },
  fab: { /* ... (como antes) ... */
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff', justifyContent: 'center',
    alignItems: 'center', elevation: 8, shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 4.65,
  },
  fabText: { fontSize: 32, color: '#000', lineHeight: 36 },
});

export default ConfirmationScreen;