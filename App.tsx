import React, { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import {
  useFonts,
} from 'expo-font';

import { ThemeProvider, useTheme } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/database/schema';
import { registerAdapter } from './src/services/siteAdapter';
import { syosetuAdapter } from './src/services/adapters/syosetuAdapter';
import { nocturneAdapter } from './src/services/adapters/nocturneAdapter';
import { registerBackgroundTask } from './src/services/backgroundTask';
import auth from '@react-native-firebase/auth';
import { syncService } from './src/services/syncService';
import { getAllNovels, getReadingProgress, upsertReadingProgress } from './src/database/repository';

// Register site adapters
registerAdapter(syosetuAdapter);
registerAdapter(nocturneAdapter);

function AppContent() {
  const { mode } = useTheme();
  const db = useSQLiteContext();

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged(async (user) => {
      if (user) {
        console.log('[Sync] User signed in. Syncing progress...');
        try {
          const novels = getAllNovels(db);
          const cloudMap = await syncService.downloadAllProgress();
          const localAhead: Parameters<typeof syncService.uploadProgressBatch>[0] = [];

          for (const novel of novels) {
            const key = `${novel.siteType}_${novel.siteNovelId}`;
            const cloudProgress = cloudMap[key];
            const localProgress = getReadingProgress(db, novel.id);
            const localChapter = localProgress ? localProgress.currentChapter : 0;
            const cloudChapter = cloudProgress ? cloudProgress.currentChapter : 0;

            if (cloudProgress && cloudChapter > localChapter) {
              // Cloud is ahead
              upsertReadingProgress(
                db,
                novel.id,
                cloudProgress.currentChapter,
                cloudProgress.scrollPercentage || 0,
              );
            } else if (localProgress && localChapter > cloudChapter) {
              // Local is ahead, upload in batch
              localAhead.push(localProgress);
            }
          }

          if (localAhead.length > 0) {
            await syncService.uploadProgressBatch(localAhead);
          }
          console.log('[Sync] Initial progress sync complete.');
        } catch (err) {
          console.error('[Sync] Error syncing on login: ', err);
        }
      }
    });
    return unsubscribe;
  }, [db]);

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

  useEffect(() => {
    registerBackgroundTask();
  }, []);

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
