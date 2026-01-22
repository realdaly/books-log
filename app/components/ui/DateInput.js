"use client";
import React, { useRef, useState, useEffect } from "react";
import { cn } from "../../lib/utils";
import { Calendar } from "lucide-react";

export function DateInput({ value, onChange, className, required }) {
    // value is YYYY-MM-DD
    const [day, setDay] = useState("");
    const [month, setMonth] = useState("");
    const [year, setYear] = useState("");
    const dateInputRef = useRef(null);

    useEffect(() => {
        if (value && typeof value === 'string') {
            const parts = value.split("-");
            if (parts.length === 3) {
                setYear(parts[0]);
                setMonth(parts[1]);
                setDay(parts[2]);
            }
        } else if (!value) {
            setDay(""); setMonth(""); setYear("");
        }
    }, [value]);

    const updateValue = (d, m, y) => {
        if (d && m && y && y.length === 4) {
            const dateStr = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            onChange(dateStr);
        }
    };

    const handleBlur = () => {
        updateValue(day, month, year);
    };

    const handleDayChange = (e) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 2);
        if (val === "" || (parseInt(val) >= 1 && parseInt(val) <= 31)) {
            setDay(val);
        }
    };

    const handleMonthChange = (e) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 2);
        if (val === "" || (parseInt(val) >= 1 && parseInt(val) <= 12)) {
            setMonth(val);
        }
    };

    const handleYearChange = (e) => {
        const val = e.target.value.replace(/\D/g, "").slice(0, 4);
        setYear(val);
        // Immediate update if year is complete
        if (val.length === 4) {
            updateValue(day, month, val);
        }
    };

    const handleKeyDown = (e) => {
        if (e.key === "Enter") {
            // Force update on Enter before form submission
            updateValue(day, month, year);
        }
    };

    const openPicker = () => {
        if (dateInputRef.current && dateInputRef.current.showPicker) {
            dateInputRef.current.showPicker();
        } else if (dateInputRef.current) {
            dateInputRef.current.click();
        }
    };

    return (
        <div className={cn(
            "flex items-center gap-0 h-11 w-full rounded-lg border-2 border-input bg-background px-3 py-2 text-sm focus-within:border-primary transition-all font-medium text-foreground relative",
            className
        )} dir="ltr">
            <input
                type="text"
                placeholder="DD"
                value={day}
                onChange={handleDayChange}
                onKeyDown={handleKeyDown}
                onFocus={(e) => e.target.select()}
                className="w-8 border-none bg-transparent p-0 text-center focus:outline-none placeholder:text-muted-foreground/50"
                required={required}
                onBlur={handleBlur}
            />
            <span className="text-muted-foreground/50 px-1">/</span>
            <input
                type="text"
                placeholder="MM"
                value={month}
                onChange={handleMonthChange}
                onKeyDown={handleKeyDown}
                onFocus={(e) => e.target.select()}
                className="w-8 border-none bg-transparent p-0 text-center focus:outline-none placeholder:text-muted-foreground/50"
                required={required}
                onBlur={handleBlur}
            />
            <span className="text-muted-foreground/50 px-1">/</span>
            <input
                type="text"
                placeholder="YYYY"
                value={year}
                onChange={handleYearChange}
                onKeyDown={handleKeyDown}
                onFocus={(e) => e.target.select()}
                className="w-12 border-none bg-transparent p-0 text-center focus:outline-none placeholder:text-muted-foreground/50"
                required={required}
                onBlur={handleBlur}
            />

            <div className="flex-1" />

            <button
                type="button"
                onClick={openPicker}
                className="p-1 hover:bg-muted rounded-md transition-colors text-primary"
            >
                <Calendar size={18} />
            </button>

            {/* Hidden native date input for the picker */}
            <input
                type="date"
                ref={dateInputRef}
                value={value || ""}
                onChange={(e) => onChange(e.target.value)}
                className="absolute inset-0 w-full h-full opacity-0 -z-10 pointer-events-none"
                tabIndex="-1"
            />
        </div>
    );
}
