import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useEffect, useRef, useState } from 'react';
const MIN_WIDTH = 120;
const MIN_HEIGHT = 90;
const clamp = (value, min, max) => {
    return Math.min(Math.max(value, min), max);
};
export const SafeZoneEditor = ({ resolution, zone, onChange }) => {
    const containerRef = useRef(null);
    const [containerWidth, setContainerWidth] = useState(320);
    const activeDrag = useRef(null);
    useEffect(() => {
        const element = containerRef.current;
        if (!element)
            return;
        const updateSize = () => {
            if (element) {
                setContainerWidth(element.clientWidth || 320);
            }
        };
        updateSize();
        const observer = new ResizeObserver(() => updateSize());
        observer.observe(element);
        return () => observer.disconnect();
    }, []);
    const scale = containerWidth / resolution.width;
    const containerHeight = resolution.height * scale;
    const finishDrag = useCallback(() => {
        activeDrag.current = null;
    }, []);
    const handlePointerMove = useCallback((event) => {
        if (!activeDrag.current)
            return;
        const { handle, startX, startY, zone: initial } = activeDrag.current;
        const deltaXUnits = (event.clientX - startX) / scale;
        const deltaYUnits = (event.clientY - startY) / scale;
        let next = { ...initial };
        switch (handle) {
            case 'move': {
                next.x = clamp(initial.x + deltaXUnits, 0, resolution.width - initial.width);
                next.y = clamp(initial.y + deltaYUnits, 0, resolution.height - initial.height);
                break;
            }
            case 'resize-br': {
                next.width = clamp(initial.width + deltaXUnits, MIN_WIDTH, resolution.width - initial.x);
                next.height = clamp(initial.height + deltaYUnits, MIN_HEIGHT, resolution.height - initial.y);
                break;
            }
            case 'resize-tr': {
                next.width = clamp(initial.width + deltaXUnits, MIN_WIDTH, resolution.width - initial.x);
                const newY = clamp(initial.y + deltaYUnits, 0, initial.y + initial.height - MIN_HEIGHT);
                next.height = initial.height + (initial.y - newY);
                next.y = newY;
                break;
            }
            case 'resize-bl': {
                const newX = clamp(initial.x + deltaXUnits, 0, initial.x + initial.width - MIN_WIDTH);
                next.width = initial.width + (initial.x - newX);
                next.x = newX;
                next.height = clamp(initial.height + deltaYUnits, MIN_HEIGHT, resolution.height - initial.y);
                break;
            }
            case 'resize-tl': {
                const newX = clamp(initial.x + deltaXUnits, 0, initial.x + initial.width - MIN_WIDTH);
                const newY = clamp(initial.y + deltaYUnits, 0, initial.y + initial.height - MIN_HEIGHT);
                next.width = initial.width + (initial.x - newX);
                next.height = initial.height + (initial.y - newY);
                next.x = newX;
                next.y = newY;
                break;
            }
            default:
                break;
        }
        onChange({
            x: Math.round(next.x),
            y: Math.round(next.y),
            width: Math.round(next.width),
            height: Math.round(next.height),
        });
    }, [onChange, resolution.height, resolution.width, scale]);
    const startDrag = (handle) => (event) => {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget?.setPointerCapture(event.pointerId);
        activeDrag.current = {
            handle,
            startX: event.clientX,
            startY: event.clientY,
            zone,
            target: event.currentTarget,
        };
    };
    useEffect(() => {
        const move = (event) => {
            if (!activeDrag.current)
                return;
            handlePointerMove(event);
        };
        const up = (event) => {
            if (!activeDrag.current)
                return;
            const target = activeDrag.current.target;
            try {
                target?.releasePointerCapture(event.pointerId);
            }
            catch (error) {
                // ignore
            }
            finishDrag();
        };
        window.addEventListener('pointermove', move);
        window.addEventListener('pointerup', up);
        return () => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
        };
    }, [finishDrag, handlePointerMove]);
    return (_jsxs("div", { className: "space-y-3", children: [_jsxs("div", { ref: containerRef, className: "relative w-full max-w-md rounded-lg border border-white/10 bg-slate-900/60", style: {
                    aspectRatio: `${resolution.width} / ${resolution.height}`,
                    minHeight: containerHeight,
                    touchAction: 'none',
                }, children: [_jsx("div", { className: "absolute inset-0 bg-[radial-gradient(circle,_rgba(148,163,184,0.2)_1px,_transparent_1px)] [background-size:16px_16px]" }), _jsx("div", { className: "absolute cursor-move select-none rounded-lg border-2 border-emerald-400/80 bg-emerald-400/10 shadow-lg shadow-emerald-900/30 transition", style: {
                            left: zone.x * scale,
                            top: zone.y * scale,
                            width: Math.max(zone.width * scale, MIN_WIDTH * scale * 0.5),
                            height: Math.max(zone.height * scale, MIN_HEIGHT * scale * 0.5),
                        }, onPointerDown: startDrag('move'), children: ['tl', 'tr', 'bl', 'br'].map((corner) => (_jsx("span", { onPointerDown: startDrag(`resize-${corner}`), className: "absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full border border-white bg-emerald-300", style: {
                                left: corner.includes('l') ? 0 : '100%',
                                top: corner.includes('t') ? 0 : '100%',
                            } }, corner))) })] }), _jsxs("div", { className: "text-xs text-slate-400", children: ["Position: (", Math.round(zone.x), ", ", Math.round(zone.y), ") px \u2014 Size:", ' ', Math.round(zone.width), " \u00D7 ", Math.round(zone.height), " px"] })] }));
};
