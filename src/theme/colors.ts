/**
 * Tadayomu design system — color tokens.
 * Inspired by traditional Japanese aesthetics (和風).
 */

export const Colors = {
    // ── Brand ──
    primary: '#2D5F4F',        // 深緑 (Deep Green - like old book covers)
    primaryLight: '#4A8B72',
    primaryDark: '#1A3D32',
    accent: '#C2956B',         // 丁子色 (warm gold/amber)
    accentLight: '#D4B896',

    // ── Backgrounds ──
    background: {
        light: '#FAF7F2',        // 生成り色 (Off-white, like aged paper)
        dark: '#1A1A2E',         // 鉄紺 (Deep navy)
        sepia: '#F5E6C8',        // セピア
    },

    // ── Surfaces ──
    surface: {
        light: '#FFFFFF',
        dark: '#22223B',
        sepia: '#EDD9B3',
    },
    surfaceAlt: {
        light: '#F0ECE6',
        dark: '#2E2E4A',
        sepia: '#E0D1B5',
    },

    // ── Text ──
    text: {
        light: {
            primary: '#2C2C2C',
            secondary: '#6B6B6B',
            disabled: '#ABABAB',
        },
        dark: {
            primary: '#E8E8E8',
            secondary: '#9B9B9B',
            disabled: '#5A5A5A',
        },
        sepia: {
            primary: '#3E2F1C',
            secondary: '#6B5A42',
            disabled: '#9B8B72',
        },
    },

    // ── UI Elements ──
    border: {
        light: '#E0DCD6',
        dark: '#3A3A5C',
        sepia: '#D4C5A9',
    },
    divider: {
        light: '#F0ECE6',
        dark: '#2E2E4A',
        sepia: '#E0D1B5',
    },

    // ── Status ──
    success: '#4CAF50',
    warning: '#FF9800',
    error: '#E53935',
    info: '#2196F3',

    // ── Tab Bar ──
    tabBar: {
        light: '#FAF7F2',
        dark: '#16162A',
        sepia: '#EDD9B3',
    },
    tabActive: '#2D5F4F',
    tabInactive: {
        light: '#ABABAB',
        dark: '#5A5A5A',
        sepia: '#9B8B72',
    },
} as const;

/** Spacing scale (4px base) */
export const Spacing = {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
    xxl: 48,
} as const;

/** Border radius scale */
export const Radius = {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 999,
} as const;

/** Typography scale — uses Noto Sans JP loaded via expo-google-fonts */
export const Typography = {
    displaySmall: {
        fontSize: 28,
        fontFamily: 'NotoSansJP_700Bold',
        letterSpacing: 0.3,
    },
    title: {
        fontSize: 22,
        fontFamily: 'NotoSansJP_700Bold',
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 16,
        fontFamily: 'NotoSansJP_600SemiBold',
        letterSpacing: 0.3,
    },
    body: {
        fontSize: 14,
        fontFamily: 'NotoSansJP_400Regular',
        letterSpacing: 0.2,
    },
    caption: {
        fontSize: 12,
        fontFamily: 'NotoSansJP_400Regular',
        letterSpacing: 0.1,
    },
} as const;
