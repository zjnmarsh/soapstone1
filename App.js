import React, { useState, useEffect, useCallback } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator, 
  Keyboard,
  Platform, 
  SafeAreaView, 
  StatusBar 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSoapstones, addSoapstone, addReaction, removeReaction } from './firebase';

const COLORS = {
  background: '#0F172A', // Slate 900
  card: '#1E293B',       // Slate 800
  text: '#F8FAFC',       // Slate 50
  muted: '#94A3B8',      // Slate 400
  accent: '#6366F1',     // Indigo 500
  success: '#10B981',    // Emerald 500
  border: '#334155',     // Slate 700
};

const LOCATION_REFRESH_MS = 2000;
const MAX_SOAPSTONE_DISTANCE_METERS = 40;
const MAP_VIEW_DISTANCE_METERS = 50;
const FALLBACK_COORDS = { lat: 51.5074, lng: -0.1278 };
const USERNAME_STORAGE_KEY = 'echo.username';

const Header = ({ username, onOpenSignIn }) => (
  <View style={styles.header}>
    <Text style={styles.headerTitle}>Echolocator</Text>
    <TouchableOpacity style={styles.signInButton} onPress={onOpenSignIn}>
      {username ? (
        <>
          <MaterialCommunityIcons name="account" size={16} color={COLORS.accent} />
          <Text style={styles.signInButtonText}>{username}</Text>
        </>
      ) : (
        <>
          <MaterialCommunityIcons name="login" size={16} color={COLORS.accent} />
          <Text style={styles.signInButtonText}>Sign In</Text>
        </>
      )}
    </TouchableOpacity>
  </View>
);

const isValidCoordinate = (coordinate) => (
  Number.isFinite(coordinate?.lat)
  && Number.isFinite(coordinate?.lng)
  && Math.abs(coordinate.lat) <= 90
  && Math.abs(coordinate.lng) <= 180
);

const degreesPerMeter = 1 / 111320;

const getDistanceMeters = (from, to) => {
  const earthRadiusMeters = 6371000;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLat = toRadians(to.lat - from.lat);
  const deltaLng = toRadians(to.lng - from.lng);
  const fromLat = toRadians(from.lat);
  const toLat = toRadians(to.lat);

  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
};

const getMapCenter = ({ currentCoords, soapstones }) => {
  if (isValidCoordinate(currentCoords)) {
    return currentCoords;
  }

  const firstSoapstoneCoord = soapstones
    .map((item) => item.coordinate)
    .find((coordinate) => isValidCoordinate(coordinate));

  return firstSoapstoneCoord || FALLBACK_COORDS;
};

const getWebMapHtml = ({ center, currentCoords, soapstones }) => {
  const soapstoneCoords = soapstones
    .map((item) => item.coordinate)
    .filter((coordinate) => isValidCoordinate(coordinate))
    .slice(0, 200);

  const markers = soapstoneCoords.map(({ lat, lng }) => ({
    lat,
    lng,
    type: 'soapstone',
  }));

  if (isValidCoordinate(currentCoords)) {
    markers.unshift({
      lat: currentCoords.lat,
      lng: currentCoords.lng,
      type: 'current',
    });
  }

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
  <style>
    html, body, #map { height: 100%; margin: 0; padding: 0; }
    body { background: #0f172a; }
    #map { filter: saturate(0.65) contrast(0.95) brightness(1.02); }
    .marker-user {
      position: relative;
      background: #0ea5e9;
      border: 2px solid #fff;
      border-radius: 999px;
      width: 18px;
      height: 18px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      transform: translate(-50%, -50%);
    }
    .marker-user::after {
      content: '';
      position: absolute;
      inset: -14px;
      border-radius: 999px;
      border: 3px solid rgba(14, 165, 233, 0.55);
      animation: userPulse 1.6s ease-out infinite;
    }
    .marker-msg {
      position: relative;
      width: 22px;
      height: 30px;
      box-sizing: border-box;
      transform: translate(-50%, -100%);
    }
    .marker-msg::before {
      content: '';
      position: absolute;
      left: 50%;
      top: 0;
      width: 22px;
      height: 22px;
      border-radius: 999px;
      background: #ef4444;
      border: 2px solid #fff;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
      transform: translateX(-50%);
    }
    .marker-msg::after {
      content: '';
      position: absolute;
      left: 50%;
      bottom: 0;
      transform: translateX(-50%);
      width: 0;
      height: 0;
      border-left: 5px solid transparent;
      border-right: 5px solid transparent;
      border-top: 10px solid #ef4444;
      filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2));
    }
    @keyframes userPulse {
      0% {
        transform: scale(0.8);
        opacity: 0.9;
      }
      70% {
        transform: scale(1.9);
        opacity: 0;
      }
      100% {
        transform: scale(1.9);
        opacity: 0;
      }
    }
  </style>
</head>
<body>
  <div id="map"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <script>
    const center = ${JSON.stringify(center)};
    const markers = ${JSON.stringify(markers)};
    const map = L.map('map', {
      zoomControl: false,
      attributionControl: false,
    }).setView([center.lat, center.lng], 14);

    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
    }).addTo(map);

    const viewportDeltaDegrees = ${MAP_VIEW_DISTANCE_METERS} * ${degreesPerMeter};
    const viewportBounds = [
      [center.lat - viewportDeltaDegrees, center.lng - viewportDeltaDegrees],
      [center.lat + viewportDeltaDegrees, center.lng + viewportDeltaDegrees],
    ];
    map.fitBounds(viewportBounds, { padding: [20, 20], maxZoom: 18 });

    const bounds = [];

    markers.forEach((m) => {
      const marker = L.marker([m.lat, m.lng], {
        icon: L.divIcon({
          className: m.type === 'current' ? 'marker-user' : 'marker-msg',
          html: '',
          iconSize: m.type === 'current' ? [18, 18] : [22, 30],
          iconAnchor: m.type === 'current' ? [9, 9] : [11, 30],
        }),
        zIndexOffset: m.type === 'current' ? 1000 : 0,
      }).addTo(map);

      bounds.push([m.lat, m.lng]);
    });

    if (bounds.length > 1) {
      map.fitBounds(bounds, { padding: [24, 24] });
    }
  </script>
</body>
</html>`;
};

const SoapstoneCard = ({ item, currentUsername }) => {
  const dateStr = item.datetime ? item.datetime.toLocaleString() : 'Just now';
  const userLikes = item.reactions?.likes || {};
  const userDislikes = item.reactions?.dislikes || {};
  const likeCount = Object.keys(userLikes).length;
  const dislikeCount = Object.keys(userDislikes).length;
  const userLiked = userLikes[currentUsername];
  const userDisliked = userDislikes[currentUsername];
  
  const handleLike = async () => {
    if (!currentUsername) {
      alert('Please sign in first');
      return;
    }
    if (userLiked) {
      await removeReaction(item.id, currentUsername, 'like');
    } else {
      await addReaction(item.id, currentUsername, 'like');
    }
  };
  
  const handleDislike = async () => {
    if (!currentUsername) {
      alert('Please sign in first');
      return;
    }
    if (userDisliked) {
      await removeReaction(item.id, currentUsername, 'dislike');
    } else {
      await addReaction(item.id, currentUsername, 'dislike');
    }
  };
  
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.locationContainer}>
          <MaterialCommunityIcons name="account" size={14} color={COLORS.muted} />
          <Text style={styles.locationText}>{item.username || 'Anonymous'}</Text>
          <Text style={styles.locationSeparator}>•</Text>
          <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.muted} />
          <Text style={styles.locationText}>
            {item.coordinate?.lat?.toFixed(4)}, {item.coordinate?.lng?.toFixed(4)}
          </Text>
          <Text style={styles.locationSeparator}>•</Text>
          <MaterialCommunityIcons name="image-filter-hdr" size={14} color={COLORS.muted} />
          <Text style={styles.locationText}>{Math.round(item.elevation ?? 0)}m</Text>
        </View>
        <Text style={styles.dateText}>{dateStr}</Text>
      </View>
      
      <Text style={styles.messageText}>{item.message}</Text>
      
      <View style={styles.cardFooter}>
        <TouchableOpacity 
          style={[styles.reactionButton, userLiked && styles.reactionButtonActive]}
          onPress={handleLike}
        >
          <MaterialCommunityIcons name="thumb-up" size={16} color={userLiked ? COLORS.success : COLORS.muted} />
          <Text style={[styles.reactionText, userLiked && styles.reactionTextActive]}>{likeCount}</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.reactionButton, userDisliked && styles.reactionButtonActive]}
          onPress={handleDislike}
        >
          <MaterialCommunityIcons name="thumb-down" size={16} color={userDisliked ? '#ef4444' : COLORS.muted} />
          <Text style={[styles.reactionText, userDisliked && { color: '#ef4444' }]}>{dislikeCount}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [soapstones, setSoapstones] = useState([]);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [locationData, setLocationData] = useState(null);
  const [isLocating, setIsLocating] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [username, setUsername] = useState('');
  const [signInUsername, setSignInUsername] = useState('');
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [webKeyboardInset, setWebKeyboardInset] = useState(0);

  useEffect(() => {
    // Note: This will only work after you add valid Firebase credentials in firebase.js
    // I'm wrapping in a check to prevent crashing if Firebase isn't set up yet
    try {
      const unsubscribe = getSoapstones((data) => {
        setSoapstones(data);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.warn("Firebase not initialized correctly. Please check firebase.js configuration.");
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const loadStoredUsername = async () => {
      try {
        const storedUsername = await AsyncStorage.getItem(USERNAME_STORAGE_KEY);
        if (storedUsername) {
          setUsername(storedUsername);
        }
      } catch (error) {
        console.warn('Unable to load stored username.');
      }
    };

    loadStoredUsername();
  }, []);

  const getCurrentLocationData = async () => {
    let { status } = await Location.getForegroundPermissionsAsync();

    if (status !== 'granted') {
      const permissionResult = await Location.requestForegroundPermissionsAsync();
      status = permissionResult.status;
    }

    if (status !== 'granted') {
      throw new Error('Location permission denied');
    }

    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });

    const coords = {
      lat: location.coords.latitude,
      lng: location.coords.longitude,
    };

    const elevation = Number.isFinite(location.coords.altitude)
      ? Math.round(location.coords.altitude)
      : 0;

    return { coords, elevation };
  };

  const refreshLocationData = useCallback(async ({ showLoading = true } = {}) => {
    if (showLoading) {
      setIsLocating(true);
    }

    try {
      const currentLocationData = await getCurrentLocationData();
      setLocationData(currentLocationData);
      setLocationError('');
      return currentLocationData;
    } catch (error) {
      if (error?.message === 'Location permission denied') {
        setLocationError('Location permission denied');
      } else {
        setLocationError('Unable to read current location');
      }
      return null;
    } finally {
      if (showLoading) {
        setIsLocating(false);
      }
    }
  }, []);

  useEffect(() => {
    let locationSubscription;

    const startLocationWatch = async () => {
      setIsLocating(true);
      try {
        const initialLocationData = await refreshLocationData({ showLoading: false });

        if (!initialLocationData) {
          return;
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.Balanced,
            timeInterval: LOCATION_REFRESH_MS,
            distanceInterval: 1,
          },
          (location) => {
            const coords = {
              lat: location.coords.latitude,
              lng: location.coords.longitude,
            };

            const elevation = Number.isFinite(location.coords.altitude)
              ? Math.round(location.coords.altitude)
              : 0;

            setLocationData({ coords, elevation });
            setLocationError('');
          }
        );
      } catch (error) {
        if (error?.message === 'Location permission denied') {
          setLocationError('Location permission denied');
        } else {
          setLocationError('Unable to watch current location');
        }
      } finally {
        setIsLocating(false);
      }
    };

    startLocationWatch();

    return () => {
      if (locationSubscription) {
        locationSubscription.remove();
      }
    };
  }, [refreshLocationData]);

  useEffect(() => {
    const showEvent = 'keyboardDidShow';
    const hideEvent = 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      setKeyboardHeight(event?.endCoordinates?.height || 0);
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return undefined;
    }

    const visualViewport = window.visualViewport;

    const updateViewportMetrics = () => {
      if (!visualViewport) {
        setWebKeyboardInset(0);
        return;
      }

      const layoutViewportHeight = document.documentElement.clientHeight;
      const keyboardInset = Math.max(
        0,
        layoutViewportHeight - (visualViewport.height + visualViewport.offsetTop)
      );
      setWebKeyboardInset(keyboardInset);
    };

    updateViewportMetrics();

    if (!visualViewport) {
      return undefined;
    }

    visualViewport.addEventListener('resize', updateViewportMetrics);
    visualViewport.addEventListener('scroll', updateViewportMetrics);

    return () => {
      visualViewport.removeEventListener('resize', updateViewportMetrics);
      visualViewport.removeEventListener('scroll', updateViewportMetrics);
    };
  }, []);

  const handleSignIn = async () => {
    const trimmedUsername = signInUsername.trim();
    if (!trimmedUsername) {
      alert('Please enter a username');
      return;
    }

    try {
      await AsyncStorage.setItem(USERNAME_STORAGE_KEY, trimmedUsername);
      setUsername(trimmedUsername);
      setSignInUsername('');
      setShowSignInModal(false);
    } catch (error) {
      alert('Unable to save username. Please try again.');
    }
  };

  const handleSignOut = async () => {
    try {
      await AsyncStorage.removeItem(USERNAME_STORAGE_KEY);
      setUsername('');
    } catch (error) {
      alert('Unable to sign out right now. Please try again.');
    }
  };

  const handleSubmit = async () => {
    if (!message.trim()) return;
    
    setIsSubmitting(true);
    try {
      const latestLocationData = await refreshLocationData({ showLoading: false });

      if (!latestLocationData) {
        alert('Current location is unavailable. Please enable location and try again.');
        return;
      }

      const { coords, elevation } = latestLocationData;
      const postUsername = username || 'Anonymous';
      
      await addSoapstone(message, coords, elevation, postUsername);
      setMessage('');
    } catch (error) {
      if (error?.message === 'Location permission denied') {
        alert('Location permission is required to post a soapstone.');
      } else {
        alert('Unable to get your location or save the soapstone. Check location settings and Firebase configuration.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const nearbySoapstones = soapstones.filter((item) => {
    if (!isValidCoordinate(locationData?.coords) || !isValidCoordinate(item.coordinate)) {
      return false;
    }

    return getDistanceMeters(locationData.coords, item.coordinate) <= MAX_SOAPSTONE_DISTANCE_METERS;
  });

  const mapCenter = getMapCenter({
    currentCoords: locationData?.coords,
    soapstones: nearbySoapstones,
  });
  const mappedSoapstonesCount = nearbySoapstones.length;
  const mapHtml = getWebMapHtml({
    center: mapCenter,
    currentCoords: locationData?.coords,
    soapstones: nearbySoapstones,
  });
  const mapRenderKey = `${locationData?.coords?.lat ?? 'na'}-${locationData?.coords?.lng ?? 'na'}-${mappedSoapstonesCount}`;
  const isPostDisabled = !message.trim() || !locationData || isSubmitting || isLocating;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <Header username={username} onOpenSignIn={() => setShowSignInModal(true)} />

      {showSignInModal && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Sign In</Text>
              <TouchableOpacity onPress={() => setShowSignInModal(false)}>
                <MaterialCommunityIcons name="close" size={24} color={COLORS.text} />
              </TouchableOpacity>
            </View>
            <Text style={styles.modalSubtitle}>Enter your username to post echoes</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Username"
              placeholderTextColor={COLORS.muted}
              value={signInUsername}
              onChangeText={setSignInUsername}
              maxLength={30}
            />
            <TouchableOpacity style={styles.modalButton} onPress={handleSignIn}>
              <Text style={styles.modalButtonText}>Sign In</Text>
            </TouchableOpacity>
            {username && (
              <TouchableOpacity style={[styles.modalButton, styles.signOutButton]} onPress={handleSignOut}>
                <Text style={styles.signOutButtonText}>Sign Out</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}

      <View style={styles.contentArea}>
        <View style={styles.mapSection}>
          <View style={styles.mapFrame}>
            {Platform.OS === 'web' ? (
              <iframe
                key={mapRenderKey}
                srcDoc={mapHtml}
                title="Soapstone map"
                style={{ width: '100%', height: '100%', border: 0 }}
              />
            ) : (
              <View style={styles.nativeMapFallback}>
                <MaterialCommunityIcons name="map-outline" size={24} color={COLORS.muted} />
                <Text style={styles.nativeFallbackText}>Map preview is enabled on web.</Text>
              </View>
            )}
          </View>

          <View style={styles.mapLegendRow}>
            <View style={styles.mapLegendItem}>
              <View style={styles.userLegendDot} />
              <Text style={styles.mapLegendText}>You</Text>
            </View>
            <View style={styles.mapLegendItem}>
              <View style={styles.messageLegendDot} />
              <Text style={styles.mapLegendText}>Echos ({mappedSoapstonesCount})</Text>
            </View>
          </View>
        </View>
        
        <View style={styles.container}>
          {loading ? (
            <ActivityIndicator size="large" color={COLORS.accent} style={{ flex: 1 }} />
          ) : (
            <FlatList
              data={nearbySoapstones}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <SoapstoneCard item={item} currentUsername={username} />}
              contentContainerStyle={styles.listContent}
              ListEmptyComponent={
                <View style={styles.emptyContainer}>
                  <MaterialCommunityIcons name="comment-text-multiple-outline" size={48} color={COLORS.border} />
                  <Text style={styles.emptyText}>No echos within {MAX_SOAPSTONE_DISTANCE_METERS}m.</Text>
                </View>
              }
            />
          )}
        </View>
      </View>

      <View
        style={[
          styles.inputWrapper,
          Platform.OS === 'web' && styles.webInputWrapper,
          { bottom: Platform.OS === 'web' ? webKeyboardInset : keyboardHeight },
        ]}
      >
        <View style={styles.locationStatusRow}>
          <View style={styles.locationStatusTextWrap}>
            <MaterialCommunityIcons name="crosshairs-gps" size={14} color={locationData ? COLORS.success : COLORS.muted} />
            {isLocating ? (
              <Text style={styles.locationStatusText}>Getting location...</Text>
            ) : locationData ? (
              <Text style={styles.locationStatusText}>
                {locationData.coords.lat.toFixed(5)}, {locationData.coords.lng.toFixed(5)} • {locationData.elevation}m
              </Text>
            ) : (
              <Text style={[styles.locationStatusText, styles.locationStatusErrorText]}>
                {locationError || 'Location unavailable'}
              </Text>
            )}
          </View>
          <TouchableOpacity
            style={styles.refreshLocationButton}
            onPress={refreshLocationData}
            disabled={isLocating || isSubmitting}
          >
            <MaterialCommunityIcons name="refresh" size={16} color={COLORS.accent} />
          </TouchableOpacity>
        </View>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Leave an echo"
            placeholderTextColor={COLORS.muted}
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendButton, isPostDisabled && styles.sendButtonDisabled]}
            onPress={handleSubmit}
            disabled={isPostDisabled}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="send" size={24} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}




const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
    minHeight: 0,
  },
  contentArea: {
    flex: 1,
    paddingBottom: 112,
    minHeight: 0,
  },
  mapSection: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  mapFrame: {
    height: 220,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  nativeMapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nativeFallbackText: {
    color: COLORS.muted,
    marginTop: 8,
  },
  mapLegendRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mapLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#0ea5e9',
    borderWidth: 1,
    borderColor: '#fff',
    marginRight: 6,
  },
  messageLegendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#ef4444',
    borderWidth: 1,
    borderColor: '#fff',
    marginRight: 6,
  },
  mapLegendText: {
    color: COLORS.muted,
    fontSize: 12,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    minHeight: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerTitle: {
    color: COLORS.text,
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  signInButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  signInButtonText: {
    color: COLORS.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 400,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    color: COLORS.text,
    fontSize: 18,
    fontWeight: '700',
  },
  modalSubtitle: {
    color: COLORS.muted,
    fontSize: 13,
    marginBottom: 16,
  },
  modalInput: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: COLORS.text,
    fontSize: 14,
    marginBottom: 16,
  },
  modalButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  modalButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  signOutButton: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
    borderWidth: 1,
    borderColor: '#ef4444',
  },
  signOutButtonText: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
  },
  listContent: {
    paddingVertical: 20,
    paddingBottom: 40,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  locationContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  locationText: {
    color: COLORS.muted,
    fontSize: 12,
    marginLeft: 4,
    fontFamily: 'monospace',
  },
  locationSeparator: {
    color: COLORS.muted,
    marginHorizontal: 6,
  },
  dateText: {
    color: COLORS.muted,
    fontSize: 12,
  },
  messageText: {
    color: COLORS.text,
    fontSize: 16,
    lineHeight: 24,
    marginVertical: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
    gap: 8,
  },
  reactionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(148, 163, 184, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
  },
  reactionButtonActive: {
    backgroundColor: 'rgba(99, 102, 241, 0.15)',
  },
  reactionText: {
    color: COLORS.muted,
    fontWeight: '600',
    fontSize: 12,
  },
  reactionTextActive: {
    color: COLORS.success,
  },
  upvoteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  upvoteText: {
    color: COLORS.accent,
    fontWeight: '600',
    marginLeft: 6,
  },
  inputWrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    padding: 16,
  },
  webInputWrapper: {
    position: 'fixed',
  },
  locationStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  locationStatusTextWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  locationStatusText: {
    color: COLORS.muted,
    fontSize: 12,
    marginLeft: 6,
    fontFamily: 'monospace',
  },
  locationStatusErrorText: {
    color: '#F59E0B',
  },
  refreshLocationButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(99, 102, 241, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: COLORS.card,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  input: {
    flex: 1,
    color: COLORS.text,
    fontSize: 16,
    paddingVertical: 8,
    maxHeight: 100,
  },
  sendButton: {
    backgroundColor: COLORS.accent,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 60,
  },
  emptyText: {
    color: COLORS.muted,
    marginTop: 12,
    fontSize: 16,
  },
});
