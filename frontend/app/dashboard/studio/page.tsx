'use client';

import { useState, useEffect } from 'react';
import TierSelector from '@/components/TierSelector';
import AutoDirector from '@/components/AutoDirector';
import { api } from '@/lib/api';
import {
    Zap,
    Trash2,
    Sparkles,
    Users,
    ChevronRight,
    ChevronLeft,
    CheckCircle2,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface Shot {
    id?: number;
    order: number;
    prompt: string;
    motion_prompt?: string;
    camera_movement: string;
    lighting: string;
    mood: string;
    dialogue: string;
    negative_prompt: string;
    duration_target_sec: number;
    status?: 'pending' | 'generating' | 'done';
    preview_url?: string;
}

type Step = 'tier' | 'avatar' | 'workflow';

const TIER_SHOTS: Record<number, { min: number; max: number }> = {
    1: { min: 3, max: 7 },
    2: { min: 5, max: 12 },
    3: { min: 6, max: 20 },
    11: { min: 3, max: 7 }, 12: { min: 3, max: 7 }, 13: { min: 3, max: 7 },
    21: { min: 5, max: 12 }, 22: { min: 5, max: 12 }, 23: { min: 5, max: 12 },
    31: { min: 6, max: 20 }, 32: { min: 6, max: 20 }, 33: { min: 6, max: 20 },
};

const getBaseTier = (id: number): number => {
    if (id >= 10 && id < 20) return 1;
    if (id >= 20 && id < 30) return 2;
    if (id >= 30 && id < 40) return 3;
    return id;
};

const CATEGORIES = [
    { id: 'girls', label: 'Chicas' },
    { id: 'anime', label: 'Anime' },
    { id: 'boys', label: 'Chicos' }
];

const MOCK_AVATARS = [
    {
        id: '1',
        name: 'Olivia',
        age: 28,
        tagline: 'De espíritu alternativo que trabaja de asistente en una...',
        image: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=400',
    },
    {
        id: '2',
        name: 'Natalia',
        age: 19,
        tagline: 'Estudiante de primer año, intentando descubrir su camino...',
        image: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&q=80&w=400',
    },
    {
        id: '3',
        name: 'Isabella',
        age: 25,
        tagline: 'Tu novia española está  locamente enamorada de ti...',
        image: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&q=80&w=400',
    },
    {
        id: '4',
        name: 'Verónica',
        age: 55,
        tagline: 'La madre de tu mejor amigo. Está casada, es dominante...',
        image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=400',
    },
    {
        id: '5',
        name: 'Emma',
        age: 22,
        tagline: 'Gamer competitiva y amante de los gatos. Se frustra...',
        image: 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&q=80&w=400',
    },
    {
        id: '6',
        name: 'Sophia',
        age: 31,
        tagline: 'Directora de marketing. Muy seria en el trabajo pero...',
        image: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=400',
    },
    {
        id: '7',
        name: 'Mia',
        age: 20,
        tagline: 'Vecina de al lado. Le gusta espiar cuando no le...',
        image: 'https://images.unsplash.com/photo-1554151228-14d9def656e4?auto=format&fit=crop&q=80&w=400',
    }
];

function createDefaultShots(count: number): Shot[] {
    return Array.from({ length: count }, (_, i) => ({
        order: i,
        prompt: '',
        camera_movement: 'dolly_in',
        lighting: 'warm_golden',
        mood: 'intense',
        dialogue: '',
        negative_prompt: '',
        duration_target_sec: 10,
        status: 'pending'
    }));
}

export default function DashboardStudioPage() {
    const [step, setStep] = useState<Step>('tier');
    const [selectedTier, setSelectedTier] = useState(2);
    const [projectTitle, setProjectTitle] = useState('');
    const [globalPrompt, setGlobalPrompt] = useState('');
    const [stylePreset] = useState('hyper-realistic');
    const [shots, setShots] = useState<Shot[]>(createDefaultShots(5));
    const [avatarPrompt, setAvatarPrompt] = useState('');
    const [activeCategory, setActiveCategory] = useState(CATEGORIES[0].id);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [isMasterAdmin, setIsMasterAdmin] = useState(false);
    const [isMock, setIsMock] = useState(false);

    useEffect(() => {
        if (api.isLoggedIn()) {
            api.getMe().then(u => {
                setIsMasterAdmin(u.is_admin && u.email === 'admin@ai-video.com');
            }).catch(() => { });
        }
    }, []);

    const handleTierSelect = (tier: number) => {
        setSelectedTier(tier);
        const cfg = TIER_SHOTS[tier] || TIER_SHOTS[1];
        if (shots.length < cfg.min) {
            setShots(createDefaultShots(cfg.min));
        } else if (shots.length > cfg.max) {
            setShots(shots.slice(0, cfg.max));
        }
    };

    const handleGenerateAll = async () => {
        setError('');
        if (!projectTitle.trim()) {
            setProjectTitle(`Proyecto de Video ${new Date().toLocaleDateString()}`);
        }

        setIsSubmitting(true);
        try {
            const project = await api.createProject({
                title: projectTitle || 'Proyecto de Video',
                tier: getBaseTier(selectedTier),
                target_duration_sec: 900,
                global_prompt: globalPrompt,
                style_preset: stylePreset,
                is_mock: isMock,
                shots: shots.map(s => ({
                    prompt: s.prompt,
                    camera_movement: s.camera_movement,
                    lighting: s.lighting,
                    mood: s.mood,
                    dialogue: s.dialogue || undefined,
                    negative_prompt: s.negative_prompt || undefined,
                    duration_target_sec: s.duration_target_sec,
                })),
            });

            await api.startGeneration(project.id);
            window.location.href = `/dashboard/collection`;
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : 'Error al crear el proyecto');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Step indicator header (replaces the old top Navbar)
    const steps: { key: Step; label: string }[] = [
        { key: 'tier', label: 'Tier' },
        { key: 'avatar', label: 'Avatar' },
        { key: 'workflow', label: 'Workflow' },
    ];

    return (
        <div className="flex flex-col h-full bg-[#0c0c0c] text-white font-sans overflow-hidden">

            {/* Step Navigation Bar (inside dashboard layout) */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-white/5 bg-[#0c0c0c] shrink-0">
                {/* Step pills */}
                <div className="flex items-center gap-1">
                    {steps.map((s, idx) => (
                        <button
                            key={s.key}
                            onClick={() => setStep(s.key)}
                            className={cn(
                                "flex items-center gap-2 px-4 py-1.5 rounded-full text-sm font-semibold transition-all",
                                step === s.key
                                    ? "bg-accent-purple text-white"
                                    : "text-white/40 hover:text-white/70"
                            )}
                        >
                            <span className={cn(
                                "w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border",
                                step === s.key
                                    ? "border-white/30 bg-white/20"
                                    : "border-white/20"
                            )}>
                                {idx + 1}
                            </span>
                            {s.label}
                        </button>
                    ))}
                </div>

                {/* Right: project title + generate button */}
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Nombre del proyecto..."
                        value={projectTitle}
                        onChange={e => setProjectTitle(e.target.value)}
                        className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-accent-purple/60 w-48"
                    />
                    <button
                        onClick={handleGenerateAll}
                        disabled={isSubmitting}
                        className="flex items-center gap-2 bg-accent-purple hover:bg-purple-600 disabled:opacity-50 text-white px-4 py-1.5 rounded-full text-sm font-bold transition-all"
                    >
                        <Zap className="w-4 h-4" />
                        {isSubmitting ? 'Generando...' : 'Continuar'}
                    </button>
                </div>
            </div>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-0 overflow-hidden">

                {/* STEP 1: TIER SELECTION */}
                {step === 'tier' && (
                    <div className="flex-1 overflow-y-auto p-12 bg-[radial-gradient(circle_at_top,_rgba(255,215,0,0.05)_0%,_transparent_50%)]">
                        <div className="max-w-6xl mx-auto space-y-12">
                            <div className="text-center space-y-4">
                                <h1 className="text-4xl font-black uppercase tracking-tighter italic">
                                    {isMasterAdmin ? 'Modo Productor Especial' : 'Selecciona tu Potencia de Fuego'}
                                </h1>
                                <p className="text-white/40 text-sm max-w-xl mx-auto leading-relaxed">
                                    {isMasterAdmin
                                        ? 'Como administrador, tienes acceso total a todos los motores de renderizado sin coste de créditos.'
                                        : 'Cada tier desbloquea motores de vídeo más avanzados e infraestructura de GPU de gama alta.'}
                                </p>
                            </div>
                            <TierSelector
                                selectedTier={selectedTier}
                                onSelect={handleTierSelect}
                                isAdmin={isMasterAdmin}
                            />
                            <div className="flex justify-center">
                                <button
                                    onClick={() => setStep('avatar')}
                                    className="flex items-center gap-2 bg-accent-purple hover:bg-purple-600 text-white px-8 py-3 rounded-full font-bold transition-all"
                                >
                                    Siguiente <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 2: AVATAR SELECTION */}
                {step === 'avatar' && (
                    <div className="flex-1 overflow-y-auto p-4 md:p-8 bg-[#050505]">
                        <div className="max-w-7xl mx-auto animate-in slide-in-from-bottom-5 duration-700 pb-20">

                            <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-10 pb-4 border-b border-white/5 sticky top-0 bg-[#050505]/90 backdrop-blur-md z-10">
                                <div className="flex items-center gap-6 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
                                    {CATEGORIES.map(category => (
                                        <button
                                            key={category.id}
                                            onClick={() => setActiveCategory(category.id)}
                                            className={cn(
                                                "text-sm font-bold tracking-wider relative whitespace-nowrap px-1 py-2 transition-colors",
                                                activeCategory === category.id
                                                    ? "text-accent-purple"
                                                    : "text-white/60 hover:text-white"
                                            )}
                                        >
                                            {category.label}
                                            {activeCategory === category.id && (
                                                <span className="absolute bottom-0 left-0 w-full h-[2px] bg-accent-purple rounded-t-full" />
                                            )}
                                        </button>
                                    ))}
                                </div>

                                <div className="flex items-center gap-4 ml-auto">
                                    <button className="flex items-center gap-2 bg-gradient-to-r from-accent-purple/20 to-transparent border border-accent-purple/30 text-accent-purple px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider hover:border-accent-purple/60 transition-colors">
                                        <Sparkles className="w-3 h-3 fill-current" />
                                        Prémium 70% DESCT
                                    </button>
                                </div>
                            </header>

                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">

                                {/* Crear Nuevo */}
                                <div
                                    onClick={() => setStep('workflow')}
                                    className="group relative rounded-2xl overflow-hidden aspect-[3/4] border-2 border-dashed border-white/20 hover:border-accent-purple/50 bg-gradient-to-b from-white/5 to-transparent transition-all duration-300 flex flex-col items-center justify-center p-6 text-center cursor-pointer h-full hover:bg-white/5"
                                >
                                    <div className="absolute inset-0 bg-accent-purple/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    <div className="w-16 h-16 rounded-full bg-accent-purple/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                                        <Users className="w-8 h-8 text-accent-purple" />
                                    </div>
                                    <h3 className="text-xl font-bold tracking-tight mb-2">Crear nuevo</h3>
                                    <p className="text-sm text-white/50 mb-6">con hasta 3 personajes interactivos</p>
                                    <div className="bg-accent-purple text-white px-6 py-3 rounded-full text-sm font-bold uppercase tracking-wider shadow-lg shadow-purple-500/20 w-fit">
                                        Generar ahora
                                    </div>
                                </div>

                                {/* Avatar cards */}
                                {MOCK_AVATARS.map((avatar) => (
                                    <div
                                        key={avatar.id}
                                        onClick={() => {
                                            setAvatarPrompt(`Modelo base: ${avatar.name}, estilo: hiperrealista, ${avatar.age} años. ${avatar.tagline}`);
                                            setStep('workflow');
                                        }}
                                        className="group relative rounded-3xl overflow-hidden aspect-[3/4] bg-[#111] cursor-pointer"
                                    >
                                        <div className="absolute inset-0">
                                            {/*eslint-disable-next-line @next/next/no-img-element*/}
                                            <img
                                                src={avatar.image}
                                                alt={avatar.name}
                                                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                                        </div>

                                        <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col items-start translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                                            <div className="flex items-baseline gap-2 mb-1">
                                                <h3 className="text-2xl font-bold text-white tracking-tight drop-shadow-md">
                                                    {avatar.name}
                                                </h3>
                                                <span className="text-lg font-medium text-white/80 drop-shadow-md">{avatar.age}</span>
                                            </div>

                                            <p className="text-sm text-white/80 line-clamp-2 leading-snug mb-4 drop-shadow-sm">
                                                {avatar.tagline}
                                            </p>

                                            <button className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-accent-purple to-purple-500 hover:from-purple-500 hover:to-accent-purple text-white py-3 rounded-full text-sm font-bold shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 transition-all opacity-90 group-hover:opacity-100">
                                                <Zap className="w-4 h-4" />
                                                <span>Seleccionar Avatar</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}

                            </div>
                        </div>
                    </div>
                )}

                {/* STEP 3: AUTO-DIRECTOR */}
                {step === 'workflow' && (
                    <AutoDirector
                        shots={shots}
                        onShotsChange={setShots}
                        tier={selectedTier}
                        globalPrompt={globalPrompt || avatarPrompt}
                        onGlobalPromptChange={setGlobalPrompt}
                        onGenerateAll={handleGenerateAll}
                        isGenerating={isSubmitting}
                        isMock={isMock}
                        onIsMockChange={setIsMock}
                    />
                )}

            </main>

            {error && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-red-950 border border-red-500/50 px-6 py-3 rounded-xl text-xs font-bold text-red-100 flex items-center gap-3">
                    <Trash2 className="w-4 h-4 text-red-500" /> {error}
                </div>
            )}
        </div>
    );
}
