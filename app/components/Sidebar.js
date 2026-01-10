"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
    LayoutDashboard,
    Gift,
    BookOpen,
    ShoppingCart,
    Users,
    Library,
    Settings,
    Book,
    Menu,
    ChevronRight,
    ChevronLeft
} from "lucide-react";
import { cn } from "../lib/utils";
import { Button } from "./ui/Base";
import { getDb } from "../lib/db";
import { useEffect } from "react";

const navItems = [
    { name: "جرد المؤسسة", href: "/inventory", icon: LayoutDashboard },
    { name: "سجل الاهداء", href: "/gifts", icon: Gift },
    { name: "سجل الاستعارة", href: "/loans", icon: BookOpen },
    { name: "سجل البيع", href: "/sales", icon: ShoppingCart },
    { name: "الجهات", href: "/parties", icon: Users },
    { name: "الكتب", href: "/books", icon: Library },
    { name: "الاعدادات", href: "/settings", icon: Settings },
];

export default function Sidebar() {
    const pathname = usePathname();
    const [isOpen, setIsOpen] = useState(true);

    useEffect(() => {
        // Warm up the database connection early
        getDb().catch(err => {
            console.error("Sidebar warming up DB failed:", err);
            // alert("Database Initialization Failed. Please restart the app. " + err);
        });
    }, []);

    return (
        <aside
            className={cn(
                "bg-white border-l border-border flex flex-col h-full shadow-xl relative z-40 transition-all duration-500 cubic-bezier(0.4, 0, 0.2, 1)",
                isOpen ? "w-[280px]" : "w-[80px]"
            )}
        >
            <div className={cn(
                "py-6 flex items-center border-b border-border/50 transition-all duration-500",
                "justify-start px-0"
            )}>
                <div className="w-20 flex justify-center shrink-0">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setIsOpen(!isOpen)}
                        className="h-10 w-10 text-primary hover:bg-primary/5 shrink-0 rounded-lg transition-all"
                    >
                        <Menu size={24} />
                    </Button>
                </div>
            </div>

            <nav className={cn(
                "flex-1 py-6 space-y-1.5 overflow-y-auto custom-scrollbar transition-all duration-500",
                "px-0"
            )}>
                {navItems.map((item) => {
                    const Icon = item.icon;
                    // Normalize paths to handle possible trailing slashes in production build
                    const currentPath = pathname?.replace(/\/$/, "") || "";
                    const targetPath = item.href?.replace(/\/$/, "") || "";
                    const isActive = currentPath === targetPath;

                    // Force <a> for Books and Settings to ensure clean navigation in production
                    const isHardLink = item.href === "/books" || item.href === "/settings";
                    const LinkComponent = isHardLink ? "a" : Link;

                    return (
                        <LinkComponent
                            key={item.href}
                            href={item.href}
                            {...(isHardLink ? {} : { prefetch: false })}
                            className={cn(
                                "flex items-center py-3 rounded-lg transition-all duration-200 group relative overflow-hidden whitespace-nowrap text-sm font-medium",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20"
                                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                                "justify-start"
                            )}
                            title={!isOpen ? item.name : ""}
                        >
                            <div className="w-20 flex justify-center shrink-0">
                                <Icon size={20} className={cn("shrink-0 transition-colors", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
                            </div>
                            <span className={cn(
                                "relative z-10 transition-all duration-500 ease-in-out overflow-hidden font-bold",
                                isOpen ? "opacity-100 max-w-[200px] translate-x-0" : "opacity-0 max-w-0 -translate-x-4"
                            )}>
                                {item.name}
                            </span>
                        </LinkComponent>
                    );
                })}
            </nav>

            <div className={cn(
                "py-6 border-t border-border/50 bg-secondary/5 transition-all duration-500 flex",
                "justify-start px-0"
            )}>
                <div className="flex items-center overflow-hidden">
                    <div className="w-20 flex justify-center shrink-0">
                        <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                            <Book size={24} className="text-primary" />
                        </div>
                    </div>
                    <div className={cn(
                        "whitespace-nowrap transition-all duration-500 ease-in-out overflow-hidden",
                        isOpen ? "opacity-100 max-w-[200px]" : "opacity-0 max-w-0"
                    )}>
                        <h1 className="text-lg font-extrabold tracking-tight text-foreground leading-tight">Books Log</h1>
                        <p className="text-[10px] text-primary/60 font-black">نظام إدارة الكتب</p>
                    </div>
                </div>
            </div>
        </aside>
    );
}
