import React, { useCallback, useEffect, useState } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import {
  useFonts,
} from 'expo-font';

import { ThemeProvider, useTheme, type ThemeMode } from './src/theme/ThemeContext';
import AppNavigator from './src/navigation/AppNavigator';
import { initDatabase } from './src/database/schema';
import { registerAdapter } from './src/services/siteAdapter';
import { syosetuAdapter } from './src/services/adapters/syosetuAdapter';
import { nocturneAdapter } from './src/services/adapters/nocturneAdapter';
import { registerBackgroundTask, unregisterBackgroundTask } from './src/services/backgroundTask';
import auth from '@react-native-firebase/auth';
import { syncService } from './src/services/syncService';
import {
  getAllNovels,
  getSetting,
  setSetting,
  getReadingProgress,
  upsertReadingProgress,
  isRemoteReadingProgressNewer,
} from './src/database/repository';

// Register site adapters
registerAdapter(syosetuAdapter);
registerAdapter(nocturneAdapter);

function AppContent() {
  const { mode } = useTheme();
  const db = useSQLiteContext();

  useEffect(() => {
    const backgroundEnabled = getSetting(db, 'background_enabled') !== '0';
    if (backgroundEnabled) {
      void registerBackgroundTask(db);
    } else {
      void unregisterBackgroundTask();
    }
  }, [db]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = auth().onAuthStateChanged(async (user) => {
      if (user) {
        const syncUid = user.uid;
        console.log('[Sync] User signed in. Syncing progress...');
        try {
          const novels = getAllNovels(db);
          const cloudMap = await syncService.downloadAllProgress();
          if (cancelled || auth().currentUser?.uid !== syncUid) return;
          const localAhead: Parameters<typeof syncService.uploadProgressBatch>[0] = [];

          for (const novel of novels) {
            const key = `${novel.siteType}_${novel.siteNovelId}`;
            const cloudProgress = cloudMap[key];
            const localProgress = getReadingProgress(db, novel.id);
            const localChapter = localProgress ? localProgress.currentChapter : 0;
            const cloudChapter = cloudProgress ? cloudProgress.currentChapter : 0;
            const cloudIsNewer = Boolean(
              cloudProgress &&
              (!localProgress ||
                isRemoteReadingProgressNewer(localProgress.lastReadAt, cloudProgress.lastReadAt) ||
                (cloudProgress.lastReadAt === localProgress.lastReadAt && cloudChapter > localChapter)),
            );
            const localIsNewer = Boolean(
              localProgress &&
              (!cloudProgress ||
                isRemoteReadingProgressNewer(cloudProgress.lastReadAt, localProgress.lastReadAt) ||
                (cloudProgress.lastReadAt === localProgress.lastReadAt && localChapter > cloudChapter)),
            );

            if (cloudProgress && cloudIsNewer) {
              // Cloud is ahead
              upsertReadingProgress(
                db,
                novel.id,
                cloudProgress.currentChapter,
                cloudProgress.scrollPercentage || 0,
              );
            } else if (localProgress && localIsNewer) {
              // Local is ahead, upload in batch
              localAhead.push(localProgress);
            }
          }

          if (localAhead.length > 0) {
            await syncService.uploadProgressBatch(localAhead);
          }
          if (cancelled || auth().currentUser?.uid !== syncUid) return;
          console.log('[Sync] Initial progress sync complete.');
        } catch (err) {
          console.error('[Sync] Error syncing on login: ', err);
        }
      }
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [db]);

  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <AppNavigator />
    </>
  );
}

/** Wrapper that loads theme from DB and provides persistence */
function ThemedApp() {
  const db = useSQLiteContext();

  const [initialMode] = useState<ThemeMode>(() => {
    const saved = getSetting(db, 'theme_mode');
    if (saved === 'light' || saved === 'dark' || saved === 'sepia') return saved;
    return 'light';
  });

  const handleModeChange = useCallback((newMode: ThemeMode) => {
    setSetting(db, 'theme_mode', newMode);
  }, [db]);

  return (
    <ThemeProvider initialMode={initialMode} onModeChange={handleModeChange}>
      <AppContent />
    </ThemeProvider>
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
    <SQLiteProvider databaseName="tadayomu.db" onInit={onDbInit}>
      <ThemedApp />
    </SQLiteProvider>
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
