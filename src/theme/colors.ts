/**
 * Tadayomu design system — color tokens.
 * Inspired by traditional Japanese aesthetics (和風).
 */

export const Colors = {
    // ── Brand ──
    primary: '#994200',        // テラコッタ (Deep terracotta)
    primaryLight: '#C46D2D',
    primaryDark: '#662B00',
    onPrimary: '#FFFFFF',
    accent: '#C2956B',         // 丁子色 (warm gold/amber)
    accentLight: '#D4B896',

    // ── Backgrounds ──
    background: {
        light: '#FFF8EF',        // 生成り色 (Washi cream)
        dark: '#1E1B13',         // 深い墨色 (Deep ink black)
        sepia: '#F5E6C8',        // セピア
    },

    // ── Surfaces ──
    surface: {
        light: '#FFF8EF',
        dark: '#1E1B13',
        sepia: '#F5E6C8',
    },
    surfaceContainerLow: {
        light: '#FDF1E3',
        dark: '#26221A',
        sepia: '#EFDBC2',
    },
    surfaceContainer: {
        light: '#F8E7D5',
        dark: '#2F2B21',
        sepia: '#EAD1B1',
    },
    surfaceContainerHigh: {
        light: '#F2DCBA',
        dark: '#38332A',
        sepia: '#E3C8A1',
    },
    surfaceContainerHighest: {
        light: '#EBCE9E',
        dark: '#413C32',
        sepia: '#DDBFA0',
    },
    surfaceAlt: {
        light: '#FDF1E3',
        dark: '#26221A',
        sepia: '#EFDBC2',
    },

    // ── Text ──
    text: {
        light: {
            primary: '#1E1B13',
            secondary: '#5E5A53',
            disabled: '#A19C94',
        },
        dark: {
            primary: '#F0EBE1',
            secondary: '#B5B1A8',
            disabled: '#7A7771',
        },
        sepia: {
            primary: '#3E2F1C',
            secondary: '#6B5A42',
            disabled: '#A69279',
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
    tabActive: '#994200',
    tabInactive: {
        light: '#A19C94',
        dark: '#7A7771',
        sepia: '#A69279',
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

/** Typography scale — uses Noto Serif JP and Plus Jakarta Sans */
export const Typography = {
    displaySmall: {
        fontSize: 28,
        fontFamily: 'NotoSerifJP_700Bold',
        letterSpacing: 0.3,
    },
    title: {
        fontSize: 22,
        fontFamily: 'NotoSerifJP_700Bold',
        letterSpacing: 0.5,
    },
    subtitle: {
        fontSize: 16,
        fontFamily: 'NotoSerifJP_600SemiBold', // Fallback if SemiBold not exactly available, usually 600 or 700
        letterSpacing: 0.3,
    },
    body: {
        fontSize: 14,
        fontFamily: 'NotoSerifJP_400Regular',
        letterSpacing: 0.2,
    },
    bodyLg: {
        fontSize: 16,
        fontFamily: 'NotoSerifJP_400Regular',
        lineHeight: 28,
        letterSpacing: 0.2,
    },
    uiLabel: {
        fontSize: 14,
        fontFamily: 'PlusJakartaSans_600SemiBold',
        letterSpacing: 0.1,
    },
    caption: {
        fontSize: 12,
        fontFamily: 'PlusJakartaSans_400Regular',
        letterSpacing: 0.1,
    },
} as const;
