/**
 * Navigation type definitions for Tadayomu.
 */
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { CompositeScreenProps, NavigatorScreenParams } from '@react-navigation/native';

/** Root stack params */
export type RootStackParamList = {
    Main: NavigatorScreenParams<MainTabParamList>;
    Reader: { novelId: number; chapterIndex?: number };
    NovelDetail: { novelId: number };
    AddNovel: { url?: string };
    SiteBrowser: { siteDomain: string; siteName: string; url?: string };
};

/** Bottom tab params */
export type MainTabParamList = {
    Library: undefined;
    Search: undefined;
    Settings: undefined;
};

/** Screen props helpers */
export type RootStackScreenProps<T extends keyof RootStackParamList> =
    NativeStackScreenProps<RootStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
    CompositeScreenProps<
        BottomTabScreenProps<MainTabParamList, T>,
        NativeStackScreenProps<RootStackParamList>
    >;
