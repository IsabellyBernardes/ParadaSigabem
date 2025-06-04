// src/screens/LocationScreen.tsx
import React, { useState, useEffect, useContext, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Platform,
  ActivityIndicator,
  FlatList,
} from 'react-native';
import { WebView } from 'react-native-webview';
import { useNavigation } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/Ionicons';
import Geolocation, {
  GeolocationResponse,
} from 'react-native-geolocation-service';
import {
  requestMultiple,
  PERMISSIONS,
  RESULTS,
} from 'react-native-permissions';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '../config';
import { AuthContext } from '../contexts/AuthContext';

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
  distance?: number; // Certifique-se que a API retorna isso e que ele é numérico
}

type RootStackParamList = {
  Home: undefined;
  Location: undefined;
  Profile: undefined;
  Confirmation: {
    currentStopLocation: Location;
    tripHeadsign: string;
    // Você pode querer passar o nearestBusId para ConfirmationScreen também, se útil
    // initialNearestBusId?: string | null;
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
  const [currentAddress, setCurrentAddress] = useState<string>('Buscando sua localização...');
  const [loadingLocation, setLoadingLocation] = useState<boolean>(false);
  const [loadingLines, setLoadingLines] = useState<boolean>(false); // Usado para carregar linhas e selecionar linha
  const [availableTripHeadsigns, setAvailableTripHeadsigns] = useState<string[]>([]);
  const [fabIconName, setFabIconName] = useState<string>("add-outline");

  // ... (requestLocationPermissions, fetchReverseGeocode, fetchAvailableLines, getCurrentLocationAndFetchLines, useEffect[handleFocus] permanecem os mesmos) ...
  // Vou colar essas funções novamente para completude, sem alterações nelas:
  const requestLocationPermissions = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const statuses = await requestMultiple([
          PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION,
        ]);
        const fine =
          statuses[PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION] === RESULTS.GRANTED;
        const coarse =
          statuses[PERMISSIONS.ANDROID.ACCESS_COARSE_LOCATION] === RESULTS.GRANTED;

        if (!fine && !coarse) {
          Alert.alert(
            'Permissão negada',
            'Conceda permissão de localização ao app para prosseguir.'
          );
          return false;
        }
        return fine;
      } else { // iOS
        const status = await requestMultiple([
          PERMISSIONS.IOS.LOCATION_WHEN_IN_USE,
        ]);
        const granted = status[PERMISSIONS.IOS.LOCATION_WHEN_IN_USE] === RESULTS.GRANTED;
        if (!granted) {
           Alert.alert(
            'Permissão negada',
            'Conceda permissão de localização ao app para prosseguir.'
          );
        }
        return granted;
      }
    } catch(err) {
      console.error("Erro ao pedir permissão:", err);
      Alert.alert('Erro', 'Não foi possível solicitar permissão.');
      return false;
    }
  };

  const fetchReverseGeocode = async (loc: Location) => {
    try {
      const resp = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${loc.latitude}&lon=${loc.longitude}&accept-language=pt-BR&zoom=18`,
        { headers: { 'User-Agent': 'SigabemApp/1.0 (seu-email@example.com)' } }
      );
      const data = await resp.json();
      const addr = data.address || {};
      const street = addr.road || addr.pedestrian || addr.residential || '';
      const neighbourhood = addr.suburb || addr.neighbourhood || addr.district || '';
      const city = addr.city || addr.town || addr.village || '';
      let formatted = street;
      if (neighbourhood) formatted += (formatted ? ', ' : '') + neighbourhood;
      if (city) formatted += (formatted ? ', ' : '') + city;
      if (!formatted && data.display_name) formatted = data.display_name.split(',').slice(0,3).join(', ');
      setCurrentAddress(formatted || 'Localização Atual');
    } catch {
      console.warn('Erro no reverse geocoding para parada');
      setCurrentAddress('Localização Atual');
    }
  };

  const fetchAvailableLines = useCallback(async (location: Location) => {
    setLoadingLines(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert("Autenticação", "Sessão expirada. Faça login novamente.");
        signOut();
        navigation.navigate('Login');
        return;
      }
      const response = await fetch(
        `${API_URL}/api/buses/nearby?latitude=${location.latitude}&longitude=${location.longitude}&radius=0.5`,
        { headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json'} }
      );
      if (response.status === 401 || response.status === 403) {
        Alert.alert("Autenticação", "Sessão inválida. Faça login novamente.");
        await AsyncStorage.removeItem('userToken');
        signOut();
        navigation.navigate('Login');
        return;
      }
      if (!response.ok) {
        const errBody = await response.text();
        console.error("Erro da API (fetchAvailableLines):", errBody);
        throw new Error(`Erro ${response.status} ao buscar linhas.`);
      }
      const data: { success: boolean; buses: BusFromAPI[]; error?: string } = await response.json();
      if (!data.success || !data.buses) {
        throw new Error(data.error || 'Resposta inválida da API de linhas');
      }
      const uniqueHeadsigns = Array.from(
        new Set(
          data.buses
            .map((bus) => bus.trip_headsign)
            .filter((headsign): headsign is string => !!headsign && headsign.trim() !== '')
        )
      ).sort();
      setAvailableTripHeadsigns(uniqueHeadsigns);
    } catch (error: any) {
      console.error('Erro em fetchAvailableLines:', error);
      Alert.alert('Erro de Rede', error.message || 'Não foi possível buscar as linhas. Verifique sua conexão.');
      setAvailableTripHeadsigns([]);
    } finally {
      setLoadingLines(false);
    }
  }, [navigation, signOut]);

  const getCurrentLocationAndFetchLines = useCallback(async () => {
    const hasPermission = await requestLocationPermissions();
    if (!hasPermission) return;
    setLoadingLocation(true);
    setAvailableTripHeadsigns([]);
    setCurrentAddress('Buscando sua localização...');
    setCurrentLocation(null);
    Geolocation.getCurrentPosition(
      async (pos: GeolocationResponse) => {
        const loc = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        setCurrentLocation(loc);
        await fetchReverseGeocode(loc);
        setLoadingLocation(false);
        await fetchAvailableLines(loc);
      },
      (error) => {
        setLoadingLocation(false);
        setCurrentAddress('Erro ao obter localização');
        Alert.alert('Erro de Localização', `Código ${error.code}: ${error.message}`);
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 1000, distanceFilter: 5 }
    );
  }, [fetchAvailableLines]);

  useEffect(() => {
    const handleFocus = async () => {
      const pending = await AsyncStorage.getItem('pendingRequest');
      setFabIconName(pending === 'true' ? "arrow-forward-circle-outline" : "add-outline");
      if (pending !== 'true') {
        getCurrentLocationAndFetchLines();
      }
    };
    const unsubscribeFocus = navigation.addListener('focus', handleFocus);
    handleFocus();
    return unsubscribeFocus;
  }, [navigation, getCurrentLocationAndFetchLines]);


  // ##################################################################
  // ### MODIFICAÇÕES AQUI em handleSelectLine ###
  // ##################################################################
  const handleSelectLine = async (tripHeadsign: string) => {
    if (!currentLocation) {
      Alert.alert('Erro', 'Localização da parada não definida. Tente atualizar.');
      return;
    }

    Alert.alert(
      "Confirmar Linha",
      `Deseja acompanhar a linha ${tripHeadsign} a partir de ${currentAddress || 'sua localização atual'}?`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Sim",
          onPress: async () => {
            setLoadingLines(true);
            try {
              const token = await AsyncStorage.getItem('userToken');
              if (!token) {
                 Alert.alert("Autenticação", "Sessão expirada. Faça login novamente.");
                 signOut();
                 navigation.navigate('Login');
                 setLoadingLines(false); // Importante resetar o loading
                 return;
              }

              // --- INÍCIO DA NOVA LÓGICA: Buscar o ônibus mais próximo da linha selecionada ---
              let initialNearestBusId: string | null = null;
              if (currentLocation) { // Redundante, já checado, mas bom para clareza
                try {
                  console.log(`Buscando ônibus próximos para a linha ${tripHeadsign} em ${currentLocation.latitude},${currentLocation.longitude}`);
                  const busesResponse = await fetch(
                    `${API_URL}/api/buses/nearby?latitude=${currentLocation.latitude}&longitude=${currentLocation.longitude}&radius=2`, // Raio de 2km para buscar o ônibus mais próximo da linha
                    {
                      headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/json',
                      },
                    }
                  );

                  if (busesResponse.ok) {
                    const busesData: { success: boolean; buses: BusFromAPI[]; error?: string } = await busesResponse.json();
                    if (busesData.success && busesData.buses && busesData.buses.length > 0) {
                      const relevantBuses = busesData.buses.filter(
                        (bus) => bus.trip_headsign === tripHeadsign && typeof bus.distance === 'number' // Garante que distance existe e é um número
                      );

                      if (relevantBuses.length > 0) {
                        relevantBuses.sort((a, b) => a.distance! - b.distance!); // Ordena pela distância (menor primeiro)
                        initialNearestBusId = relevantBuses[0].bus_id;
                        console.log(`Ônibus mais próximo (ID: ${initialNearestBusId}) para a linha ${tripHeadsign} encontrado a ${relevantBuses[0].distance?.toFixed(0)}m.`);
                      } else {
                        console.log(`Nenhum ônibus da linha ${tripHeadsign} encontrado nas proximidades para definir como 'initialNearestBusId'.`);
                      }
                    }
                  } else {
                    console.warn(`Falha ao buscar ônibus próximos para determinar initialNearestBusId: ${busesResponse.status}`);
                    // Não bloqueia a criação do request, initialNearestBusId permanecerá null
                  }
                } catch (e) {
                  console.error("Erro ao buscar ônibus mais próximo:", e);
                  // Não bloqueia, initialNearestBusId permanecerá null
                }
              }
              // --- FIM DA NOVA LÓGICA ---

              const payload = {
                origin: currentAddress || `Lat:${currentLocation.latitude.toFixed(4)},Lon:${currentLocation.longitude.toFixed(4)}`,
                destination: tripHeadsign, // Mantém o trip_headsign como 'destination' para a lógica de acompanhamento
                requested: true,
                initial_nearest_bus_id: initialNearestBusId, // <<< NOVO CAMPO ENVIADO PARA A API
              };

              console.log("Enviando para /api/requests:", payload);

              const resp = await fetch(`${API_URL}/api/requests`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify(payload),
              });

              if (resp.status === 401 || resp.status === 403) {
                  Alert.alert("Autenticação", "Sessão inválida. Faça login novamente.");
                  await AsyncStorage.removeItem('userToken');
                  signOut();
                  navigation.navigate('Login');
                  return; // Sai da função aqui
              }

              if (!resp.ok) {
                const errorData = await resp.json().catch(() => ({ error: `Erro HTTP ${resp.status}` }));
                throw new Error(errorData.error || `Falha ao registrar interesse na linha.`);
              }

              // Se chegou aqui, o request foi salvo com sucesso (com ou sem initial_nearest_bus_id)
              await AsyncStorage.setItem('pendingRequest', 'true');
              await AsyncStorage.setItem('pendingTripHeadsign', tripHeadsign);
              await AsyncStorage.setItem('pendingStopAddress', currentAddress || 'Localização Atual');
              await AsyncStorage.setItem('pendingStopLat', currentLocation.latitude.toString());
              await AsyncStorage.setItem('pendingStopLng', currentLocation.longitude.toString());
              // Se quiser passar o initialNearestBusId para a ConfirmationScreen:
              // if (initialNearestBusId) {
              //   await AsyncStorage.setItem('pendingInitialNearestBusId', initialNearestBusId);
              // } else {
              //   await AsyncStorage.removeItem('pendingInitialNearestBusId');
              // }
              setFabIconName("arrow-forward-circle-outline");

              navigation.navigate('Confirmation', {
                currentStopLocation: currentLocation,
                tripHeadsign: tripHeadsign,
                // initialNearestBusId: initialNearestBusId, // Descomente se quiser passar via params
              });
            } catch (error: any) {
              console.error('Erro em handleSelectLine (POST /api/requests):', error);
              Alert.alert('Erro', error.message || 'Não foi possível selecionar a linha.');
            } finally {
              setLoadingLines(false);
            }
          },
        },
      ]
    );
  };
  // ##################################################################
  // ### FIM DAS MODIFICAÇÕES em handleSelectLine ###
  // ##################################################################


  const mapHtmlForStop = currentLocation
    ? `
<!DOCTYPE html>
<html>
  <head>
    <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0"/>
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css"/>
    <style>
      html, body, #map { height:100%; margin:0; padding:0; overflow: hidden; }
      .leaflet-control-attribution, .leaflet-control-zoom { display:none; }
    </style>
  </head>
  <body>
    <div id="map"></div>
    <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
    <script>
      const map = L.map('map', { zoomControl: false, attributionControl: false }).setView([${currentLocation.latitude}, ${currentLocation.longitude}], 17);
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png', {
          subdomains: 'abcd',
          maxZoom: 20
      }).addTo(map);
      L.marker([${currentLocation.latitude}, ${currentLocation.longitude}]).addTo(map);
      map.on('load', function() {
        const mapContainer = document.getElementById('map');
        mapContainer.style.touchAction = 'none';
      });
      document.getElementById('map').addEventListener('touchstart', function(e) {
          e.preventDefault();
      }, { passive: false });
    </script>
  </body>
</html>`
    : null;

  const renderLineItem = ({ item }: { item: string }) => (
    <TouchableOpacity
      style={styles.lineButton}
      onPress={() => handleSelectLine(item)}
    >
      <Icon name="bus-outline" size={20} color="#d50000" style={styles.lineIcon} />
      <Text style={styles.lineButtonText}>{item}</Text>
    </TouchableOpacity>
  );

  return (
    // O JSX do return permanece o mesmo que na versão anterior que você enviou,
    // incluindo os textos de teste no Bloco C se você os manteve.
    // Certifique-se que a BottomNav e o FAB estão corretos.
    <View style={styles.container}>
      <View style={styles.mapContainer}>
        {loadingLocation && !currentLocation && (
          <View style={styles.mapPlaceholder}>
            <ActivityIndicator size="large" color="#d50000" />
            <Text style={styles.mapPlaceholderText}>Obtendo sua localização...</Text>
          </View>
        )}
        {currentLocation && mapHtmlForStop && (
          <WebView
            key={`${currentLocation.latitude}-${currentLocation.longitude}-${currentAddress}`}
            source={{ html: mapHtmlForStop }}
            originWhitelist={['*']}
            style={styles.webview}
            scrollEnabled={false}
            nestedScrollEnabled={false}
            onTouchStart={(e) => e.preventDefault()}
            onTouchMove={(e) => e.preventDefault()}
          />
        )}
        {!loadingLocation && !currentLocation && (
          <View style={styles.mapPlaceholder}>
            <Icon name="map-outline" size={50} color="#ccc" />
            <Text style={styles.mapPlaceholderText}>Mapa da sua localização aparecerá aqui.</Text>
            <TouchableOpacity style={styles.retryButton} onPress={getCurrentLocationAndFetchLines}>
                <Text style={styles.retryButtonText}>Buscar Localização e Linhas</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.headerContainer}>
            <Text style={styles.title}>Parada Atual</Text>
            <TouchableOpacity onPress={getCurrentLocationAndFetchLines} style={styles.refreshButton}>
                <Icon name="refresh-outline" size={26} color="#d50000" />
            </TouchableOpacity>
        </View>

        <Text style={styles.addressText} numberOfLines={2} ellipsizeMode="tail">
            {loadingLocation && !currentAddress ? 'Obtendo endereço...' : currentAddress}
        </Text>

        {loadingLines && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#d50000" />
            <Text style={styles.loadingText}>Buscando linhas disponíveis...</Text>
          </View>
        )}

        {!loadingLines && availableTripHeadsigns.length > 0 && (
          <>
            <Text style={styles.subtitle}>Selecione uma linha para embarcar:</Text>
            <FlatList
              data={availableTripHeadsigns}
              renderItem={renderLineItem}
              keyExtractor={(item, index) => `${item}-${index}`}
              style={styles.list}
              contentContainerStyle={{ paddingBottom: 10 }}
            />
          </>
        )}
        {/* Mensagem se não houver linhas (com seus textos de teste) */}
        {!loadingLines && !loadingLocation && availableTripHeadsigns.length === 0 && currentLocation && (
          <View style={styles.loadingContainer}>
            <Icon name="information-circle-outline" size={40} color="#6c757d" style={{marginBottom:10}}/>
            <Text style={styles.noLinesText}>
              Teste Linha Principal
            </Text>
            <Text style={styles.noLinesSubText}>
              Teste Subtexto
            </Text>
          </View>
        )}
      </View>


    </View>
  );
};

// ... (styles permanecem os mesmos da versão anterior)
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f0f0f0' },
  mapContainer: { height: '35%', backgroundColor: '#e9ecef' },
  webview: { flex: 1 },
  mapPlaceholder: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  mapPlaceholderText: { color: '#6c757d', fontSize: 16, textAlign: 'center', marginTop:10 },
  retryButton: { backgroundColor: '#d50000', paddingVertical: 10, paddingHorizontal:20, borderRadius: 20, marginTop: 15},
  retryButtonText: { color: '#fff', fontSize: 16, fontWeight: 'bold'},
  card: {
    flex: 1,
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 5,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: { fontSize: 20, fontWeight: 'bold', color: '#222' },
  refreshButton: { padding: 5 },
  addressText: { fontSize: 14, color: '#555', marginBottom: 15, minHeight: 20 },
  subtitle: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 10, marginTop: 5 },
  loadingContainer: { flex:1, justifyContent:'center', alignItems:'center', paddingBottom: 20},
  loadingText: { marginTop:10, fontSize:15, color:'#555'},
  noLinesText: { fontSize: 15, color: '#444', textAlign: 'center', paddingHorizontal: 10 },
  noLinesSubText: { fontSize: 13, color: '#6c757d', textAlign: 'center', marginTop: 5},
  list: { flex: 1, marginTop: 5 },
  lineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f9f9f9',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 10,
    borderColor: '#ededed',
    borderWidth: 1,
  },
  lineIcon: { marginRight: 12 },
  lineButtonText: { fontSize: 16, color: '#333', fontWeight: '500' },
  bottomNav: {
    height: 60, flexDirection: 'row', backgroundColor: '#fff',
    borderTopWidth: 1, borderTopColor: '#e0e0e0',
    justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 10,
  },
  navButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  fabContainer: {
    width: 70,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    marginTop: -35,
  },
  fab: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: '#fff',
    justifyContent: 'center', alignItems: 'center', elevation: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3, shadowRadius: 4.65,
    borderWidth: Platform.OS === 'android' ? 0 : 1,
    borderColor: Platform.OS === 'android' ? 'transparent' : '#ddd',
  },
});

export default LocationScreen;