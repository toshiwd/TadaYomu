import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { Colors } from './colors';

export type ThemeMode = 'light' | 'dark' | 'sepia';

export interface ThemeColors {
    background: string;
    surface: string;
    surfaceAlt: string;
    text: { primary: string; secondary: string; disabled: string };
    border: string;
    divider: string;
    tabBar: string;
    tabInactive: string;
    ui: { primary: string; error: string; success: string; warning: string };
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
        text: Colors.text[mode],
        border: Colors.border[mode],
        divider: Colors.divider[mode],
        tabBar: Colors.tabBar[mode],
        tabInactive: Colors.tabInactive[mode],
        ui: {
            primary: Colors.primary,
            error: Colors.error,
            success: Colors.success,
            warning: Colors.warning,
        },
    };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [mode, setMode] = useState<ThemeMode>('light');

    const toggleMode = useCallback(() => {
        setMode((prev) => {
            const modes: ThemeMode[] = ['light', 'dark', 'sepia'];
            const idx = modes.indexOf(prev);
            return modes[(idx + 1) % modes.length];
        });
    }, []);

    const colors = useMemo(() => getThemeColors(mode), [mode]);

    const value = useMemo(
        () => ({ mode, colors, setMode, toggleMode }),
        [mode, colors, toggleMode]
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
