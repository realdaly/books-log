"use client";
import React, { useState, useRef, useEffect } from 'react';
import { X } from 'lucide-react';

export function ImageZoomModal({ isOpen, src, alt, onClose }) {
    const [lensProps, setLensProps] = useState({ show: false, x: 0, y: 0, bgPosX: 0, bgPosY: 0, width: 0, height: 0 });
    const imgRef = useRef(null);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        if (isOpen) {
            window.addEventListener('keydown', handleKeyDown);
            // Disable body scroll when open
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [isOpen, onClose]);

    if (!isOpen || !src) return null;

    const handleMouseMove = (e) => {
        if (!imgRef.current) return;
        const { left, top, width, height } = imgRef.current.getBoundingClientRect();

        // Cursor position relative to the image
        const x = e.clientX - left;
        const y = e.clientY - top;

        // Prevent lens from showing outside the image bounds
        if (x < 0 || y < 0 || x > width || y > height) {
            setLensProps(prev => ({ ...prev, show: false }));
            return;
        }

        // Calculate background position percentages
        const bgPosX = (x / width) * 100;
        const bgPosY = (y / height) * 100;

        setLensProps({
            show: true,
            x: e.clientX,
            y: e.clientY,
            bgPosX,
            bgPosY,
            width,
            height
        });
    };

    const handleMouseLeave = () => {
        setLensProps(prev => ({ ...prev, show: false }));
    };

    const zoomLevel = 2.5;

    return (
        <div
            className="fixed z-[99999] flex items-center justify-center bg-black/95 backdrop-blur-sm m-0 p-0"
            style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, width: '100vw', height: '100vh', margin: 0, padding: 0 }}
            onClick={onClose}
        >
            <div className="relative w-full h-full flex items-center justify-center p-4">
                <img
                    ref={imgRef}
                    src={src}
                    alt={alt || "عرض الصورة"}
                    className="max-w-full max-h-full object-contain shadow-2xl rounded-sm cursor-crosshair"
                    onClick={(e) => e.stopPropagation()}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    onMouseEnter={() => setLensProps(prev => ({ ...prev, show: true }))}
                />

                {lensProps.show && (
                    <div
                        className="fixed pointer-events-none rounded-full border-2 border-white/50 shadow-2xl z-[100000] bg-black ring-4 ring-black/30"
                        style={{
                            left: lensProps.x - 100, // center 200px lens
                            top: lensProps.y - 100,
                            width: 200,
                            height: 200,
                            backgroundImage: `url(${src})`,
                            backgroundRepeat: 'no-repeat',
                            backgroundPosition: `${lensProps.bgPosX}% ${lensProps.bgPosY}%`,
                            backgroundSize: `${lensProps.width * zoomLevel}px ${lensProps.height * zoomLevel}px`,
                            boxShadow: '0 0 30px 0 rgba(0,0,0,0.8)'
                        }}
                    />
                )}

                <button
                    className="absolute top-6 right-6 text-white bg-black/50 hover:bg-black/90 rounded-full p-3 transition-colors z-[100001]"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                >
                    <X size={24} />
                </button>
            </div>
        </div>
    );
}
