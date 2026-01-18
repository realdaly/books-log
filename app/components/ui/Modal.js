"use client";
import { useState, useEffect } from "react";
import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { X } from "lucide-react";
import { Button } from "./Base";

export function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }) {
    const [canClose, setCanClose] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setCanClose(false);
            const timer = setTimeout(() => {
                setCanClose(true);
                // Auto-focus first input/select/textarea
                const firstInput = document.querySelector('[role="dialog"] input:not([type="hidden"]), [role="dialog"] select, [role="dialog"] textarea');
                if (firstInput) {
                    firstInput.focus();
                }
            }, 100);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleBackdropClose = () => {
        if (canClose) {
            onClose();
        }
    };

    return (
        <Dialog
            open={isOpen}
            onClose={handleBackdropClose}
            className="relative z-[100]"
            transition
        >
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/60 backdrop-blur-sm transition duration-300 ease-out data-[closed]:opacity-0"
                aria-hidden="true"
            />

            {/* Scroll Container */}
            <div className="fixed inset-0 flex w-screen items-center justify-center p-4">
                {/* Panel */}
                <DialogPanel
                    className={`w-full ${maxWidth} transform rounded-2xl bg-white p-0 text-right shadow-2xl border border-border transition duration-300 ease-out data-[closed]:scale-95 data-[closed]:opacity-0 max-h-[90vh] flex flex-col`}
                    dir="rtl"
                >
                    <div className="flex justify-between items-center p-6 border-b bg-muted/20 shrink-0">
                        <DialogTitle
                            as="h3"
                            className="text-xl font-bold text-foreground leading-6"
                        >
                            {title}
                        </DialogTitle>
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={onClose}
                            className="rounded-full h-8 w-8 hover:bg-black/5"
                        >
                            <X size={18} />
                        </Button>
                    </div>
                    <div className="p-6 overflow-y-auto custom-scrollbar">
                        {children}
                    </div>
                </DialogPanel>
            </div>
        </Dialog>
    );
}
