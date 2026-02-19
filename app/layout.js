import "./globals.css";
import Sidebar from "./components/Sidebar";

import ThemeProvider from "./components/ThemeProvider";

export const metadata = {
    title: "Books Log",
    description: "Tauri + Next.js App",
};

export default function RootLayout({ children }) {
    return (
        <html lang="ar" dir="rtl" suppressHydrationWarning>
            <head>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
                <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Arabic:wght@100..900&display=swap" rel="stylesheet" />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
                            (function() {
                                try {
                                    var storedTheme = localStorage.getItem('theme');
                                    var supportDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches === true;
                                    if (storedTheme === 'dark' || (!storedTheme && supportDarkMode)) {
                                        document.documentElement.classList.add('dark');
                                    } else {
                                        document.documentElement.classList.remove('dark');
                                    }
                                } catch (e) {}
                            })();
                        `,
                    }}
                />
            </head>
            <body className="flex h-screen overflow-hidden bg-background text-foreground font-sans antialiased">
                <ThemeProvider>
                    <script dangerouslySetInnerHTML={{
                        __html: `
                        window.onerror = function(msg, url, line, col, error) {
                            alert("JS Error: " + msg + "\\nAt: " + url + ":" + line);
                            return false;
                        };
                        window.addEventListener('unhandledrejection', function(event) {
                            alert("Promise Rejection: " + event.reason);
                        });
                    ` }} />
                    <Sidebar />
                    <main className="flex-1 overflow-auto px-6 md:px-8 pt-6 md:pt-8 pb-3 relative">
                        {children}
                    </main>
                </ThemeProvider>
            </body>
        </html>
    );
}