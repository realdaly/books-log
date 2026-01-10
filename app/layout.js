import "./globals.css";
import Sidebar from "./components/Sidebar";

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
            </head>
            <body className="flex h-screen overflow-hidden bg-background text-foreground font-sans antialiased">
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
                <main className="flex-1 overflow-auto p-6 md:p-8 relative bg-gray-50/50">
                    {children}
                </main>
            </body>
        </html>
    );
}