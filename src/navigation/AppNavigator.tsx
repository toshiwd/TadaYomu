import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../theme/ThemeContext';
import { Colors } from '../theme/colors';
import type { RootStackParamList, MainTabParamList } from './types';

import LibraryScreen from '../screens/LibraryScreen';
import UpdatesScreen from '../screens/UpdatesScreen';
import SearchScreen from '../screens/SearchScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ReaderScreen from '../screens/ReaderScreen';
import AddNovelScreen from '../screens/AddNovelScreen';
import NovelDetailScreen from '../screens/NovelDetailScreen';
import SiteBrowserScreen from '../screens/SiteBrowserScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();

/** Tab icon mapping */
const TAB_ICONS: Record<keyof MainTabParamList, { focused: string; unfocused: string }> = {
    Library: { focused: 'library', unfocused: 'library-outline' },
    Updates: { focused: 'refresh-circle', unfocused: 'refresh-circle-outline' },
    Search: { focused: 'add-circle', unfocused: 'add-circle-outline' },
    Settings: { focused: 'settings', unfocused: 'settings-outline' },
};

/** Tab label mapping (Japanese) */
const TAB_LABELS: Record<keyof MainTabParamList, string> = {
    Library: '書庫',
    Updates: '更新',
    Search: '追加',
    Settings: '設定',
};

function MainTabs() {
    const { colors } = useTheme();

    return (
        <Tab.Navigator
            screenOptions={({ route }) => ({
                headerShown: false,
                tabBarIcon: ({ focused, color, size }) => {
                    const icons = TAB_ICONS[route.name];
                    const iconName = focused ? icons.focused : icons.unfocused;
                    return <Ionicons name={iconName as any} size={size} color={color} />;
                },
                tabBarLabel: TAB_LABELS[route.name],
                tabBarActiveTintColor: Colors.tabActive,
                tabBarInactiveTintColor: colors.tabInactive,
                tabBarStyle: {
                    backgroundColor: colors.tabBar,
                    borderTopColor: colors.border,
                    borderTopWidth: 0.5,
                    paddingTop: 4,
                    height: 56,
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                    marginBottom: 4,
                },
            })}
        >
            <Tab.Screen name="Library" component={LibraryScreen} />
            <Tab.Screen name="Updates" component={UpdatesScreen} />
            <Tab.Screen name="Search" component={SearchScreen} />
            <Tab.Screen name="Settings" component={SettingsScreen} />
        </Tab.Navigator>
    );
}

export default function AppNavigator() {
    const { colors } = useTheme();

    return (
        <NavigationContainer>
            <Stack.Navigator
                screenOptions={{
                    headerShown: false,
                    contentStyle: { backgroundColor: colors.background },
                    animation: 'slide_from_right',
                }}
            >
                <Stack.Screen name="Main" component={MainTabs} />
                <Stack.Screen
                    name="Reader"
                    component={ReaderScreen}
                    options={{ animation: 'slide_from_bottom' }}
                />
                <Stack.Screen
                    name="NovelDetail"
                    component={NovelDetailScreen}
                    options={{
                        headerShown: true,
                        headerTitle: '小説詳細',
                        headerStyle: { backgroundColor: colors.background },
                        headerTintColor: colors.text.primary,
                    }}
                />
                <Stack.Screen
                    name="AddNovel"
                    component={AddNovelScreen}
                    options={{
                        headerShown: true,
                        headerTitle: '小説を追加',
                        headerStyle: { backgroundColor: colors.background },
                        headerTintColor: colors.text.primary,
                    }}
                />
                <Stack.Screen
                    name="SiteBrowser"
                    component={SiteBrowserScreen}
                    options={({ route }) => ({
                        headerShown: false,
                    })}
                />
            </Stack.Navigator>
        </NavigationContainer>
    );
}
