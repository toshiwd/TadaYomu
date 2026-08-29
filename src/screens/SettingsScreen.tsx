import React, { useCallback, useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  PanResponder,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSQLiteContext } from "expo-sqlite";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import auth, { type FirebaseAuthTypes } from "@react-native-firebase/auth";

import { useTheme, type ThemeMode } from "../theme/ThemeContext";
import { Radius, Spacing, Typography } from "../theme/colors";
import type { MainTabScreenProps } from "../navigation/types";
import type { ReaderSettings } from "../types/novel";
import { getReaderSettings, saveReaderSettings, getSetting } from "../database/repository";
import {
  checkForUpdates,
  getCurrentVersion,
  type UpdateProgress,
} from "../services/updateChecker";
import { syncService } from "../services/syncService";
import {
  getBackgroundTaskDiagnostics,
  runBackgroundUpdateNow,
  toggleBackgroundTask,
  type BackgroundTaskDiagnostics,
} from "../services/backgroundTask";
import { calculateSliderValue } from "../services/runtimeGuards";
import {
  DOWNLOADED_FONT_PREFIX,
  OPTIONAL_READER_FONT_ID,
  deleteFontFamily,
  downloadFontFamily,
  getOptionalReaderFont,
  isInstalledFontFamily,
} from "../services/fontManager";

type ThemeColors = ReturnType<typeof useTheme>["colors"];

/**
 * Custom Slider implementing Warm Editorialism aesthetics
 * Replaces clinical standard UI with a physical, wood-shelf-like slider
 */
function CustomSlider({
  value,
  min,
  max,
  step,
  leftLabel,
  rightLabel,
  currentValueLabel,
  onSlidingComplete,
  colors,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  leftLabel: string;
  rightLabel: string;
  currentValueLabel: string;
  onSlidingComplete: (val: number) => void;
  colors: ThemeColors;
}) {
  const [localValue, setLocalValue] = useState(value);
  const localValueRef = useRef(value);
  const widthRef = useRef(0);
  const startValueRef = useRef(value);
  const onSlidingCompleteRef = useRef(onSlidingComplete);

  useEffect(() => {
    localValueRef.current = value;
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    onSlidingCompleteRef.current = onSlidingComplete;
  }, [onSlidingComplete]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startValueRef.current = localValueRef.current;
      },
      onPanResponderMove: (_, gestureState) => {
        const newValue = calculateSliderValue(
          startValueRef.current,
          gestureState.dx,
          widthRef.current,
          min,
          max,
          step,
        );
        localValueRef.current = newValue;
        setLocalValue(newValue);
      },
      onPanResponderRelease: () => {
        onSlidingCompleteRef.current(localValueRef.current);
      },
    })
  ).current;

  const percentage = Math.max(0, Math.min(100, ((localValue - min) / (max - min)) * 100));

  return (
    <View style={sliderStyles.container}>
      <View style={sliderStyles.headerRow}>
        <Text style={[sliderStyles.label, { color: colors.text.primary }]}>{currentValueLabel}</Text>
      </View>
      <View
        style={sliderStyles.trackContainer}
        onLayout={(e) => {
          widthRef.current = e.nativeEvent.layout.width;
        }}
        {...panResponder.panHandlers}
      >
        {/* Track */}
        <View style={[sliderStyles.track, { backgroundColor: colors.surfaceContainerHighest }]} />
        {/* Active Track (optional, omitted to match pure wood aesthetic, but we add a thumb) */}
        {/* Thumb */}
        <View
          style={[
            sliderStyles.thumb,
            { backgroundColor: colors.ui.primary, left: `${percentage}%` }
          ]}
        />
      </View>
      <View style={sliderStyles.footerRow}>
        <Text style={[sliderStyles.footerText, { color: colors.text.disabled }]}>{leftLabel}</Text>
        <Text style={[sliderStyles.footerText, { color: colors.text.disabled }]}>{rightLabel}</Text>
      </View>
    </View>
  );
}

const sliderStyles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: Spacing.sm,
  },
  label: {
    ...Typography.body,
    fontWeight: '700',
  },
  trackContainer: {
    height: 24,
    justifyContent: 'center',
    marginHorizontal: 8,
  },
  track: {
    height: 6,
    borderRadius: Radius.full,
  },
  thumb: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderRadius: Radius.full,
    marginLeft: -8,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
  },
  footerText: {
    ...Typography.caption,
  },
});

export default function SettingsScreen(
  _props: MainTabScreenProps<"Settings">,
) {
  const { mode, colors, setMode } = useTheme();
  const insets = useSafeAreaInsets();
  const db = useSQLiteContext();

  const [settings, setSettings] = useState<ReaderSettings | null>(null);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<UpdateProgress>({ phase: "idle" });
  const [bgEnabled, setBgEnabled] = useState(true);
  const [isTogglingBackground, setIsTogglingBackground] = useState(false);
  const [isTestingBackground, setIsTestingBackground] = useState(false);
  const [backgroundDiagnostics, setBackgroundDiagnostics] =
    useState<BackgroundTaskDiagnostics | null>(null);
  const [optionalFontInstalled, setOptionalFontInstalled] = useState(false);
  const [isDownloadingFont, setIsDownloadingFont] = useState(false);

  const optionalFont = getOptionalReaderFont(OPTIONAL_READER_FONT_ID);

  const loadSettings = useCallback(() => {
    setSettings(getReaderSettings(db));
    const bgSetting = getSetting(db, 'background_enabled');
    setBgEnabled(bgSetting !== '0'); // default ON
  }, [db]);

  const refreshOptionalFont = useCallback(() => {
    const fontFamily = `${DOWNLOADED_FONT_PREFIX}${OPTIONAL_READER_FONT_ID}`;
    const installed = isInstalledFontFamily(fontFamily);
    setOptionalFontInstalled(installed);
    const currentSettings = getReaderSettings(db);
    if (currentSettings.fontFamily === fontFamily && !installed) {
      const repaired = { ...currentSettings, fontFamily: "serif" as const };
      saveReaderSettings(db, repaired);
      setSettings(repaired);
    }
  }, [db]);

  useEffect(() => {
    const unsubscribe = auth().onAuthStateChanged((u) => {
      setUser(u);
    });
    return unsubscribe;
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadSettings();
      refreshOptionalFont();
      let active = true;
      void getBackgroundTaskDiagnostics(db)
        .then((diagnostics) => {
          if (active) setBackgroundDiagnostics(diagnostics);
        })
        .catch((error) => {
          console.warn("Failed to read background task diagnostics", error);
        });
      return () => {
        active = false;
      };
    }, [db, loadSettings, refreshOptionalFont]),
  );

  const refreshBackgroundDiagnostics = useCallback(async () => {
    setBackgroundDiagnostics(await getBackgroundTaskDiagnostics(db));
  }, [db]);

  const updateSetting = <K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K],
  ) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveReaderSettings(db, updated);
  };

  const handleDownloadOptionalFont = async () => {
    if (!optionalFont || isDownloadingFont) return;
    setIsDownloadingFont(true);
    try {
      await downloadFontFamily(optionalFont.id);
      setOptionalFontInstalled(true);
      updateSetting("fontFamily", `${DOWNLOADED_FONT_PREFIX}${optionalFont.id}`);
      Alert.alert("フォントを追加しました", "読書画面で明朝フォントを使用します。");
    } catch (error) {
      console.error("[Font] Failed to download optional reader font", error);
      Alert.alert("フォントを追加できませんでした", "通信状態を確認して、もう一度お試しください。");
    } finally {
      setIsDownloadingFont(false);
    }
  };

  const handleDeleteOptionalFont = () => {
    if (!optionalFont || isDownloadingFont) return;
    if (settings?.fontFamily === `${DOWNLOADED_FONT_PREFIX}${optionalFont.id}`) {
      updateSetting("fontFamily", "serif");
    }
    deleteFontFamily(optionalFont.id);
    setOptionalFontInstalled(false);
  };

  const handleSignIn = async () => {
    try {
      await syncService.signIn();
    } catch (e: any) {
      const code = e?.code || "unknown";
      const message = e?.message || "ログインに失敗しました";
      Alert.alert("ログイン失敗", `[${code}] ${message}`);
    }
  };

  const handleSignOut = async () => {
    try {
      await syncService.signOut();
    } catch (e: any) {
      Alert.alert("ログアウト失敗", e?.message || "ログアウトに失敗しました");
    }
  };

  const handleSync = async () => {
    if (!user) return;
    setSyncing(true);
    try {
      const allProgress = await syncService.downloadAllProgress();
      const count = Object.keys(allProgress).length;
      Alert.alert("同期状態", `クラウドに${count}件の進捗があります。`);
    } catch (e: any) {
      Alert.alert("同期失敗", e?.message || "同期状態の取得に失敗しました");
    } finally {
      setSyncing(false);
    }
  };

  const handleCheckUpdate = async () => {
    if (isCheckingUpdate) return;
    setIsCheckingUpdate(true);
    try {
      await checkForUpdates(false, setUpdateProgress);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const handleBackgroundToggle = async (enabled: boolean) => {
    if (enabled === bgEnabled || isTogglingBackground) return;

    const previous = bgEnabled;
    setBgEnabled(enabled);
    setIsTogglingBackground(true);

    try {
      const changed = await toggleBackgroundTask(db, enabled);
      if (!changed) {
        setBgEnabled(previous);
        Alert.alert(
          "自動更新の変更に失敗",
          "バックグラウンド処理の設定を変更できませんでした。",
        );
      } else {
        await refreshBackgroundDiagnostics();
      }
    } catch (e: any) {
      setBgEnabled(previous);
      Alert.alert(
        "自動更新の変更に失敗",
        e?.message || "バックグラウンド処理の設定を変更できませんでした。",
      );
    } finally {
      setIsTogglingBackground(false);
    }
  };

  const handleBackgroundTest = async () => {
    if (isTestingBackground) return;
    setIsTestingBackground(true);
    try {
      const message = await runBackgroundUpdateNow();
      await refreshBackgroundDiagnostics();
      Alert.alert("バックグラウンド更新テスト", message);
    } catch (error) {
      Alert.alert(
        "バックグラウンド更新テスト失敗",
        error instanceof Error ? error.message : "不明なエラー",
      );
    } finally {
      setIsTestingBackground(false);
    }
  };

  const themeOptions: { label: string; value: ThemeMode }[] = [
    { label: "生成", value: "light" },
    { label: "琥珀", value: "sepia" },
    { label: "玄色", value: "dark" },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ height: insets.top + Spacing.lg }} />

      {/* Profile Section */}
      <View style={styles.sectionContainer}>
        {user ? (
          <View style={[styles.profileCard, { backgroundColor: colors.surfaceContainerLow }]}>
            <View style={styles.userRow}>
              <View style={[styles.avatarCircle, { backgroundColor: colors.surfaceContainerHighest }]}>
                <Ionicons name="person" size={24} color={colors.text.secondary} />
              </View>
              <View style={{ flex: 1, marginLeft: Spacing.md }}>
                <Text
                  style={[styles.userValue, { color: colors.text.primary }]}
                  numberOfLines={1}
                >
                  {user.displayName || user.email || "ログイン中"}
                </Text>
                <Text style={[styles.userLabel, { color: colors.text.secondary }]}>
                  ログイン中
                </Text>
              </View>
            </View>
            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                onPress={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.ui.primary} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: colors.text.primary }]}>状態確認</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                onPress={handleSignOut}
              >
                <Text style={[styles.actionBtnText, { color: colors.ui.error }]}>ログアウト</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.profileCard, { backgroundColor: colors.surfaceContainerLow }]}>
            <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
              ログインすると読書データをクラウド保存し、複数端末で同期できます。
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.ui.primary }]}
              onPress={handleSignIn}
            >
              <Ionicons name="logo-google" size={18} color={colors.ui.onPrimary} />
              <Text style={[styles.primaryBtnText, { color: colors.ui.onPrimary }]}>ログイン</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <Section title="テーマ設定" colors={colors}>
        <View style={styles.themeRow}>
          {themeOptions.map((opt) => {
            const isSelected = mode === opt.value;
            return (
              <TouchableOpacity
                key={opt.value}
                style={[
                  styles.themeButton,
                  isSelected ? { borderColor: colors.ui.primary, borderWidth: 2 } : { borderColor: 'transparent', borderWidth: 2 },
                  { backgroundColor: colors.surfaceContainerHigh } // or something to represent the theme box
                ]}
                onPress={() => setMode(opt.value)}
                activeOpacity={0.8}
              >
                {/* Visual representation of the theme color */}
                <View
                  style={[
                    styles.themePreviewBox,
                    { backgroundColor: opt.value === 'light' ? '#FFF8EF' : opt.value === 'sepia' ? '#F5E6C8' : '#1E1B13' }
                  ]}
                />
                <Text
                  style={{
                    color: colors.text.primary,
                    ...Typography.uiLabel,
                    marginTop: Spacing.sm,
                  }}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </Section>

      {settings && (
        <Section title="閲覧設定" colors={colors}>
          <View style={[styles.settingCard, { backgroundColor: colors.surfaceContainerLow }]}>

            <View style={styles.inlineRow}>
              <Text style={[styles.settingLabel, { color: colors.text.primary }]}>書体</Text>
              <View style={[styles.pillContainer, { backgroundColor: colors.surfaceContainerHighest }]}>
                {(["serif", "sans-serif"] as const).map((value) => {
                   const selected = settings.fontFamily === value;
                   return (
                     <TouchableOpacity
                       key={value}
                       style={[
                         styles.pillBtn,
                         selected && { backgroundColor: colors.ui.primary }
                       ]}
                       onPress={() => updateSetting("fontFamily", value)}
                     >
                       <Text style={[
                           styles.pillText,
                           { color: selected ? colors.ui.onPrimary : colors.text.primary }
                       ]}>
                         {value === "serif" ? "明朝" : "ゴシック"}
                       </Text>
                     </TouchableOpacity>
                   );
                })}
              </View>
            </View>

            {optionalFont && (
              <View style={styles.optionalFontBlock}>
                <View style={styles.optionalFontHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.settingLabel, { color: colors.text.primary }]}>
                      {optionalFont.displayName}
                    </Text>
                    <Text style={[styles.bgDescription, { color: colors.text.secondary }]}>
                      追加ダウンロード（{optionalFont.license}）
                    </Text>
                  </View>
                  <Text style={[styles.fontStatus, { color: colors.text.secondary }]}>
                    {optionalFontInstalled ? "追加済み" : "未追加"}
                  </Text>
                </View>
                <View style={styles.actionRow}>
                  {!optionalFontInstalled ? (
                    <TouchableOpacity
                      style={[styles.primaryBtn, { backgroundColor: colors.ui.primary }]}
                      onPress={handleDownloadOptionalFont}
                      disabled={isDownloadingFont}
                    >
                      {isDownloadingFont ? (
                        <ActivityIndicator size="small" color={colors.ui.onPrimary} />
                      ) : (
                        <Ionicons name="download-outline" size={18} color={colors.ui.onPrimary} />
                      )}
                      <Text style={[styles.primaryBtnText, { color: colors.ui.onPrimary }]}>追加する</Text>
                    </TouchableOpacity>
                  ) : (
                    <>
                      <TouchableOpacity
                        style={[styles.primaryBtn, { backgroundColor: colors.ui.primary }]}
                        onPress={() => updateSetting("fontFamily", `${DOWNLOADED_FONT_PREFIX}${optionalFont.id}`)}
                      >
                        <Text style={[styles.primaryBtnText, { color: colors.ui.onPrimary }]}>この明朝を使う</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.actionBtn, { backgroundColor: colors.surfaceContainerHigh }]}
                        onPress={handleDeleteOptionalFont}
                      >
                        <Text style={[styles.actionBtnText, { color: colors.ui.error }]}>削除</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            )}

            <View style={styles.inlineRow}>
              <Text style={[styles.settingLabel, { color: colors.text.primary }]}>組み方向</Text>
              <View style={[styles.pillContainer, { backgroundColor: colors.surfaceContainerHighest }]}>
                {(["horizontal", "vertical"] as const).map((value) => {
                   const selected = settings.writingMode === value;
                   return (
                     <TouchableOpacity
                       key={value}
                       style={[
                         styles.pillBtn,
                         selected && { backgroundColor: colors.ui.primary }
                       ]}
                       onPress={() => updateSetting("writingMode", value)}
                     >
                       <Text style={[
                           styles.pillText,
                           { color: selected ? colors.ui.onPrimary : colors.text.primary }
                       ]}>
                         {value === "vertical" ? "縦" : "横"}
                       </Text>
                     </TouchableOpacity>
                   );
                })}
              </View>
            </View>

          </View>

          <View style={[styles.sliderCard, { backgroundColor: colors.surfaceContainerLow }]}>
            <Text style={[styles.settingLabel, { color: colors.text.primary }]}>文字サイズ</Text>
            <CustomSlider
              value={settings.fontSize}
              min={12}
              max={32}
              step={1}
              leftLabel="極小"
              rightLabel="極大"
              currentValueLabel={`${settings.fontSize}px`}
              onSlidingComplete={(val) => updateSetting("fontSize", val)}
              colors={colors}
            />
          </View>

          <View style={[styles.sliderCard, { backgroundColor: colors.surfaceContainerLow }]}>
            <Text style={[styles.settingLabel, { color: colors.text.primary }]}>行間</Text>
            <CustomSlider
              value={settings.lineHeight}
              min={1.2}
              max={2.5}
              step={0.1}
              leftLabel="狭い"
              rightLabel="広い"
              currentValueLabel={`${settings.lineHeight.toFixed(1)}`}
              onSlidingComplete={(val) => updateSetting("lineHeight", val)}
              colors={colors}
            />
          </View>

          <View style={[styles.settingCard, { backgroundColor: colors.surfaceContainerLow }]}>
             <View style={styles.inlineRow}>
              <Text style={[styles.settingLabel, { color: colors.text.primary }]}>アニメーション</Text>
              <View style={[styles.pillContainer, { backgroundColor: colors.surfaceContainerHighest }]}>
                {([true, false] as const).map((value) => {
                   const selected = settings.pageTurnAnimation === value;
                   return (
                     <TouchableOpacity
                       key={`anim-${value}`}
                       style={[styles.pillBtn, selected && { backgroundColor: colors.ui.primary }]}
                       onPress={() => updateSetting("pageTurnAnimation", value)}
                     >
                       <Text style={[styles.pillText, { color: selected ? colors.ui.onPrimary : colors.text.primary }]}>
                         {value ? "ON" : "OFF"}
                       </Text>
                     </TouchableOpacity>
                   );
                })}
              </View>
            </View>

            <View style={styles.inlineRow}>
              <Text style={[styles.settingLabel, { color: colors.text.primary }]}>全画面モード</Text>
              <View style={[styles.pillContainer, { backgroundColor: colors.surfaceContainerHighest }]}>
                {([true, false] as const).map((value) => {
                   const selected = settings.fullscreen === value;
                   return (
                     <TouchableOpacity
                       key={`fullscreen-${value}`}
                       style={[styles.pillBtn, selected && { backgroundColor: colors.ui.primary }]}
                       onPress={() => updateSetting("fullscreen", value)}
                     >
                       <Text style={[styles.pillText, { color: selected ? colors.ui.onPrimary : colors.text.primary }]}>
                         {value ? "ON" : "OFF"}
                       </Text>
                     </TouchableOpacity>
                   );
                })}
              </View>
            </View>
          </View>

        </Section>
      )}

      <Section title="自動更新" colors={colors}>
        <View style={[styles.settingCard, { backgroundColor: colors.surfaceContainerLow }]}>
          <View style={styles.inlineRow}>
            <Text style={[styles.settingLabel, { color: colors.text.primary }]}>バックグラウンド処理</Text>
            <View style={[styles.pillContainer, { backgroundColor: colors.surfaceContainerHighest }]}>
              {([true, false] as const).map((value) => {
                const selected = bgEnabled === value;
                return (
                  <TouchableOpacity
                    key={`bg-${value}`}
                    style={[styles.pillBtn, selected && { backgroundColor: colors.ui.primary }]}
                    onPress={() => handleBackgroundToggle(value)}
                    disabled={isTogglingBackground}
                  >
                    <Text style={[styles.pillText, { color: selected ? colors.ui.onPrimary : colors.text.primary }]}>
                      {value ? "ON" : "OFF"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
          <Text style={[styles.bgDescription, { color: colors.text.secondary }]}>
            充電中・Wi-Fi接続時に作品を順番に確認し、1回につき1作品・最大5話を先読みします。
          </Text>
          <Text style={[styles.bgDescription, { color: colors.text.secondary }]}>
            登録: {backgroundDiagnostics?.registered ? "登録済み" : "未登録"}
            {"\n"}最終結果: {backgroundDiagnostics?.lastResult ?? "未実行"}
            {"\n"}最終実行: {backgroundDiagnostics?.lastFinishedAt
              ? new Date(backgroundDiagnostics.lastFinishedAt).toLocaleString("ja-JP")
              : "未実行"}
            {backgroundDiagnostics?.lastMessage
              ? `\n詳細: ${backgroundDiagnostics.lastMessage}`
              : ""}
          </Text>
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.surfaceContainerHighest }]}
            onPress={handleBackgroundTest}
            disabled={isTestingBackground || !bgEnabled}
          >
            {isTestingBackground ? (
              <ActivityIndicator size="small" color={colors.ui.primary} />
            ) : (
              <Ionicons name="pulse-outline" size={18} color={colors.text.primary} />
            )}
            <Text style={[styles.primaryBtnText, { color: colors.text.primary }]}>
              {isTestingBackground ? "テスト実行中..." : "今すぐ1作品でテスト"}
            </Text>
          </TouchableOpacity>
        </View>
      </Section>
      <Section title="アプリ" colors={colors}>
        <TouchableOpacity
          style={[styles.appActionCard, { backgroundColor: colors.surfaceContainerLow }]}
          onPress={handleCheckUpdate}
          disabled={isCheckingUpdate}
        >
          <View style={styles.appActionLeft}>
            <Ionicons
              name="cloud-download-outline"
              size={18}
              color={colors.text.primary}
            />
            <Text style={[styles.appActionText, { color: colors.text.primary }]}>
              {updateProgress.phase === "downloading"
                ? `ダウンロード中${updateProgress.progress === null ? "..." : ` ${Math.round(updateProgress.progress * 100)}%`}`
                : updateProgress.phase === "installing"
                  ? "インストーラーを開いています..."
                  : isCheckingUpdate
                    ? "確認中..."
                    : "アップデートを確認"}
            </Text>
          </View>
          {isCheckingUpdate ? (
            <ActivityIndicator size="small" color={colors.ui.primary} />
          ) : (
            <Ionicons
              name="chevron-forward"
              size={16}
              color={colors.text.disabled}
            />
          )}
        </TouchableOpacity>
        <View style={styles.footerContainer}>
          <Text style={[styles.versionText, { color: colors.text.disabled }]}>
            VERSION {getCurrentVersion()}
          </Text>
        </View>
      </Section>

      <View style={{ height: Spacing.xxl }} />
    </ScrollView>
  );
}

function Section({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: ThemeColors;
}) {
  return (
    <View style={styles.sectionContainer}>
      {title ? (
        <Text style={[styles.sectionTitle, { color: colors.text.primary }]}>
          {title}
        </Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  sectionContainer: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xl,
  },
  sectionTitle: {
    ...Typography.uiLabel,
    fontWeight: "700",
    marginBottom: Spacing.md,
    marginLeft: Spacing.sm, // Asymmetry touch
  },
  profileCard: {
    padding: Spacing.lg,
    borderRadius: Radius.lg,
    marginBottom: Spacing.sm,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: Spacing.md,
  },
  avatarCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: "center",
    alignItems: "center",
  },
  userLabel: {
    ...Typography.caption,
    marginTop: 4,
  },
  userValue: {
    ...Typography.title,
  },
  cardDescription: {
    ...Typography.body,
    marginBottom: Spacing.md,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  actionBtn: {
    flex: 1,
    borderRadius: Radius.full,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.sm,
  },
  actionBtnText: {
    ...Typography.uiLabel,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.full,
  },
  primaryBtnText: {
    ...Typography.uiLabel,
  },
  themeRow: {
    flexDirection: "row",
    gap: Spacing.md,
  },
  themeButton: {
    flex: 1,
    borderRadius: Radius.lg,
    alignItems: "center",
    padding: Spacing.sm,
  },
  themePreviewBox: {
    width: '100%',
    aspectRatio: 1.5,
    borderRadius: Radius.sm,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
  },
  settingCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.lg,
    marginBottom: Spacing.md,
  },
  optionalFontBlock: {
    gap: Spacing.sm,
    paddingTop: Spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(128, 96, 64, 0.25)",
  },
  optionalFontHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  fontStatus: {
    ...Typography.caption,
  },
  sliderCard: {
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    marginBottom: Spacing.md,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingLabel: {
    ...Typography.body,
    fontWeight: "700",
  },
  pillContainer: {
    flexDirection: "row",
    borderRadius: Radius.full,
    padding: 2,
  },
  pillBtn: {
    borderRadius: Radius.full,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  pillText: {
    ...Typography.uiLabel,
  },
  bgDescription: {
    ...Typography.caption,
    marginTop: Spacing.sm,
    lineHeight: 18,
  },
  appActionCard: {
    borderRadius: Radius.lg,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    marginBottom: Spacing.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  appActionLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  appActionText: {
    ...Typography.uiLabel,
  },
  footerContainer: {
    alignItems: "center",
    marginTop: Spacing.md,
  },
  versionText: {
    ...Typography.caption,
    marginBottom: Spacing.sm,
  },
});
