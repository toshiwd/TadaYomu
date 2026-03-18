import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
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
import { getReaderSettings, saveReaderSettings } from "../database/repository";
import { checkForUpdates, getCurrentVersion } from "../services/updateChecker";
import { syncService } from "../services/syncService";

type ThemeColors = ReturnType<typeof useTheme>["colors"];

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

  const loadSettings = useCallback(() => {
    setSettings(getReaderSettings(db));
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
    }, [loadSettings]),
  );

  const updateSetting = <K extends keyof ReaderSettings>(
    key: K,
    value: ReaderSettings[K],
  ) => {
    if (!settings) return;
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    saveReaderSettings(db, updated);
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
      await checkForUpdates(false);
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  const themeOptions: { label: string; value: ThemeMode }[] = [
    { label: "ライト", value: "light" },
    { label: "ダーク", value: "dark" },
    { label: "セピア", value: "sepia" },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ height: insets.top + 2 }} />

      <Section title="クラウド同期" colors={colors}>
        {user ? (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <View style={styles.userRow}>
              <Ionicons
                name="person-circle-outline"
                size={34}
                color={colors.ui.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={[styles.userLabel, { color: colors.text.secondary }]}>
                  ログイン中
                </Text>
                <Text
                  style={[styles.userValue, { color: colors.text.primary }]}
                  numberOfLines={1}
                >
                  {user.displayName || user.email || "ゲスト"}
                </Text>
              </View>
            </View>

            <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
              読書中の進捗は自動で同期されます。必要に応じて状態確認ができます。
            </Text>

            <View style={styles.actionRow}>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    borderColor: colors.border,
                    backgroundColor: colors.surfaceAlt,
                  },
                ]}
                onPress={handleSync}
                disabled={syncing}
              >
                {syncing ? (
                  <ActivityIndicator size="small" color={colors.ui.primary} />
                ) : (
                  <Text style={[styles.actionBtnText, { color: colors.text.primary }]}>
                    状態確認
                  </Text>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    borderColor: colors.ui.error,
                    backgroundColor: colors.surfaceAlt,
                  },
                ]}
                onPress={handleSignOut}
              >
                <Text style={[styles.actionBtnText, { color: colors.ui.error }]}>
                  ログアウト
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View style={[styles.card, { backgroundColor: colors.surface }]}>
            <Text style={[styles.cardDescription, { color: colors.text.secondary }]}>
              Googleでログインすると読書データをクラウド保存し、複数端末で同期できます。
            </Text>
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.ui.primary }]}
              onPress={handleSignIn}
            >
              <Ionicons name="logo-google" size={18} color="#FFF" />
              <Text style={styles.primaryBtnText}>Googleでログイン</Text>
            </TouchableOpacity>
          </View>
        )}
      </Section>

      <Section title="テーマ" colors={colors}>
        <View style={styles.themeRow}>
          {themeOptions.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.themeButton,
                {
                  backgroundColor:
                    mode === opt.value ? colors.ui.primary : colors.surface,
                },
              ]}
              onPress={() => setMode(opt.value)}
              activeOpacity={0.7}
            >
              <Text
                style={{
                  color: mode === opt.value ? "#FFF" : colors.text.primary,
                  fontWeight: "700",
                  fontSize: 12,
                }}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Section>

      {settings && (
        <Section title="リーダー" colors={colors}>
          <SettingRow label="フォント" colors={colors}>
            <View style={styles.toggleRow}>
              {(["serif", "sans-serif"] as const).map((value) => {
                const selected = settings.fontFamily === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.toggleBtn,
                      {
                        backgroundColor: selected
                          ? colors.ui.primary
                          : colors.surfaceAlt,
                      },
                    ]}
                    onPress={() => updateSetting("fontFamily", value)}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        { color: selected ? "#FFF" : colors.text.primary },
                      ]}
                    >
                      {value === "serif" ? "明朝" : "ゴシック"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SettingRow>

          <SettingRow label="方向" colors={colors}>
            <View style={styles.toggleRow}>
              {(["vertical", "horizontal"] as const).map((value) => {
                const selected = settings.writingMode === value;
                return (
                  <TouchableOpacity
                    key={value}
                    style={[
                      styles.toggleBtn,
                      {
                        backgroundColor: selected
                          ? colors.ui.primary
                          : colors.surfaceAlt,
                      },
                    ]}
                    onPress={() => updateSetting("writingMode", value)}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        { color: selected ? "#FFF" : colors.text.primary },
                      ]}
                    >
                      {value === "vertical" ? "縦書き" : "横書き"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SettingRow>

          <SettingRow label="文字サイズ" colors={colors}>
            <View style={styles.sizeRow}>
              <TouchableOpacity
                onPress={() =>
                  updateSetting("fontSize", Math.max(12, settings.fontSize - 1))
                }
              >
                <Ionicons
                  name="remove-circle-outline"
                  size={22}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
              <Text style={[styles.sizeValue, { color: colors.text.primary }]}>
                {settings.fontSize}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  updateSetting("fontSize", Math.min(32, settings.fontSize + 1))
                }
              >
                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
            </View>
          </SettingRow>

          <SettingRow label="行間" colors={colors}>
            <View style={styles.sizeRow}>
              <TouchableOpacity
                onPress={() =>
                  updateSetting(
                    "lineHeight",
                    Math.max(1.2, Number((settings.lineHeight - 0.1).toFixed(1))),
                  )
                }
              >
                <Ionicons
                  name="remove-circle-outline"
                  size={22}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
              <Text style={[styles.sizeValue, { color: colors.text.primary }]}>
                {settings.lineHeight.toFixed(1)}
              </Text>
              <TouchableOpacity
                onPress={() =>
                  updateSetting(
                    "lineHeight",
                    Math.min(2.5, Number((settings.lineHeight + 0.1).toFixed(1))),
                  )
                }
              >
                <Ionicons
                  name="add-circle-outline"
                  size={22}
                  color={colors.text.primary}
                />
              </TouchableOpacity>
            </View>
          </SettingRow>

          <SettingRow label="ページ送りアニメーション" colors={colors}>
            <View style={styles.toggleRow}>
              {([true, false] as const).map((value) => {
                const selected = settings.pageTurnAnimation === value;
                return (
                  <TouchableOpacity
                    key={`animation-${String(value)}`}
                    style={[
                      styles.toggleBtn,
                      {
                        backgroundColor: selected
                          ? colors.ui.primary
                          : colors.surfaceAlt,
                      },
                    ]}
                    onPress={() => updateSetting("pageTurnAnimation", value)}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        { color: selected ? "#FFF" : colors.text.primary },
                      ]}
                    >
                      {value ? "ON" : "OFF"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SettingRow>

          <SettingRow label="全画面モード" colors={colors}>
            <View style={styles.toggleRow}>
              {([true, false] as const).map((value) => {
                const selected = settings.fullscreen === value;
                return (
                  <TouchableOpacity
                    key={`fullscreen-${String(value)}`}
                    style={[
                      styles.toggleBtn,
                      {
                        backgroundColor: selected
                          ? colors.ui.primary
                          : colors.surfaceAlt,
                      },
                    ]}
                    onPress={() => updateSetting("fullscreen", value)}
                  >
                    <Text
                      style={[
                        styles.toggleText,
                        { color: selected ? "#FFF" : colors.text.primary },
                      ]}
                    >
                      {value ? "ON" : "OFF"}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </SettingRow>
        </Section>
      )}

      <Section title="アプリ" colors={colors}>
        <TouchableOpacity
          style={[styles.appActionRow, { backgroundColor: colors.surface }]}
          onPress={handleCheckUpdate}
          disabled={isCheckingUpdate}
        >
          <Ionicons
            name="cloud-download-outline"
            size={18}
            color={colors.text.primary}
          />
          <Text style={[styles.actionLabel, { color: colors.text.primary }]}>
            {isCheckingUpdate ? "確認中..." : "アップデートを確認"}
          </Text>
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
        <View style={[styles.infoRow, { backgroundColor: colors.surface }]}>
          <Text style={[styles.infoLabel, { color: colors.text.secondary }]}>
            バージョン
          </Text>
          <Text style={[styles.infoValue, { color: colors.text.disabled }]}>
            {getCurrentVersion()}
          </Text>
        </View>
      </Section>

      <View style={{ height: 14 }} />
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
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.text.secondary }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function SettingRow({
  label,
  children,
  colors,
}: {
  label: string;
  children: React.ReactNode;
  colors: ThemeColors;
}) {
  return (
    <View style={[styles.settingRow, { backgroundColor: colors.surface }]}>
      <Text style={[styles.settingLabel, { color: colors.text.primary }]}>
        {label}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  section: {
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.md,
  },
  sectionTitle: {
    ...Typography.caption,
    fontWeight: "700",
    marginBottom: 2,
  },
  card: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    borderRadius: Radius.md,
    gap: Spacing.xs,
  },
  userRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  userLabel: {
    ...Typography.caption,
    fontSize: 11,
  },
  userValue: {
    ...Typography.body,
    fontSize: 15,
    fontWeight: "700",
  },
  cardDescription: {
    ...Typography.caption,
    lineHeight: 16,
  },
  actionRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  actionBtn: {
    flex: 1,
    minHeight: 34,
    borderWidth: 1,
    borderRadius: Radius.md,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: Radius.md,
  },
  primaryBtnText: {
    color: "#FFF",
    fontSize: 12,
    fontWeight: "700",
  },
  themeRow: {
    flexDirection: "row",
    gap: Spacing.xs,
  },
  themeButton: {
    flex: 1,
    borderRadius: Radius.md,
    alignItems: "center",
    paddingVertical: 7,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    marginBottom: 2,
  },
  settingLabel: {
    ...Typography.body,
    fontSize: 14,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 4,
  },
  toggleBtn: {
    borderRadius: Radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  toggleText: {
    fontSize: 12,
    fontWeight: "700",
  },
  sizeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
  },
  sizeValue: {
    ...Typography.body,
    minWidth: 30,
    textAlign: "center",
    fontWeight: "700",
  },
  appActionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.xs,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
    marginBottom: 2,
  },
  actionLabel: {
    ...Typography.body,
    flex: 1,
    fontSize: 13,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 7,
  },
  infoLabel: {
    ...Typography.body,
    fontSize: 13,
  },
  infoValue: {
    ...Typography.body,
    fontSize: 13,
  },
});
