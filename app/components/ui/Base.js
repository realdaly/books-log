import { forwardRef } from "react";
import { cn } from "../../lib/utils";

export function Button({ className, variant = "default", size = "default", ...props }) {
    // ... (rest of Button remains same)
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center gap-x-1 whitespace-nowrap rounded-lg text-sm font-bold ring-offset-background transition-colors outline-none disabled:pointer-events-none disabled:opacity-50",
                // Variants
                variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm",
                variant === "destructive" && "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-sm",
                variant === "outline" && "border-2 border-primary text-primary bg-transparent hover:bg-primary/5",
                variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
                variant === "ghost" && "hover:bg-accent hover:text-accent-foreground",
                variant === "link" && "text-primary underline-offset-4 hover:underline",
                // Sizes
                size === "default" && "h-10 px-4 md:h-11 md:px-6 py-2",
                size === "sm" && "h-8 px-2 md:h-9 md:px-3 rounded-md",
                size === "lg" && "h-12 px-6 md:h-14 md:px-10 md:text-lg rounded-xl",
                size === "icon" && "h-9 w-9 md:h-10 md:w-10",
                className
            )}
            {...props}
        />
    );
}

export const Input = forwardRef(({ className, onFocus, ...props }, ref) => {
    return (
        <input
            ref={ref}
            onFocus={(e) => {
                e.target.select();
                if (onFocus) onFocus(e);
            }}
            className={cn(
                "flex h-10 md:h-11 w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-medium text-foreground",
                className
            )}
            {...props}
        />
    );
});
Input.displayName = "Input";

export const Textarea = forwardRef(({ className, onFocus, ...props }, ref) => {
    return (
        <textarea
            ref={ref}
            onFocus={(e) => {
                e.target.select();
                if (onFocus) onFocus(e);
            }}
            className={cn(
                "flex min-h-[80px] w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-primary focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all font-medium text-foreground",
                className
            )}
            {...props}
        />
    );
});
Textarea.displayName = "Textarea";

export function Card({ className, children }) {
    return (
        <div className={cn("rounded-2xl border bg-card text-card-foreground shadow-sm", className)}>
            {children}
        </div>
    );
}
