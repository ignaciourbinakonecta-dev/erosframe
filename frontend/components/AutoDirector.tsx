'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
    Bot, Send, Loader2, Play, Camera, Film, Settings,
    Image as ImageIcon, MessageSquare, Layers, Eye,
    ZoomIn, ZoomOut, Maximize2, Undo2, Redo2,
    GripVertical, Clock, Mic, Sparkles, ChevronDown,
    Plus, Grid3X3
} from 'lucide-react';
import { api, API_BASE } from '@/lib/api';
import { Shot } from '@/app/dashboard/studio/page';
import { cn } from '@/lib/utils';

interface AutoDirectorProps {
    shots: Shot[];
    onShotsChange: (shots: Shot[]) => void;
    tier: number;
    globalPrompt: string;
    onGlobalPromptChange: (val: string) => void;
    onGenerateAll: () => void;
    isGenerating: boolean;
    isMock?: boolean;
    onIsMockChange?: (val: boolean) => void;
}

type SidePanel = 'chat' | 'settings' | null;

export default function AutoDirector({
    shots,
    onShotsChange,
    globalPrompt,
    onGlobalPromptChange,
    onGenerateAll,
    isGenerating,
    isMock = false,
    onIsMockChange
}: AutoDirectorProps) {
    const [input, setInput] = useState('');
    const [isPlanning, setIsPlanning] = useState(false);
    const [messages, setMessages] = useState<{ role: 'ai' | 'user', text: string }[]>([
        { role: 'ai', text: '¡Hola! Soy tu Auto-Director. Describe tu idea y generaré el storyboard completo.' }
    ]);
    const [activeShotIdx, setActiveShotIdx] = useState(0);
    const [mounted, setMounted] = useState(false);
    const [activePanel, setActivePanel] = useState<SidePanel>('chat');
    const chatEndRef = useRef<HTMLDivElement>(null);

    // Canvas zoom & pan state
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const canvasRef = useRef<HTMLDivElement>(null);

    // Resizable bot card state
    const [botCardH, setBotCardH] = useState(140);
    const [botCardW, setBotCardW] = useState<number | null>(null); // null = auto (full grid width)
    const [isResizing, setIsResizing] = useState<'bottom' | 'right' | 'corner' | null>(null);
    const resizeStartRef = useRef({ x: 0, y: 0, w: 0, h: 0 });

    const BOT_MIN_H = 100;
    const BOT_MAX_H = 400;
    const BOT_MIN_W = 400;

    useEffect(() => { setMounted(true); }, []);
    useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

    const activeShot = shots[activeShotIdx];

    // Canvas grid layout: arrange shots in rows
    const CARD_W = 200;
    const CARD_H = 160;
    const GAP = 20;
    const COLS = Math.max(3, Math.ceil(Math.sqrt(Math.max(shots.length, 1))));
    const GRID_W = COLS * (CARD_W + GAP) - GAP;
    const BOT_MAX_W = GRID_W;
    const actualBotW = botCardW ?? GRID_W;
    const SHOTS_OFFSET_Y = botCardH + GAP;

    const getCardPos = (idx: number) => ({
        x: (idx % COLS) * (CARD_W + GAP),
        y: SHOTS_OFFSET_Y + Math.floor(idx / COLS) * (CARD_H + GAP),
    });

    // Resize handlers
    const handleResizeStart = (e: React.MouseEvent, edge: 'bottom' | 'right' | 'corner') => {
        e.stopPropagation();
        e.preventDefault();
        setIsResizing(edge);
        resizeStartRef.current = { x: e.clientX, y: e.clientY, w: actualBotW, h: botCardH };
    };

    useEffect(() => {
        if (!isResizing) return;
        const handleMouseMove = (e: MouseEvent) => {
            const dx = (e.clientX - resizeStartRef.current.x) / zoom;
            const dy = (e.clientY - resizeStartRef.current.y) / zoom;
            if (isResizing === 'bottom' || isResizing === 'corner') {
                setBotCardH(Math.min(BOT_MAX_H, Math.max(BOT_MIN_H, resizeStartRef.current.h + dy)));
            }
            if (isResizing === 'right' || isResizing === 'corner') {
                setBotCardW(Math.min(BOT_MAX_W, Math.max(BOT_MIN_W, resizeStartRef.current.w + dx)));
            }
        };
        const handleMouseUp = () => setIsResizing(null);
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, zoom]);

    // Fit all shots + bot card in view
    const fitToView = useCallback(() => {
        if (!canvasRef.current) return;
        const container = canvasRef.current.getBoundingClientRect();
        const totalW = GRID_W;
        const shotsH = shots.length > 0 ? Math.ceil(shots.length / COLS) * (CARD_H + GAP) - GAP : 0;
        const totalH = botCardH + GAP + shotsH;
        const scaleX = (container.width - 100) / totalW;
        const scaleY = (container.height - 100) / totalH;
        const newZoom = Math.min(scaleX, scaleY, 1.2);
        const newPanX = (container.width - totalW * newZoom) / 2;
        const newPanY = (container.height - totalH * newZoom) / 2;
        setZoom(Math.max(0.3, newZoom));
        setPan({ x: newPanX, y: newPanY });
    }, [shots.length, COLS, botCardH]);

    // Fit on mount and when shots appear
    useEffect(() => {
        fitToView();
    }, []);
    useEffect(() => {
        if (shots.length > 0) fitToView();
    }, [shots.length > 0]);

    // Mouse wheel zoom
    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.08 : 0.08;
        setZoom(z => Math.min(2, Math.max(0.2, z + delta)));
    }, []);

    // Pan handlers
    const handleCanvasMouseDown = (e: React.MouseEvent) => {
        if (e.target === canvasRef.current || (e.target as HTMLElement).classList.contains('canvas-inner')) {
            setIsPanning(true);
            setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
        }
    };
    const handleCanvasMouseMove = (e: React.MouseEvent) => {
        if (!isPanning) return;
        setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
    };
    const handleCanvasMouseUp = () => setIsPanning(false);

    if (!mounted) return null;

    const cleanShot = (s: any): Shot => {
        const validCameras = ['static', 'pan_left', 'pan_right', 'dolly_in', 'dolly_out', 'orbit', 'tilt_up', 'tilt_down', 'crane'];
        const validLighting = ['natural', 'warm_golden', 'cold_blue', 'dramatic_shadows', 'neon', 'candlelight', 'sunset', 'studio'];
        const validMoods = ['neutral', 'intense', 'romantic', 'dramatic', 'mysterious', 'playful', 'seductive', 'melancholic'];

        let cam = (s.camera_movement || 'static').toLowerCase().replace(' ', '_');
        if (cam.includes('zoom_in') || cam.includes('push')) cam = 'dolly_in';
        if (cam.includes('zoom_out') || cam.includes('pull')) cam = 'dolly_out';
        if (!validCameras.includes(cam)) cam = 'static';

        let light = (s.lighting || 'natural').toLowerCase().replace(' ', '_');
        if (!validLighting.includes(light)) light = 'natural';

        let mood = (s.mood || 'neutral').toLowerCase();
        if (!validMoods.includes(mood)) mood = 'neutral';

        let prompt = s.image_prompt || s.prompt || 'Cinematic shot of the scene.';
        if (prompt.length < 10) prompt += ' highly detailed, cinematic lighting.';

        return {
            prompt,
            motion_prompt: (s as any).motion_prompt || '',
            camera_movement: cam,
            lighting: light,
            mood: mood,
            dialogue: s.dialogue || '',
            negative_prompt: s.negative_prompt || '',
            duration_target_sec: Math.max(5, s.duration_target_sec || 5),
            status: 'pending',
            order: 0
        };
    };

    const handleSend = async () => {
        if (!input.trim() || isPlanning) return;
        const userText = input.trim();
        setInput('');
        setMessages(prev => [...prev, { role: 'user', text: userText }]);
        setIsPlanning(true);
        if (!globalPrompt) onGlobalPromptChange(userText);

        try {
            // If the user already has shots with generated non-empty prompts, we assume they want to REFINE the sequence.
            // If it's just the default empty shots, we PLAN from scratch.
            const hasValidShots = shots.some(s => s.prompt && s.prompt.length > 5);

            if (hasValidShots) {
                // Conversational sequence editing
                const data = await api.directorRefineSequence(shots, userText);
                if (data?.shots) {
                    const newShots: Shot[] = data.shots.map((s: any, i: number) => {
                        const cleaned = cleanShot(s);
                        cleaned.order = i;
                        return cleaned;
                    });
                    onShotsChange(newShots);
                    setMessages(prev => [...prev, { role: 'ai', text: `¡Secuencia actualizada! He modificado los shots de acuerdo a tu solicitud.` }]);
                }
            } else {
                // Initial Planning
                const data = await api.directorPlan(userText, 15, "cinematic");
                if (data?.shots) {
                    const newShots: Shot[] = data.shots.map((s: any, i: number) => {
                        const cleaned = cleanShot(s);
                        cleaned.order = i;
                        return cleaned;
                    });
                    onShotsChange(newShots);
                    setMessages(prev => [...prev, { role: 'ai', text: `¡Listo! ${newShots.length} escenas generadas. Usa el zoom para verlas todas en el canvas.` }]);
                    setActiveShotIdx(0);
                }
            }
        } catch (error) {
            console.error(error);
            setMessages(prev => [...prev, { role: 'ai', text: 'Error al conectar con el Director AI. Verifica que la IA en la nube esté activa.' }]);
        } finally {
            setIsPlanning(false);
        }
    };

    const updateShot = (idx: number, updates: Partial<Shot>) => {
        const newShots = [...shots];
        newShots[idx] = { ...newShots[idx], ...updates };
        onShotsChange(newShots);
    };

    const totalDuration = shots.reduce((a, s) => a + (s.duration_target_sec || 0), 0);

    const sidebarIcons = [
        { id: 'settings' as SidePanel, icon: Settings, label: 'Inspector' },
    ];

    return (
        <div className="absolute inset-0 flex bg-[#0c0c0c] animate-in fade-in duration-300 overflow-hidden">

            {/* SLIM ICON SIDEBAR */}
            <div className="w-12 bg-[#111118] border-r border-white/[0.06] flex flex-col items-center py-3 gap-1 shrink-0 z-20">
                {sidebarIcons.map((item) => {
                    const Icon = item.icon;
                    const isActive = activePanel === item.id;
                    return (
                        <button
                            key={item.id}
                            onClick={() => setActivePanel(isActive ? null : item.id)}
                            className={cn(
                                "w-9 h-9 rounded-lg flex items-center justify-center transition-all relative",
                                isActive ? "bg-white/10 text-white" : "text-white/30 hover:text-white/60 hover:bg-white/5"
                            )}
                            title={item.label}
                        >
                            <Icon className="w-[18px] h-[18px]" />
                            {isActive && <div className="absolute left-0 top-1/4 bottom-1/4 w-[2px] bg-accent-purple rounded-r-full" />}
                        </button>
                    );
                })}
                <div className="flex-1" />
                <div className="w-6 h-[1px] bg-white/[0.06] mb-2" />
                <button className="w-9 h-9 rounded-lg flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-all" title="Grid View">
                    <Grid3X3 className="w-[18px] h-[18px]" />
                </button>
                <button className="w-9 h-9 rounded-lg flex items-center justify-center text-white/20 hover:text-white/50 hover:bg-white/5 transition-all" title="Layers">
                    <Layers className="w-[18px] h-[18px]" />
                </button>
            </div>

            {/* EXPANDABLE SIDE PANEL */}
            <div className={cn(
                "border-r border-white/[0.06] bg-[#111118] flex flex-col shrink-0 transition-all duration-300 overflow-hidden",
                activePanel ? "w-80" : "w-0 border-none"
            )}>
                {activePanel === 'settings' && shots.length > 0 && (
                    <>
                        <div className="p-4 border-b border-white/[0.06] shrink-0">
                            <div className="flex items-center justify-between">
                                <h2 className="text-[11px] font-semibold text-white/90">Inspector — Escena {activeShotIdx + 1}</h2>
                                <span className="text-[8px] px-2 py-1 rounded-md bg-accent-purple/10 text-accent-purple font-semibold border border-accent-purple/20">SDXL</span>
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 space-y-5 custom-scrollbar">
                            <div className="space-y-2">
                                <label className="text-[10px] font-medium text-white/40 flex items-center gap-1.5">
                                    <ImageIcon className="w-3 h-3" /> Image Prompt
                                </label>
                                <textarea
                                    className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg p-3 text-[11px] leading-relaxed focus:border-accent-purple/40 focus:outline-none min-h-24 resize-none transition-colors text-white/80 placeholder:text-white/15"
                                    value={activeShot?.prompt || ''}
                                    onChange={(e) => updateShot(activeShotIdx, { prompt: e.target.value })}
                                    placeholder="Composición visual detallada..."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-medium text-accent-purple/80 flex items-center gap-1.5">
                                    <Play className="w-3 h-3" /> Motion
                                </label>
                                <textarea
                                    className="w-full bg-accent-purple/[0.04] border border-accent-purple/15 rounded-lg p-3 text-[11px] leading-relaxed focus:border-accent-purple/40 focus:outline-none min-h-20 resize-none transition-colors text-white/70 placeholder:text-white/15"
                                    placeholder="Movimiento del personaje..."
                                    value={(activeShot as any)?.motion_prompt || ''}
                                    onChange={(e) => updateShot(activeShotIdx, { motion_prompt: e.target.value } as any)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-medium text-white/40 flex items-center gap-1.5">
                                        <Camera className="w-3 h-3" /> Cámara
                                    </label>
                                    <input type="text" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg p-2.5 text-[10px] focus:border-accent-purple/40 outline-none text-white/70"
                                        value={activeShot?.camera_movement || ''}
                                        onChange={e => updateShot(activeShotIdx, { camera_movement: e.target.value })} />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-medium text-white/40 flex items-center gap-1.5">
                                        <Clock className="w-3 h-3" /> Duración
                                    </label>
                                    <div className="flex items-center gap-1">
                                        <input type="number" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg p-2.5 text-[10px] focus:border-accent-purple/40 outline-none text-white/70"
                                            value={activeShot?.duration_target_sec || 5}
                                            onChange={e => updateShot(activeShotIdx, { duration_target_sec: parseInt(e.target.value) })} />
                                        <span className="text-[9px] text-white/30 shrink-0">seg</span>
                                    </div>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-medium text-white/40 flex items-center gap-1.5">
                                    <Mic className="w-3 h-3" /> Voice-Over
                                </label>
                                <input type="text" className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg p-2.5 text-[10px] focus:border-accent-purple/40 outline-none text-white/70 placeholder:text-white/15"
                                    value={activeShot?.dialogue || ''}
                                    onChange={e => updateShot(activeShotIdx, { dialogue: e.target.value })}
                                    placeholder="Texto narrado..." />
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* MAIN CANVAS — Zoomable/Pannable Shot Grid */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                <div
                    ref={canvasRef}
                    className="flex-1 relative overflow-hidden dot-grid-bg select-none"
                    style={{ cursor: isPanning ? 'grabbing' : 'grab' }}
                    onWheel={handleWheel}
                    onMouseDown={handleCanvasMouseDown}
                    onMouseMove={handleCanvasMouseMove}
                    onMouseUp={handleCanvasMouseUp}
                    onMouseLeave={handleCanvasMouseUp}
                >
                    {/* Transformed canvas layer */}
                    <div
                        className="canvas-inner absolute origin-top-left transition-transform duration-75"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            width: `${COLS * (CARD_W + GAP)}px`,
                            height: `${SHOTS_OFFSET_Y + Math.ceil(Math.max(shots.length, 1) / COLS) * (CARD_H + GAP)}px`,
                        }}
                    >
                        {/* ═══════ AI DIRECTOR BOT CARD — Resizable ═══════ */}
                        <div
                            className="absolute rounded-xl border border-accent-purple/20 bg-[#161620] shadow-[0_8px_40px_rgba(124,58,237,0.08)] overflow-visible"
                            style={{ left: 0, top: 0, width: actualBotW, height: botCardH }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="h-full flex flex-col cursor-default rounded-xl overflow-hidden">
                                {/* Bot Header */}
                                <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-white/[0.04] shrink-0">
                                    <div className="w-6 h-6 rounded-lg bg-accent-purple/20 flex items-center justify-center">
                                        <Bot className="w-3.5 h-3.5 text-accent-purple" />
                                    </div>
                                    <span className="text-[11px] font-semibold text-white/90">Director AI</span>
                                    <div className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded bg-green-500/10 border border-green-500/20">
                                        <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                        <span className="text-[7px] text-green-400 font-semibold">Online</span>
                                    </div>
                                </div>

                                {/* Messages area */}
                                <div className="flex-1 overflow-y-auto px-4 py-2 flex gap-2 items-start custom-scrollbar flex-wrap">
                                    {messages.map((m, i) => (
                                        <div key={i} className={cn(
                                            "shrink-0 max-w-[280px] px-3 py-2 rounded-xl text-[10px] leading-relaxed",
                                            m.role === 'user'
                                                ? "bg-accent-purple/15 text-white/90 border border-accent-purple/20"
                                                : "bg-white/[0.04] text-white/60 border border-white/[0.06]"
                                        )}>
                                            {m.text}
                                        </div>
                                    ))}
                                    {isPlanning && (
                                        <div className="shrink-0 flex items-center gap-2 text-white/30 text-[9px] px-2">
                                            <Loader2 className="w-3 h-3 animate-spin text-accent-purple" /> Generando...
                                        </div>
                                    )}
                                    <div ref={chatEndRef} />
                                </div>

                                {/* Chat input */}
                                <div className="px-4 py-2 border-t border-white/[0.04] shrink-0">
                                    <div className="flex gap-2 bg-white/[0.03] border border-white/[0.06] rounded-lg p-1 focus-within:border-accent-purple/30 transition-colors">
                                        <input
                                            type="text"
                                            placeholder="Describe tu video o pide cambios..."
                                            className="flex-1 bg-transparent px-2.5 py-1 text-[10px] focus:outline-none text-white placeholder:text-white/15"
                                            value={input}
                                            onChange={(e) => setInput(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                                            disabled={isPlanning}
                                        />
                                        <button
                                            onClick={handleSend}
                                            disabled={isPlanning || !input.trim()}
                                            className="w-6 h-6 flex items-center justify-center rounded-md bg-accent-purple text-white hover:bg-accent-purple/80 transition-all disabled:opacity-30"
                                        >
                                            <Send className="w-3 h-3" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* ── Resize handles ── */}
                            {/* Bottom edge */}
                            <div
                                className="absolute left-2 right-2 h-2 cursor-ns-resize group"
                                style={{ bottom: -4 }}
                                onMouseDown={(e) => handleResizeStart(e, 'bottom')}
                            >
                                <div className="mx-auto w-10 h-1 rounded-full bg-white/[0.06] group-hover:bg-accent-purple/40 transition-colors mt-0.5" />
                            </div>
                            {/* Right edge */}
                            <div
                                className="absolute top-2 bottom-2 w-2 cursor-ew-resize group"
                                style={{ right: -4 }}
                                onMouseDown={(e) => handleResizeStart(e, 'right')}
                            >
                                <div className="my-auto h-10 w-1 rounded-full bg-white/[0.06] group-hover:bg-accent-purple/40 transition-colors ml-0.5" style={{ marginTop: '50%', transform: 'translateY(-50%)' }} />
                            </div>
                            {/* Corner */}
                            <div
                                className="absolute w-4 h-4 cursor-nwse-resize group"
                                style={{ right: -6, bottom: -6 }}
                                onMouseDown={(e) => handleResizeStart(e, 'corner')}
                            >
                                <div className="w-2 h-2 rounded-sm bg-white/[0.08] group-hover:bg-accent-purple/50 transition-colors absolute bottom-0 right-0" />
                            </div>
                        </div>

                        {/* Empty state (below bot card) */}
                        {shots.length === 0 && (
                            <div className="absolute left-1/2 -translate-x-1/2 text-center pointer-events-none" style={{ top: SHOTS_OFFSET_Y + 40 }}>
                                <Film className="w-12 h-12 text-white/[0.04] mx-auto mb-3" strokeWidth={0.8} />
                                <p className="text-[10px] tracking-[0.2em] font-medium uppercase text-white/[0.06]">Escribe tu idea arriba</p>
                            </div>
                        )}

                        {/* Shot cards on canvas */}
                        {shots.map((shot, idx) => {
                            const pos = getCardPos(idx);
                            const isActive = activeShotIdx === idx;
                            return (
                                <div
                                    key={`shot-${shot.order}`}
                                    className={cn(
                                        "absolute rounded-xl border transition-all duration-200 overflow-hidden group",
                                        isActive
                                            ? "border-accent-purple shadow-[0_0_30px_rgba(124,58,237,0.15)] z-10"
                                            : "border-white/[0.08] hover:border-white/15 shadow-lg shadow-black/30"
                                    )}
                                    style={{
                                        left: pos.x,
                                        top: pos.y,
                                        width: CARD_W,
                                        height: CARD_H,
                                    }}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveShotIdx(idx);
                                        setActivePanel('settings');
                                    }}
                                >
                                    {/* Card background */}
                                    <div className={cn(
                                        "absolute inset-0",
                                        isActive ? "bg-accent-purple/[0.06]" : "bg-[#161620]"
                                    )} />

                                    {/* Card content */}
                                    <div className="relative h-full flex flex-col p-3 cursor-pointer">
                                        {/* Header */}
                                        <div className="flex items-center gap-2 mb-2">
                                            <div className={cn(
                                                "w-6 h-6 rounded-lg flex items-center justify-center shrink-0",
                                                isActive ? "bg-accent-purple/20" : "bg-white/5"
                                            )}>
                                                <Film className={cn("w-3.5 h-3.5", isActive ? "text-accent-purple" : "text-white/30")} />
                                            </div>
                                            <span className={cn(
                                                "text-[11px] font-semibold truncate",
                                                isActive ? "text-white" : "text-white/70"
                                            )}>
                                                Escena {shot.order + 1}
                                            </span>
                                            {/* Status badge */}
                                            <span className={cn(
                                                "ml-auto text-[7px] font-bold px-1.5 py-0.5 rounded uppercase shrink-0",
                                                shot.status === 'pending'
                                                    ? "bg-green-500/10 text-green-400 border border-green-500/20"
                                                    : shot.status === 'generating'
                                                        ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                                        : "bg-accent-purple/10 text-accent-purple border border-accent-purple/20"
                                            )}>
                                                {shot.status === 'pending' ? 'Nuevo' : shot.status === 'generating' ? 'Gen...' : 'Listo'}
                                            </span>
                                        </div>

                                        {/* Preview area */}
                                        <div className="flex-1 rounded-lg bg-black/30 overflow-hidden relative flex items-center justify-center mb-2">
                                            {shot.preview_url ? (
                                                <img
                                                    src={shot.preview_url && shot.preview_url.startsWith('http') ? shot.preview_url : `${API_BASE}${shot.preview_url || ''}`}
                                                    className="w-full h-full object-cover"
                                                    alt={`Shot ${idx + 1}`}
                                                />
                                            ) : (
                                                <ImageIcon className="w-6 h-6 text-white/[0.06]" />
                                            )}
                                        </div>

                                        {/* Footer metadata */}
                                        <div className="flex items-center justify-between text-[9px]">
                                            <div className="flex items-center gap-1.5 text-white/30">
                                                <Clock className="w-3 h-3" />
                                                <span className="font-medium">{shot.duration_target_sec}s</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 text-white/30">
                                                <Camera className="w-3 h-3" />
                                                <span className="font-medium truncate max-w-[70px]">{shot.camera_movement}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Active indicator line */}
                                    {isActive && <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-accent-purple" />}
                                </div>
                            );
                        })}
                    </div>

                    {/* FLOATING TOOLBAR — Bottom Left */}
                    <div className="absolute left-4 bottom-4 flex flex-col gap-1 bg-[#111118]/90 backdrop-blur-xl border border-white/[0.06] rounded-xl p-1.5 shadow-2xl z-20">
                        <button onClick={() => setZoom(z => Math.min(2, z + 0.15))} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all" title="Zoom In">
                            <ZoomIn className="w-4 h-4" />
                        </button>
                        <button onClick={() => setZoom(z => Math.max(0.2, z - 0.15))} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all" title="Zoom Out">
                            <ZoomOut className="w-4 h-4" />
                        </button>
                        <button onClick={fitToView} className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all" title="Fit All">
                            <Maximize2 className="w-4 h-4" />
                        </button>
                        <div className="w-5 h-[1px] bg-white/[0.06] mx-auto my-0.5" />
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all" title="Undo">
                            <Undo2 className="w-4 h-4" />
                        </button>
                        <button className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:text-white/70 hover:bg-white/5 transition-all" title="Redo">
                            <Redo2 className="w-4 h-4" />
                        </button>
                    </div>

                    {/* FLOATING ACTION BAR — Top Center */}
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#111118]/90 backdrop-blur-xl border border-white/[0.06] rounded-xl px-2 py-1.5 shadow-2xl z-20">
                        {shots.length > 0 && (
                            <span className="text-[9px] text-white/40 font-medium px-2">
                                {shots.length} escenas · {totalDuration}s
                            </span>
                        )}
                        {shots.length > 0 && <div className="w-[1px] h-5 bg-white/[0.06]" />}
                        
                        {/* Simulation Toggle */}
                        <button 
                            onClick={() => onIsMockChange?.(!isMock)}
                            className={cn(
                                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[9px] font-bold transition-all border",
                                isMock 
                                    ? "bg-amber-500/10 text-amber-500 border-amber-500/30" 
                                    : "bg-white/5 text-white/40 border-transparent hover:bg-white/10"
                            )}
                            title="Simular generación (sin usar GPU real)"
                        >
                            <div className={cn("w-1.5 h-1.5 rounded-full", isMock ? "bg-amber-500 animate-pulse" : "bg-white/20")} />
                            Simular
                        </button>

                        <button className="px-3 py-1.5 rounded-lg text-[9px] font-semibold text-white/60 hover:text-white hover:bg-white/5 transition-all flex items-center gap-1.5">
                            Detalles
                        </button>
                        <button
                            onClick={onGenerateAll}
                            disabled={isGenerating || shots.length === 0}
                            className={cn(
                                "px-4 py-1.5 rounded-lg text-[9px] font-bold transition-all disabled:opacity-30 flex items-center gap-2",
                                isMock ? "bg-amber-600 text-white hover:bg-amber-500" : "bg-accent-purple text-white hover:bg-accent-purple/80"
                            )}
                        >
                            {isGenerating ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                                <>
                                    <Sparkles className="w-3 h-3" />
                                    Generar
                                    <kbd className="ml-1 px-1.5 py-0.5 rounded bg-white/15 text-[7px] font-mono">⇧↵</kbd>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Add Shot button — Top Right */}
                    {shots.length > 0 && (
                        <div className="absolute top-4 right-4 z-20">
                            <button className="flex items-center gap-2 bg-[#111118]/90 backdrop-blur-xl border border-white/[0.06] rounded-xl px-4 py-2 text-[10px] font-semibold text-white/60 hover:text-white hover:bg-white/10 transition-all shadow-2xl">
                                <Plus className="w-3.5 h-3.5" />
                                Agregar
                            </button>
                        </div>
                    )}

                    {/* Zoom indicator — Bottom Right */}
                    <div className="absolute bottom-4 right-4 flex items-center gap-3 z-20">
                        <div className="flex items-center gap-2 bg-[#111118]/60 backdrop-blur-md border border-white/[0.06] rounded-lg px-3 py-1.5">
                            <span className="text-[8px] font-mono font-medium text-white/30">{Math.round(zoom * 100)}%</span>
                        </div>
                        <div className="flex items-center gap-2 bg-[#111118]/60 backdrop-blur-md border border-white/[0.06] rounded-lg px-3 py-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                            <span className="text-[8px] font-medium text-white/40">Ollama</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
