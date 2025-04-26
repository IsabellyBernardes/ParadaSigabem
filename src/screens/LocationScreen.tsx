import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, PermissionsAndroid, Platform, StyleSheet, Alert } from 'react-native';
import Geolocation, { GeoPosition } from 'react-native-geolocation-service';
import { WebView } from 'react-native-webview';

interface Location {
  latitude: number;
  longitude: number;
}

const LocationScreen: React.FC = () => {
  const [location, setLocation] = useState<Location | null>(null);
  const [address, setAddress] = useState<string>('');
  const [hasPermission, setHasPermission] = useState<boolean>(false);

  useEffect(() => {
    requestLocationPermission();
  }, []);

  async function requestLocationPermission() {
    try {
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
          {
            title: 'Permissão de Localização',
            message: 'Precisamos da sua localização para mostrar no mapa.',
            buttonNeutral: 'Perguntar depois',
            buttonNegative: 'Cancelar',
            buttonPositive: 'OK',
          }
        );
        if (granted === PermissionsAndroid.RESULTS.GRANTED) {
          setHasPermission(true);
          getCurrentLocation();
        } else {
          console.log('Permissão negada');
        }
      } else {
        // No iOS, Geolocation.requestAuthorization já é automático
        Geolocation.requestAuthorization('whenInUse').then(auth => {
          if (auth === 'granted') {
            setHasPermission(true);
            getCurrentLocation();
          } else {
            console.log('Permissão negada');
          }
        });
      }
    } catch (err) {
      console.warn(err);
    }
  }

  function getCurrentLocation() {
    Geolocation.getCurrentPosition(
      (position: GeoPosition) => {
        console.log('Localização recebida:', position);
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        console.error('Erro ao pegar localização:', error);
        Alert.alert('Erro', 'Não foi possível obter a localização.');
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 10000,
        forceRequestLocation: true,
        showLocationDialog: true,
      }
    );
  }


  const mapHtml = location ? `
    <!DOCTYPE html>
    <html>
      <head>
        <meta name="viewport" content="initial-scale=1.0, maximum-scale=1.0">
        <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.3/dist/leaflet.css" />
        <script src="https://unpkg.com/leaflet@1.9.3/dist/leaflet.js"></script>
        <style> #map { height: 100vh; margin: 0; padding: 0; } </style>
      </head>
      <body>
        <div id="map"></div>
        <script>
          var map = L.map('map').setView([${location.latitude}, ${location.longitude}], 16);
          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
          }).addTo(map);
          var marker = L.marker([${location.latitude}, ${location.longitude}]).addTo(map);
        </script>
      </body>
    </html>
  ` : null;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ height: '50%' }}>
        {location ? (
          <WebView source={{ html: mapHtml || '' }} />
        ) : (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Text>Carregando mapa...</Text>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.title}>Informe a sua localização</Text>
        <Text style={styles.label}>Sua Localização</Text>
        <TouchableOpacity onPress={requestLocationPermission}>
          <Text style={styles.link}>Deseja utilizar a localização atual?</Text>
        </TouchableOpacity>
        <Text style={styles.address}>
          {address || 'Localização ainda não detectada'}
        </Text>

        <View style={styles.buttons}>
          <TouchableOpacity style={styles.button}><Text>🏠 Casa</Text></TouchableOpacity>
          <TouchableOpacity style={styles.button}><Text>🏢 Trabalho</Text></TouchableOpacity>
          <TouchableOpacity style={styles.button}><Text>📍 Outros</Text></TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.saveButton}>
          <Text style={styles.saveButtonText}>Salvar endereço</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    marginTop: -24,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  label: {
    marginTop: 8,
    color: '#555',
  },
  link: {
    color: 'red',
    marginTop: 8,
  },
  address: {
    marginTop: 8,
    fontSize: 16,
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 16,
  },
  button: {
    backgroundColor: '#f1f1f1',
    padding: 12,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: '#d50000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
});

export default LocationScreen;
