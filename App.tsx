import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider } from 'expo-sqlite';
import {
  useFonts,
} from 'expo-font';

import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/database/schema';
import { registerAdapter } from './src/services/siteAdapter';
import { syosetuAdapter } from './src/services/adapters/syosetuAdapter';
import { nocturneAdapter } from './src/services/adapters/nocturneAdapter';

// Register site adapters
registerAdapter(syosetuAdapter);
registerAdapter(nocturneAdapter);

function AppContent() {
  const { mode } = useTheme();
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

async function onDbInit(db: any) {
  initDatabase(db);
}

export default function App() {
  const [fontsLoaded] = useFonts({
    NotoSansJP_400Regular: require('./assets/fonts/NotoSansJP-Regular.ttf'),
    NotoSansJP_600SemiBold: require('./assets/fonts/NotoSansJP-SemiBold.ttf'),
    NotoSansJP_700Bold: require('./assets/fonts/NotoSansJP-Bold.ttf'),
  });

  if (!fontsLoaded) {
    return (
      <View style={loadingStyles.container}>
        <ActivityIndicator size="large" color="#2D5F4F" />
      </View>
    );
  }

  return (
    <ThemeProvider>
      <SQLiteProvider databaseName="tadayomu.db" onInit={onDbInit}>
        <AppContent />
      </SQLiteProvider>
    </ThemeProvider>
  );
}

const loadingStyles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF7F2',
  },
});
