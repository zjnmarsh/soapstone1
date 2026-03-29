import React, { useState, useEffect } from 'react';
import { 
  StyleSheet, 
  Text, 
  View, 
  TextInput, 
  TouchableOpacity, 
  FlatList, 
  ActivityIndicator, 
  KeyboardAvoidingView, 
  Platform, 
  SafeAreaView, 
  StatusBar 
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getSoapstones, addSoapstone, upvoteSoapstone } from './firebase';

const COLORS = {
  background: '#0F172A', // Slate 900
  card: '#1E293B',       // Slate 800
  text: '#F8FAFC',       // Slate 50
  muted: '#94A3B8',      // Slate 400
  accent: '#6366F1',     // Indigo 500
  success: '#10B981',    // Emerald 500
  border: '#334155',     // Slate 700
};

const Header = () => (
  <View style={styles.header}>
    <MaterialCommunityIcons name="mountain" size={28} color={COLORS.accent} />
    <Text style={styles.headerTitle}>Soapstone Connect</Text>
    <View style={{ width: 28 }} />
  </View>
);

const SoapstoneCard = ({ item }) => {
  const dateStr = item.datetime ? item.datetime.toLocaleString() : 'Just now';
  
  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={styles.locationContainer}>
          <MaterialCommunityIcons name="map-marker" size={14} color={COLORS.muted} />
          <Text style={styles.locationText}>
            {item.coordinate?.lat?.toFixed(4)}, {item.coordinate?.lng?.toFixed(4)}
          </Text>
          <MaterialCommunityIcons style={{marginLeft: 8}} name="image-filter-hdr" size={14} color={COLORS.muted} />
          <Text style={styles.locationText}>{item.elevation}m</Text>
        </View>
        <Text style={styles.dateText}>{dateStr}</Text>
      </View>
      
      <Text style={styles.messageText}>{item.message}</Text>
      
      <View style={styles.cardFooter}>
        <TouchableOpacity 
          style={styles.upvoteButton} 
          onPress={() => upvoteSoapstone(item.id)}
        >
          <MaterialCommunityIcons name="arrow-up-bold" size={20} color={COLORS.accent} />
          <Text style={styles.upvoteText}>{item.upvotes || 0}</Text>
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

  const handleSubmit = async () => {
    if (!message.trim()) return;
    
    setIsSubmitting(true);
    try {
      // Simulation of coordinate fetching or fixed for demo
      const coords = { 
        lat: 51.5074 + (Math.random() - 0.5) * 0.1, 
        lng: -0.1278 + (Math.random() - 0.5) * 0.1 
      };
      const elevation = Math.floor(Math.random() * 500);
      
      await addSoapstone(message, coords, elevation);
      setMessage('');
    } catch (error) {
      alert("Please ensure valid Firebase configuration in firebase.js");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <Header />
      
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.accent} style={{ flex: 1 }} />
        ) : (
          <FlatList
            data={soapstones}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <SoapstoneCard item={item} />}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="comment-text-multiple-outline" size={48} color={COLORS.border} />
                <Text style={styles.emptyText}>No messages yet. Be the first!</Text>
              </View>
            }
          />
        )}
      </View>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inputWrapper}
      >
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            placeholder="Place a soapstone message..."
            placeholderTextColor={COLORS.muted}
            value={message}
            onChangeText={setMessage}
            multiline
          />
          <TouchableOpacity 
            style={[styles.sendButton, !message.trim() && styles.sendButtonDisabled]} 
            onPress={handleSubmit}
            disabled={!message.trim() || isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialCommunityIcons name="send" size={24} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
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
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
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
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
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
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
    padding: 16,
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
