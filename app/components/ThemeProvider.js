"use client";

import { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext({
    theme: "light",
    toggleTheme: () => { },
});

export const useTheme = () => useContext(ThemeContext);

export default function ThemeProvider({ children }) {
    const [theme, setTheme] = useState("light");
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        // 1. Check local storage
        const storedTheme = localStorage.getItem("theme");
        if (storedTheme) {
            setTheme(storedTheme);
            if (storedTheme === "dark") {
                document.documentElement.classList.add("dark");
            } else {
                document.documentElement.classList.remove("dark");
            }
        } else {
            // 2. Check system preference
            if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
                setTheme("dark");
                document.documentElement.classList.add("dark");
            }
        }
        setMounted(true);
    }, []);

    const toggleTheme = () => {
        const newTheme = theme === "light" ? "dark" : "light";
        setTheme(newTheme);
        localStorage.setItem("theme", newTheme);

        if (newTheme === "dark") {
            document.documentElement.classList.add("dark");
        } else {
            document.documentElement.classList.remove("dark");
        }
    };

    // Avoid hydration mismatch by rendering passed children only after mount (or just render children but accept initial flicker, 
    // but better to render to avoid layout shift. However, for theme, we might just pass through).
    // Actually, to avoid hydration errors with attributes on html, we usually do this effect.
    // Since we are applying class to <html>, this component just renders children + context.

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}
