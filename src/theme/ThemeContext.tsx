import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Colors } from './colors';

export type ThemeMode = 'light' | 'dark' | 'sepia';

export interface ThemeColors {
    background: string;
    surface: string;
    surfaceAlt: string;
    surfaceContainerLow: string;
    surfaceContainer: string;
    surfaceContainerHigh: string;
    surfaceContainerHighest: string;
    text: { primary: string; secondary: string; disabled: string };
    border: string;
    divider: string;
    tabBar: string;
    tabInactive: string;
    ui: { primary: string; onPrimary: string; error: string; success: string; warning: string };
}

interface ThemeContextType {
    mode: ThemeMode;
    colors: ThemeColors;
    setMode: (mode: ThemeMode) => void;
    toggleMode: () => void;
}

function getThemeColors(mode: ThemeMode): ThemeColors {
    return {
        background: Colors.background[mode],
        surface: Colors.surface[mode],
        surfaceAlt: Colors.surfaceAlt[mode],
        surfaceContainerLow: Colors.surfaceContainerLow[mode],
        surfaceContainer: Colors.surfaceContainer[mode],
        surfaceContainerHigh: Colors.surfaceContainerHigh[mode],
        surfaceContainerHighest: Colors.surfaceContainerHighest[mode],
        text: Colors.text[mode],
        border: Colors.border[mode],
        divider: Colors.divider[mode],
        tabBar: Colors.tabBar[mode],
        tabInactive: Colors.tabInactive[mode],
        ui: {
            primary: Colors.primary,
            onPrimary: Colors.onPrimary,
            error: Colors.error,
            success: Colors.success,
            warning: Colors.warning,
        },
    };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

interface ThemeProviderProps {
    children: React.ReactNode;
    initialMode?: ThemeMode;
    onModeChange?: (mode: ThemeMode) => void;
}

export function ThemeProvider({ children, initialMode = 'light', onModeChange }: ThemeProviderProps) {
    const [mode, setModeInternal] = useState<ThemeMode>(initialMode);

    const setMode = useCallback((newMode: ThemeMode) => {
        setModeInternal(newMode);
        onModeChange?.(newMode);
    }, [onModeChange]);

    const toggleMode = useCallback(() => {
        setModeInternal((prev) => {
            const modes: ThemeMode[] = ['light', 'dark', 'sepia'];
            const idx = modes.indexOf(prev);
            const next = modes[(idx + 1) % modes.length];
            onModeChange?.(next);
            return next;
        });
    }, [onModeChange]);

    const colors = useMemo(() => getThemeColors(mode), [mode]);

    const value = useMemo(
        () => ({ mode, colors, setMode, toggleMode }),
        [mode, colors, setMode, toggleMode]
    );

    return (
        <ThemeContext.Provider value={value}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextType {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
    return ctx;
}
