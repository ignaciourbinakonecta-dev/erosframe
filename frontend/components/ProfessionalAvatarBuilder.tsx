'use client';

import { useState, Suspense, useCallback, useEffect, useRef, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stage, useGLTF, PerspectiveCamera, Center, ContactShadows, CameraControls } from '@react-three/drei';
import { cn } from '@/lib/utils';
import { RefreshCw, Check, AlertCircle, Sparkles, User, Settings2, Wand2, ChevronDown, Trash2, Eye, Shirt, Scissors } from 'lucide-react';
import debounce from 'lodash/debounce';
import * as THREE from 'three';
import { HumanEngine } from '@/lib/human-engine';
import { api, API_BASE } from '@/lib/api';
import PortraitGeneratorModal from './PortraitGeneratorModal';

const MODAL_URL = "https://ignaciourbinakonecta--blender-avatar-service-api-generate.modal.run";

const SKIN_TONES = [
    { name: 'Clara', color: '#f0d5c0' },
    { name: 'Media', color: '#d2a679' },
    { name: 'Bronceada', color: '#8d5524' },
    { name: 'Oscura', color: '#4b2a1a' }
];



const SHOWCASE_TRAITS = {
    gender: 0.8, // Masculino atlético
    muscle: 0.8, 
    weight: 0.4, 
    height: 0.7, 
    skinColor: '#8d5524' // Tan
};

interface MannequinProps {
    engine: HumanEngine;
    influences: Record<string, number>;
    skinColor: string;
}

function SliderGroup({ 
    label, 
    isOpen, 
    onToggle, 
    children 
}: { 
    label: string, 
    isOpen: boolean, 
    onToggle: () => void, 
    children: React.ReactNode 
}) {
    return (
        <div className="border-b border-white/5">
            <button 
                onClick={onToggle}
                className="w-full py-4 flex items-center justify-between text-[11px] font-black uppercase tracking-widest text-white/70 hover:text-white transition-colors"
            >
                {label}
                <ChevronDown className={cn("w-4 h-4 transition-transform", isOpen ? "rotate-180" : "rotate-0")} />
            </button>
            {isOpen && (
                <div className="pb-6 space-y-6 animate-in slide-in-from-top-2 duration-300">
                    {children}
                </div>
            )}
        </div>
    );
}

interface DebugStats {
    vertices: number;
    indices: number;
    bbox: { min: [number, number, number], max: [number, number, number] } | null;
    firstVert: [number, number, number] | null;
}

function DebugOverlay({ stats }: { stats: DebugStats | null }) {
    if (!stats) return null;
    return (
        <div className="absolute top-24 left-6 z-50 bg-black/80 backdrop-blur-md p-4 rounded-xl border border-white/10 font-mono text-[10px] space-y-1 text-green-400">
            <p className="font-bold text-white mb-2">3D DIAGNOSTIC OVERLAY</p>
            <p>Vertices: {stats.vertices}</p>
            <p>Indices: {stats.indices}</p>
            <p>BBox Min: {stats.bbox?.min.map(n => n.toFixed(2)).join(', ')}</p>
            <p>BBox Max: {stats.bbox?.max.map(n => n.toFixed(2)).join(', ')}</p>
            <p>First Vert: {stats.firstVert?.map(n => n.toFixed(2)).join(', ')}</p>
        </div>
    );
}

function MannequinMesh({ engine, influences, skinColor, generatedImage, onDebugUpdate }: MannequinProps & { generatedImage?: string | null, onDebugUpdate: (s: DebugStats) => void }) {
    const meshRef = useRef<THREE.Mesh>(null);
    const { camera } = useThree();

    useEffect(() => {
        if (!engine?.geometry || !meshRef.current) return;
        
        engine.applyInfluences(influences);
        engine.geometry.computeBoundingBox();
        
        const bbox = engine.geometry.boundingBox;
        const pos = engine.geometry.attributes.position.array;
        const index = engine.geometry.index;
        
        onDebugUpdate({
            vertices: engine.geometry.attributes.position.count,
            indices: index ? index.count : 0,
            bbox: bbox ? { 
                min: [bbox.min.x, bbox.min.y, bbox.min.z], 
                max: [bbox.max.x, bbox.max.y, bbox.max.z] 
            } : null,
            firstVert: [pos[0], pos[1], pos[2]]
        });

        // We use the primitive in the JSX, so no manual assignment needed here
        // to avoid React/Three conflict.
    }, [engine, influences, onDebugUpdate]);

    useEffect(() => {
        if (!engine?.geometry || !meshRef.current) return;
        const mesh = meshRef.current;
        
        if (!generatedImage) {
            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                mesh.material.map = null;
                mesh.material.color = new THREE.Color(skinColor);
                mesh.material.needsUpdate = true;
            }
            return;
        }

        const img = new Image();
        img.src = generatedImage;
        img.onload = () => {
            if (!engine?.geometry || !meshRef.current) return;

            const texture = new THREE.Texture(img);
            texture.colorSpace = THREE.SRGBColorSpace;
            texture.needsUpdate = true;

            const posAttribute = engine.geometry.attributes.position;
            const uvs = new Float32Array(posAttribute.count * 2);

            mesh.updateMatrixWorld(true);

            const vec = new THREE.Vector3();
            for(let i = 0; i < posAttribute.count; i++) {
                vec.fromBufferAttribute(posAttribute, i);
                vec.applyMatrix4(mesh.matrixWorld);
                vec.project(camera);

                const u = (vec.x + 1) / 2;
                const v = (vec.y + 1) / 2;

                uvs[i * 2] = u;
                uvs[i * 2 + 1] = v;
            }

            engine.geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));

            if (mesh.material instanceof THREE.MeshStandardMaterial) {
                mesh.material.map = texture;
                mesh.material.color = new THREE.Color(0xffffff);
                mesh.material.needsUpdate = true;
            }
        };
    }, [generatedImage, engine, camera, skinColor]);

    useFrame((state) => {
        if (meshRef.current) {
            // Subtle breathing/idle movement
            meshRef.current.position.y = -0.05 + Math.sin(state.clock.elapsedTime * 0.5) * 0.02;
        }
    });

    if (!engine?.geometry) return null;

    return (
        <group scale={[0.1, 0.1, 0.1]} position={[0, 0.85, 0]} rotation={[0, Math.PI, 0]}>
            <mesh
                ref={meshRef}
                castShadow 
                receiveShadow 
            >
               <primitive object={engine.geometry} attach="geometry" />
               <meshLambertMaterial 
                    color={skinColor}
                    side={THREE.DoubleSide}
                />
            </mesh>
        </group>
    );
}

function Model({ url }: { url: string }) {
    const { scene } = useGLTF(url);
    return <primitive object={scene} />;
}


export default function ProfessionalAvatarBuilder() {
    const hasAutoTriggered = useRef(false);
    const [glbUrl, setGlbUrl] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState('');
    const [mode, setMode] = useState<'mannequin' | 'professional' | 'result'>('mannequin');
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [referenceImage, setReferenceImage] = useState<string | null>(null);
    const [showConfirm, setShowConfirm] = useState(false);
    const [timeLeft, setTimeLeft] = useState(180); // 3 minutes = 180 seconds
    const [isSaving, setIsSaving] = useState(false);
    const [saveSuccess, setSaveSuccess] = useState(false);
    const [isPortraitModalOpen, setIsPortraitModalOpen] = useState(false);

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setReferenceImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };
    
    // Engine state
    const [engine, setEngine] = useState<HumanEngine | null>(null);
    const [isEngineLoading, setIsEngineLoading] = useState(true);
    const [influences, setInfluences] = useState<Record<string, number>>({});
    const [skinColor, setSkinColor] = useState(SKIN_TONES[0].color);

    const [debugStats, setDebugStats] = useState<DebugStats | null>(null);

    const [openCategory, setOpenCategory] = useState<string | null>('macro');

    // Categorized Morph State
    const [morphs, setMorphs] = useState<Record<string, number>>({
        // Macro
        gender: 0.5, 
        muscle: 0.5, 
        weight: 0.5, 
        height: 0.5, 
        // Face
        headShapeRound: 0,
        headShapeSquare: 0,
        headShapeOval: 0,
        chinWidth: 0.5,
        cheekVolume: 0.5,
        // Eyes
        eyeSize: 0.5,
        eyeHeight: 0.5,
        eyeDistance: 0.5,
        eyeEpicanthus: 0,
        // Nose
        noseSize: 0.5,
        noseWidth: 0.5,
        noseHeight: 0.5,
        nosePoint: 0.5,
        // Mouth
        lipVolume: 0.5,
        mouthWidth: 0.5,
        // Body
        vShape: 0.5,
        stomach: 0.5,
        hips: 0.5,
        breastSize: 0.5,
        buttocks: 0.5
    });

    const updateMorph = (key: string, value: number) => {
        setMorphs(prev => ({ ...prev, [key]: value }));
    };

    const handleReset = () => {
        handleResetValues();
    };

    const handleResetValues = () => {
        setMorphs({
            gender: 0.5, 
            muscle: 0.5, 
            weight: 0.5, 
            height: 0.5,
            headShapeRound: 0,
            headShapeSquare: 0,
            headShapeOval: 0,
            chinWidth: 0.5,
            cheekVolume: 0.5,
            eyeSize: 0.5,
            eyeHeight: 0.5,
            eyeDistance: 0.5,
            eyeEpicanthus: 0,
            noseSize: 0.5,
            noseWidth: 0.5,
            noseHeight: 0.5,
            nosePoint: 0.5,
            lipVolume: 0.5,
            mouthWidth: 0.5,
            vShape: 0.5,
            stomach: 0.5,
            hips: 0.5,
            breastSize: 0.5,
            buttocks: 0.5
        });
    };

    const handleRandomize = () => {
        const randomMorphs: Record<string, number> = {};
        Object.keys(morphs).forEach(key => {
            // Randomize between 0 and 1, but maybe bias towards 0.5 for some
            randomMorphs[key] = Math.random();
        });
        setMorphs(randomMorphs);
    };

    // Load Human Engine Assets
    useEffect(() => {
        const loadAssets = async () => {
            try {
                console.log("Human Engine: Fetching assets...");
                const responses = await Promise.all([
                    fetch('/assets/makehuman/human_full_size.json'),
                    fetch('/assets/makehuman/target-list.json'),
                    fetch('/assets/makehuman/targets.bin')
                ]);

                for (const res of responses) {
                    if (!res.ok) throw new Error(`HTTP error! status: ${res.status} for ${res.url}`);
                }

                const [baseJson, targetList, targetsBin] = await Promise.all([
                    responses[0].json(),
                    responses[1].json(),
                    responses[2].arrayBuffer()
                ]);

                console.log("Human Engine: Initializing with", {
                    vertices: baseJson.vertices?.length / 3,
                    targets: Object.keys(targetList.targets || {}).length
                });

                const newEngine = new HumanEngine();
                await newEngine.initialize(baseJson, targetList, targetsBin);
                
                console.log("Human Engine: Initialization Complete", {
                    geometry: !!newEngine.geometry,
                    vertices: newEngine.geometry?.attributes.position.count
                });

                setEngine(newEngine);
                setIsEngineLoading(false);
            } catch (err: any) {
                console.error("Failed to load Human Engine Assets:", err);
                setError(`Error al cargar activos 3D: ${err.message || 'Desconocido'}. Verifica la red.`);
                setIsEngineLoading(false);
            }
        };

        loadAssets();
    }, []);

    // Load Existing Avatar by ID
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const avatarId = params.get('avatar_id');
        
        if (avatarId && !isEngineLoading) {
            const fetchAvatar = async () => {
                try {
                    const avatarList = await api.listAvatars();
                    const avatar = avatarList.find(a => a.id === parseInt(avatarId));
                    
                    if (avatar) {
                        console.log("Loading existing avatar:", avatar.name);
                        if (avatar.morphs) {
                            setMorphs(prev => ({ ...prev, ...avatar.morphs }));
                        }
                        
                        const fullUrl = avatar.texture_url.startsWith('http')
                            ? avatar.texture_url
                            : `${API_BASE}${avatar.texture_url}`;
                        
                        setGeneratedImage(fullUrl);
                        setMode('result');
                    }
                } catch (err) {
                    console.error("Failed to load avatar for review:", err);
                }
            };
            fetchAvatar();
        }
    }, [isEngineLoading]);

    const handleShowcase = useCallback(() => {
        const { skinColor, ...morphTraits } = SHOWCASE_TRAITS;
        setMorphs(prev => ({ ...prev, ...morphTraits }));
        setSkinColor(skinColor);
        // The influences will be updated by the useEffect that maps morphs to influences
    }, [setMorphs, setSkinColor]);

    // Map UI Sliders to Engine Influences
    useEffect(() => {
        if (!engine) return;

        const inf: Record<string, number> = {};
        const { gender, muscle, weight, height } = morphs;
        
        // --- MACRO ---
        inf['data/targets/macrodetails/universal-male-young-averagemuscle-averageweight.target'] = gender;
        inf['data/targets/macrodetails/universal-female-young-averagemuscle-averageweight.target'] = 1 - gender;
        
        // Muscle and weight
        inf['data/targets/macrodetails/universal-male-young-maxmuscle-averageweight.target'] = gender * muscle;
        inf['data/targets/macrodetails/universal-female-young-maxmuscle-averageweight.target'] = (1 - gender) * muscle;
        inf['data/targets/macrodetails/universal-male-young-averagemuscle-maxweight.target'] = gender * weight;
        inf['data/targets/macrodetails/universal-female-young-averagemuscle-maxweight.target'] = (1 - gender) * weight;

        // Height — capped to 0.25 max influence to avoid extreme distortion
        const MAX_HEIGHT_INFLUENCE = 0.25;
        const hLow = Math.max(0, 0.5 - height) * 2 * MAX_HEIGHT_INFLUENCE;
        const hHigh = Math.max(0, height - 0.5) * 2 * MAX_HEIGHT_INFLUENCE;
        if (gender > 0.5) {
            inf['data/targets/macrodetails/height/male-young-averagemuscle-averageweight-minheight.target'] = hLow;
            inf['data/targets/macrodetails/height/male-young-averagemuscle-averageweight-maxheight.target'] = hHigh;
        } else {
            inf['data/targets/macrodetails/height/female-young-averagemuscle-averageweight-minheight.target'] = hLow;
            inf['data/targets/macrodetails/height/female-young-averagemuscle-averageweight-maxheight.target'] = hHigh;
        }

        // --- ETHNICITY (REMOVED: Handled by AI Flux Prompting) ---

        // --- FACE ---
        inf['data/targets/head/head-round.target'] = morphs.headShapeRound;
        inf['data/targets/head/head-square.target'] = morphs.headShapeSquare;
        inf['data/targets/head/head-oval.target'] = morphs.headShapeOval;
        inf['data/targets/chin/chin-width-max.target'] = Math.max(0, morphs.chinWidth - 0.5) * 2;
        inf['data/targets/chin/chin-width-min.target'] = Math.max(0, 0.5 - morphs.chinWidth) * 2;
        inf['data/targets/cheek/r-cheek-bones-out.target'] = morphs.cheekVolume;
        inf['data/targets/cheek/l-cheek-bones-out.target'] = morphs.cheekVolume;

        // --- EYES ---
        inf['data/targets/eyes/l-eye-size-big.target'] = Math.max(0, morphs.eyeSize - 0.5) * 2;
        inf['data/targets/eyes/r-eye-size-big.target'] = Math.max(0, morphs.eyeSize - 0.5) * 2;
        inf['data/targets/eyes/l-eye-size-small.target'] = Math.max(0, 0.5 - morphs.eyeSize) * 2;
        inf['data/targets/eyes/r-eye-size-small.target'] = Math.max(0, 0.5 - morphs.eyeSize) * 2;
        inf['data/targets/eyes/l-eye-move-up.target'] = Math.max(0, morphs.eyeHeight - 0.5) * 2;
        inf['data/targets/eyes/r-eye-move-up.target'] = Math.max(0, morphs.eyeHeight - 0.5) * 2;
        inf['data/targets/eyes/l-eye-move-down.target'] = Math.max(0, 0.5 - morphs.eyeHeight) * 2;
        inf['data/targets/eyes/r-eye-move-down.target'] = Math.max(0, 0.5 - morphs.eyeHeight) * 2;
        inf['data/targets/eyes/l-eye-move-out.target'] = morphs.eyeDistance;
        inf['data/targets/eyes/r-eye-move-out.target'] = morphs.eyeDistance;

        // --- NOSE ---
        inf['data/targets/nose/nose-width1-max.target'] = Math.max(0, morphs.noseWidth - 0.5) * 2;
        inf['data/targets/nose/nose-width1-min.target'] = Math.max(0, 0.5 - morphs.noseWidth) * 2;
        inf['data/targets/nose/nose-height-max.target'] = Math.max(0, morphs.noseHeight - 0.5) * 2;
        inf['data/targets/nose/nose-height-min.target'] = Math.max(0, 0.5 - morphs.noseHeight) * 2;
        inf['data/targets/nose/nose-point-up.target'] = Math.max(0, morphs.nosePoint - 0.5) * 2;
        inf['data/targets/nose/nose-point-down.target'] = Math.max(0, 0.5 - morphs.nosePoint) * 2;

        // --- MOUTH ---
        inf['data/targets/mouth/mouth-upperlip-volume-inflate.target'] = morphs.lipVolume;
        inf['data/targets/mouth/mouth-lowerlip-volume-inflate.target'] = morphs.lipVolume;
        inf['data/targets/mouth/mouth-width-max.target'] = Math.max(0, morphs.mouthWidth - 0.5) * 2;
        inf['data/targets/mouth/mouth-width-min.target'] = Math.max(0, 0.5 - morphs.mouthWidth) * 2;

        // --- BODY ---
        inf['data/targets/torso/torso-vshape-more.target'] = morphs.vShape;
        inf['data/targets/stomach/stomach-pregnant-incr.target'] = morphs.stomach;
        inf['data/targets/hip/hip-scale-horiz-incr.target'] = morphs.hips;
        inf['data/targets/buttocks/buttocks-volume-incr.target'] = morphs.buttocks;
        if (gender < 0.5) {
            inf['data/targets/breast/female-young-averagemuscle-averageweight-maxcup-maxfirmness.target'] = morphs.breastSize;
        }

        setInfluences(inf);
    }, [engine, morphs]);
    
    // Canvas ref for screenshot
    const canvasRef = useRef<HTMLCanvasElement>(null);

    const handleRefineClick = () => {
        setShowConfirm(true);
    };

    const confirmGenerateModel = useCallback(async () => {
        setShowConfirm(false);
        setIsGenerating(true);
        setTimeLeft(180);
        setError('');
        
        try {
            // 1. Capture base image from current mannequin state
            const canvas = document.querySelector('canvas');
            if (!canvas) throw new Error("No se pudo encontrar el lienzo 3D");
            
            let finalDataUrl = canvas.toDataURL('image/png');

            if (referenceImage) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = canvas.width;
                tempCanvas.height = canvas.height;
                const ctx = tempCanvas.getContext('2d');
                if (ctx) {
                    ctx.drawImage(canvas, 0, 0);
                    const img = new Image();
                    img.src = referenceImage;
                    await new Promise(r => img.onload = r);
                    
                    const faceHeight = canvas.height * 0.4;
                    const faceWidth = (img.width / img.height) * faceHeight;
                    const x = (canvas.width - faceWidth) / 2;
                    const y = canvas.height * 0.1;
                    
                    ctx.globalAlpha = 0.8;
                    ctx.drawImage(img, x, y, faceWidth, faceHeight);
                    ctx.globalAlpha = 1.0;
                    
                    finalDataUrl = tempCanvas.toDataURL('image/png');
                }
            }

            const baseImageB64 = finalDataUrl.split(',')[1];

            // 2. Map Morphs to Prompt extras
            const buildExtraPrompt = () => {
                const parts = [];
                if (morphs.muscle > 0.7) parts.push("cuerpo muy musculoso y definido");
                else if (morphs.muscle > 0.4) parts.push("cuerpo atlético");
                if (morphs.weight > 0.7) parts.push("complexión robusta");
                else if (morphs.weight < 0.3) parts.push("complexión delgada");
                parts.push("piel realista detallada");
                return parts.join(", ");
            };

            const params = {
                gender: morphs.gender > 0.5 ? 'Hombre' : 'Mujer',
                age: 30,  
                height: Math.round(155 + morphs.height * 30),
                weight: Math.round(50 + morphs.weight * 70),
                build: morphs.muscle > 0.6 ? "Atlética" : "Normal",
                country: "Ninguno específico",
                eyes: "Ambar",
                hairstyle: "natural",
                hair_color: "negro",
                clothing: "",
                extra_prompt: buildExtraPrompt(),
                base_image_b64: baseImageB64,
                strength: referenceImage ? 0.8 : 0.85
            };

            const data = await api.generateAvatar(params);

            if (data && data.image_b64) {
                setGeneratedImage(`data:image/png;base64,${data.image_b64}`);
                setMode('result');
            } else {
                throw new Error("No se recibió la imagen del avatar");
            }
        } catch (err: any) {
            console.error("Error en render:", err);
            setError(`Error: ${err.message || 'Fallo de conexión 3D'}`);
            setMode('mannequin');
        } finally {
            setIsGenerating(false);
        }
    }, [morphs, referenceImage]);

    // Auto-Pilot for Showcase
    useEffect(() => {
        if (!engine || isEngineLoading || isGenerating) return;

        // If the user wants a showcase, we can auto-trigger it after loading
        const params = new URLSearchParams(window.location.search);
        if (params.get('auto') === 'true' && !hasAutoTriggered.current) {
            hasAutoTriggered.current = true;
            const timeoutId = setTimeout(async () => {
                console.log("Auto-Pilot: Applying Showcase Traits...");
                handleShowcase();
                // Short delay to let the state settle before triggering Flux Pro
                await new Promise(r => setTimeout(r, 2000));
                console.log("Auto-Pilot: Starting Neural Generation...");
                confirmGenerateModel();
            }, 1000);
            return () => clearTimeout(timeoutId);
        }
    }, [engine, isEngineLoading, isGenerating, handleShowcase, confirmGenerateModel]);

    const [generationStep, setGenerationStep] = useState<number>(0);

    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isGenerating) {
            setGenerationStep(1);
            const timer1 = setTimeout(() => setGenerationStep(2), 2500);
            const timer2 = setTimeout(() => setGenerationStep(3), 5000);
            
            interval = setInterval(() => {
                setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);

            return () => {
                clearTimeout(timer1);
                clearTimeout(timer2);
                clearInterval(interval);
            };
        } else {
            setGenerationStep(0);
        }
    }, [isGenerating]);

    const cameraControlsRef = useRef<any>(null);
    const [zoomTarget, setZoomTarget] = useState<'full' | 'face' | 'torso' | 'legs'>('full');

    useEffect(() => {
        if (!cameraControlsRef.current) return;
        const controls = cameraControlsRef.current;
        switch(zoomTarget) {
            case 'full':
                controls.setLookAt(0, 1.4, 3.2, 0, 1, 0, true);
                break;
            case 'face':
                controls.setLookAt(0, 1.6, 0.8, 0, 1.5, 0, true);
                break;
            case 'torso':
                controls.setLookAt(0, 1.0, 1.5, 0, 1.0, 0, true);
                break;
            case 'legs':
                controls.setLookAt(0, 0.4, 1.5, 0, 0.4, 0, true);
                break;
        }
    }, [zoomTarget]);

    return (
        <div className="flex h-screen w-full bg-[#0a0a0a] overflow-hidden text-white font-sans">
            {/* Main Preview Area */}
            <div className="flex-1 relative flex flex-col bg-[radial-gradient(circle_at_50%_50%,#1a1a2e_0%,#0a0a0a_100%)]">
                <div className="absolute top-6 left-6 z-20 flex gap-4">
                    <div className="flex items-center gap-3 bg-white/5 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-2xl shadow-2xl">
                        <Sparkles className="w-5 h-5 text-accent-purple animate-pulse" />
                        <span className="text-xs font-black uppercase tracking-[0.2em] text-white/80">Motor Humano Interactivo</span>
                    </div>
                </div>

                <DebugOverlay stats={debugStats} />

                <div className="flex-1 w-full h-full relative cursor-grab active:cursor-grabbing">
                    <Canvas 
                        shadows={{ type: THREE.PCFShadowMap }} 
                        dpr={[1, 2]} 
                        gl={{ preserveDrawingBuffer: true }}
                        camera={{ position: [0, 1.4, 3.2], fov: 40 }}
                        style={{ background: 'radial-gradient(circle at 50% 50%, #2a2a3e 0%, #0a0a0a 100%)' }}
                    >
                        <ambientLight intensity={0.6} />
                        <directionalLight position={[5, 10, 5]} intensity={1.0} castShadow shadow-mapSize={[1024, 1024]} />
                        <directionalLight position={[-5, 5, -5]} intensity={0.5} />
                        <pointLight position={[0, 2, 2]} intensity={1.5} color="#fff" />
                        
                        <Suspense fallback={null}>
                            <Stage intensity={0.5} environment="city" adjustCamera={false}>
                                <Center top>
                                    {mode === 'professional' && glbUrl && <Model url={glbUrl} />}
                                </Center>
                            </Stage>

                            {/* Mannequin outside Stage to avoid auto-scaling conflicts */}
                            {mode === 'mannequin' && engine && (
                                <MannequinMesh 
                                    engine={engine} 
                                    influences={influences} 
                                    skinColor={skinColor}
                                    generatedImage={generatedImage}
                                    onDebugUpdate={() => {}} 
                                />
                            )}

                            <ContactShadows 
                                opacity={0.4} 
                                scale={10} 
                                blur={2} 
                                far={4} 
                                resolution={256} 
                                color="#000000" 
                            />
                        </Suspense>

                        <CameraControls ref={cameraControlsRef} makeDefault />
                    </Canvas>

                    {/* Camera Controls Overlay */}
                    <div className="absolute right-6 top-1/2 -translate-y-1/2 flex flex-col gap-2 z-40 bg-black/40 backdrop-blur-md p-2 rounded-2xl border border-white/10 shadow-2xl">
                        {[
                            { id: 'full', icon: <User className="w-5 h-5" />, label: 'Cuerpo Entero' },
                            { id: 'face', icon: <Eye className="w-5 h-5" />, label: 'Rostro' },
                            { id: 'torso', icon: <Shirt className="w-5 h-5" />, label: 'Torso' },
                            { id: 'legs', icon: <Scissors className="w-5 h-5" />, label: 'Piernas' } // Using Scissors as stand-in icon
                        ].map(btn => (
                            <button
                                key={btn.id}
                                onClick={() => setZoomTarget(btn.id as any)}
                                className={cn(
                                    "p-3 rounded-xl transition-all relative group",
                                    zoomTarget === btn.id 
                                        ? "bg-accent-purple text-white shadow-[0_0_15px_rgba(168,85,247,0.5)]" 
                                        : "text-white/40 hover:text-white hover:bg-white/10"
                                )}
                                title={btn.label}
                            >
                                {btn.icon}
                                <span className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-black/80 backdrop-blur-md rounded-lg text-[10px] font-bold tracking-widest uppercase opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap border border-white/10 pointer-events-none">
                                    {btn.label}
                                </span>
                            </button>
                        ))}
                    </div>

                    {generatedImage && (
                        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex gap-4 z-40 animate-in slide-in-from-bottom-10 fade-in duration-500">
                             <button 
                                onClick={() => { setGeneratedImage(null); setSaveSuccess(false); }}
                                className="bg-red-500/20 text-red-100 backdrop-blur-md border border-red-500/40 px-8 py-3 rounded-2xl hover:bg-red-500/30 transition-all font-bold uppercase text-xs tracking-widest flex items-center gap-2 shadow-2xl"
                            >
                                <Trash2 className="w-4 h-4" />
                                Limpiar Textura
                            </button>
                            <button 
                                onClick={async () => {
                                    if (!generatedImage || isSaving || saveSuccess) return;
                                    setIsSaving(true);
                                    try {
                                        await api.saveAvatar({
                                            name: `Avatar ${new Date().toLocaleDateString('es-CL')}`,
                                            image_b64: generatedImage,
                                            morphs: morphs as Record<string, number>,
                                            styles: {},
                                        });
                                        setSaveSuccess(true);
                                    } catch (e) {
                                        console.error('Error guardando avatar:', e);
                                        setError('No se pudo guardar el avatar. Intenta de nuevo.');
                                    } finally {
                                        setIsSaving(false);
                                    }
                                }}
                                disabled={isSaving || saveSuccess}
                                className={`text-white px-8 py-3 rounded-2xl hover:scale-105 transition-all font-black uppercase text-xs tracking-widest flex items-center gap-2 shadow-2xl disabled:opacity-70 disabled:hover:scale-100 ${
                                    saveSuccess 
                                        ? 'bg-green-500/80 border border-green-400/50 shadow-[0_0_30px_rgba(34,197,94,0.4)]' 
                                        : 'bg-accent-purple shadow-[0_0_30px_rgba(168,85,247,0.4)]'
                                }`}
                            >
                                {isSaving ? (
                                    <><RefreshCw className="w-4 h-4 animate-spin" /> Guardando...</>
                                ) : saveSuccess ? (
                                    <><Check className="w-4 h-4" /> ¡Guardado!</>
                                ) : (
                                    <><Check className="w-4 h-4" /> Guardar en Colección</>
                                )}
                            </button>
                        </div>
                    )}

                    {isEngineLoading && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-30 flex flex-col items-center justify-center">
                            <RefreshCw className="w-8 h-8 text-accent-purple animate-spin mb-4" />
                            <p className="text-xs font-black uppercase tracking-widest text-white/40">Cargando Activos Base (150MB)...</p>
                        </div>
                    )}

                    {isGenerating && (
                        <div className="absolute inset-0 bg-black/60 backdrop-blur-md z-30 flex flex-col items-center justify-center transition-all animate-in fade-in duration-500">
                             <div className="relative">
                                <div className="w-24 h-24 border-2 border-white/10 rounded-full animate-[ping_2s_infinite]" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="w-12 h-12 border-4 border-pink-500/30 border-t-pink-500 rounded-full animate-spin" />
                                </div>
                             </div>
                             <div className="mt-8 text-center space-y-2">
                                <p className="text-lg font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-violet-500 animate-pulse uppercase">
                                    {generationStep === 1 && "Sincronizando puntos de referencia..."}
                                    {generationStep === 2 && "Transfiriendo maniquí a motor IA..."}
                                    {generationStep === 3 && "IA Esculpiendo detalles..."}
                                </p>
                                <p className="text-[10px] font-medium text-white/40 uppercase tracking-[4px]">
                                    {generationStep === 1 && "Calculando topología base"}
                                    {generationStep === 2 && "Generando malla neuronal"}
                                    {generationStep === 3 && "Aplicando texturas y morphs. Por favor, espera."}
                                </p>
                                <div className="mt-6 flex flex-col items-center gap-2">
                                    <div className="w-64 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div 
                                            className="h-full bg-gradient-to-r from-pink-500 to-violet-500 transition-all duration-1000 ease-linear" 
                                            style={{ width: `${Math.max(0, 100 - (timeLeft / 180) * 100)}%` }}
                                        />
                                    </div>
                                    <p className="text-xl font-mono text-white/80 tracking-widest bg-black/50 px-4 py-1 rounded-md border border-white/5">
                                        {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
                                    </p>
                                    <p className="text-[9px] text-white/30 uppercase mt-2 max-w-[280px]">
                                        El proceso toma aproximadamente 3 minutos usando aceleración en la nube.
                                    </p>
                                </div>
                             </div>
                        </div>
                    )}

                    {showConfirm && (
                        <div className="absolute inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center animate-in fade-in duration-300">
                            <div className="bg-[#12121a] border border-white/10 p-8 rounded-3xl max-w-md w-full shadow-2xl">
                                <AlertCircle className="w-12 h-12 text-yellow-500 mb-6 mx-auto" />
                                <h3 className="text-xl font-black text-center mb-4 uppercase tracking-wider text-white">Confirmar Generación</h3>
                                <p className="text-sm text-white/60 text-center mb-8 leading-relaxed">
                                    El proceso de esculpido y pintado neuronal (Flux Pro) renderiza una imagen en calidad 8K y luego calcula la proyección UV matemática en 3D. 
                                    <br/><br/>
                                    <span className="text-white/90 font-bold block">
                                    Por favor, no recargues la página ni cambies de pestaña.
                                    Tardará aproximadamente 3 minutos.
                                    </span>
                                </p>
                                <div className="flex gap-4">
                                    <button 
                                        onClick={() => setShowConfirm(false)}
                                        className="flex-1 px-6 py-3 rounded-xl border border-white/10 text-white/60 hover:text-white hover:bg-white/5 transition-colors font-bold text-xs uppercase tracking-widest"
                                    >
                                        Cancelar
                                    </button>
                                    <button 
                                        onClick={confirmGenerateModel}
                                        className="flex-1 px-6 py-3 rounded-xl bg-gradient-to-r from-pink-500 to-violet-500 text-white font-black text-xs uppercase tracking-widest shadow-lg shadow-pink-500/25 hover:scale-105 transition-transform"
                                    >
                                        Comenzar
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {error && (
                    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-40 w-full max-w-md animate-bounce">
                        <div className="bg-red-500/10 backdrop-blur-xl border border-red-500/50 text-red-100 px-6 py-4 rounded-3xl flex items-center gap-4 shadow-2xl">
                            <AlertCircle className="w-6 h-6 text-red-500" />
                            <span className="text-sm font-bold">{error}</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Right Panel Control */}
            <div className="w-[420px] h-full bg-[#050505] border-l border-white/5 flex flex-col shadow-[-40px_0_80px_rgba(0,0,0,0.8)] z-40">
                <div className="p-8 space-y-8 overflow-y-auto flex-1">
                    <header className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-black tracking-tighter leading-none mb-1">DISEÑA TU <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-accent-purple to-pink-500">HUMANO</span></h1>
                            <p className="text-[9px] text-white/20 font-bold uppercase tracking-[0.3em]">Motor Interactivo r183.2</p>
                        </div>
                        <div className="flex gap-2">
                             <button 
                                onClick={handleShowcase}
                                className="px-3 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center text-indigo-300 hover:bg-indigo-500/30 transition-all shadow-xl text-[10px] font-bold uppercase tracking-widest gap-2"
                                title="Showcase de Antigravity"
                            >
                                <Sparkles className="w-3 h-3" />
                                Antigravity
                            </button>
                            <button 
                                onClick={handleRandomize}
                                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all shadow-xl"
                                title="Aleatorizar Atributos"
                            >
                                <Wand2 className="w-4 h-4" />
                            </button>
                            <button 
                                onClick={handleReset}
                                className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/40 hover:text-white hover:bg-white/10 transition-all shadow-xl"
                                title="Restablecer Valores"
                            >
                                <RefreshCw className="w-4 h-4" />
                            </button>
                        </div>
                    </header>

                    <div className="flex flex-col space-y-8">

                        {/* GENDER HERO SELECTOR */}
                        <div className="grid grid-cols-2 gap-3 rounded-2xl overflow-hidden">
                            <button
                                onClick={() => {
                                    updateMorph('gender', 0.0);
                                    updateMorph('hips', 0.75);
                                    updateMorph('breastSize', 0.65);
                                    updateMorph('vShape', 0.25);
                                    updateMorph('muscle', 0.35);
                                }}
                                className={`py-4 rounded-2xl flex flex-col items-center gap-1 font-black text-xs tracking-widest uppercase border transition-all ${
                                    morphs.gender < 0.5
                                        ? 'bg-gradient-to-br from-pink-500/30 to-rose-500/10 border-pink-500/60 text-pink-300 shadow-[0_0_20px_rgba(236,72,153,0.2)]'
                                        : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'
                                }`}
                            >
                                <span className="text-2xl">&#x2640;&#xFE0F;</span>
                                Mujer
                            </button>
                            <button
                                onClick={() => {
                                    updateMorph('gender', 1.0);
                                    updateMorph('hips', 0.35);
                                    updateMorph('breastSize', 0.0);
                                    updateMorph('vShape', 0.7);
                                    updateMorph('muscle', 0.55);
                                }}
                                className={`py-4 rounded-2xl flex flex-col items-center gap-1 font-black text-xs tracking-widest uppercase border transition-all ${
                                    morphs.gender >= 0.5
                                        ? 'bg-gradient-to-br from-blue-500/30 to-indigo-500/10 border-blue-500/60 text-blue-300 shadow-[0_0_20px_rgba(59,130,246,0.2)]'
                                        : 'bg-white/5 border-white/5 text-white/30 hover:bg-white/10'
                                }`}
                            >
                                <span className="text-2xl">&#x2642;&#xFE0F;</span>
                                Hombre
                            </button>
                        </div>

                        {/* STEP 1: SHAPE THE BODY */}
                        <div className="space-y-1 relative">
                            <div className="absolute -left-3 top-0 bottom-0 w-[2px] bg-gradient-to-b from-blue-500/50 to-transparent rounded-full" />
                            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-blue-400 mb-4 flex items-center gap-2">
                                <span className="bg-blue-500/20 px-2 py-0.5 rounded text-[10px]">Paso 1</span>
                                Formar el Cuerpo
                            </h2>
                            <SliderGroup 
                            label="Detalles Macro" 
                            isOpen={openCategory === 'macro'} 
                            onToggle={() => setOpenCategory(openCategory === 'macro' ? null : 'macro')}
                        >
                            <div className="space-y-6 px-1">
                                {[
                                    { id: 'height', label: 'Altura', unit: 'cm', scale: (v: number) => Math.round(155 + v * 30) },
                                    { id: 'weight', label: 'Peso', unit: 'kg', scale: (v: number) => Math.round(50 + v * 70) },
                                    { id: 'muscle', label: 'Musculatura', unit: '%', scale: (v: number) => Math.round(v * 100) },
                                ].map(({ id, label, unit, scale }) => (
                                    <div key={id} className="group">
                                        <div className="flex justify-between items-end mb-2.5">
                                            <label className="text-[9px] font-black uppercase tracking-[2px] text-white/30 group-hover:text-white transition-colors">{label}</label>
                                            <span className="text-[10px] font-bold text-white bg-white/5 px-2 py-0.5 rounded shadow-sm">{scale(morphs[id])}{unit}</span>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.01" value={morphs[id]}
                                            onChange={(e) => updateMorph(id, parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none accent-blue-500 cursor-pointer hover:accent-blue-400 transition-all"
                                        />
                                    </div>
                                ))}

                                <div className="pt-4 space-y-4">
                                    <label className="text-[8px] font-black uppercase tracking-[3px] text-white/20">Tono de Piel</label>
                                    <div className="flex gap-3">
                                        {SKIN_TONES.map((tone) => (
                                            <button
                                                key={tone.name}
                                                onClick={() => setSkinColor(tone.color)}
                                                className={cn(
                                                    "w-10 h-10 rounded-full border-2 transition-all transform hover:scale-110",
                                                    skinColor === tone.color ? "border-white scale-110 shadow-[0_0_15px_rgba(255,255,255,0.3)]" : "border-transparent opacity-60 hover:opacity-100"
                                                )}
                                                style={{ backgroundColor: tone.color }}
                                                title={tone.name}
                                            />
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </SliderGroup>

                        <SliderGroup 
                            label="Rasgos Faciales" 
                            isOpen={openCategory === 'face'} 
                            onToggle={() => setOpenCategory(openCategory === 'face' ? null : 'face')}
                        >
                            <div className="space-y-6 px-1">
                                <label className="text-[8px] font-black uppercase tracking-[3px] text-white/20">Forma de la Cabeza</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {[
                                        { id: 'headShapeRound', label: 'Redonda' },
                                        { id: 'headShapeSquare', label: 'Cuadrada' },
                                        { id: 'headShapeOval', label: 'Ovalada' },
                                    ].map(({ id, label }) => (
                                        <button 
                                            key={id}
                                            onClick={() => updateMorph(id, morphs[id] > 0.5 ? 0 : 1)}
                                            className={cn(
                                                "py-2 rounded-lg text-[8px] font-black uppercase transition-all border",
                                                morphs[id] > 0.5 ? "bg-white text-black border-white" : "bg-white/5 text-white/40 border-white/5 hover:bg-white/10"
                                            )}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                {[
                                    { id: 'chinWidth', label: 'Ancho de la Barbilla' },
                                    { id: 'cheekVolume', label: 'Pómulos' },
                                ].map(({ id, label }) => (
                                    <div key={id} className="group">
                                        <div className="flex justify-between items-end mb-2.5">
                                            <label className="text-[9px] font-black uppercase tracking-[2px] text-white/30">{label}</label>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.01" value={morphs[id]}
                                            onChange={(e) => updateMorph(id, parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none accent-blue-500 cursor-pointer"
                                        />
                                    </div>
                                ))}
                            </div>
                        </SliderGroup>

                        <SliderGroup 
                            label="Ojos y Mirada" 
                            isOpen={openCategory === 'eyes'} 
                            onToggle={() => setOpenCategory(openCategory === 'eyes' ? null : 'eyes')}
                        >
                            <div className="space-y-6 px-1">
                                {[
                                    { id: 'eyeSize', label: 'Escala' },
                                    { id: 'eyeHeight', label: 'Vertical' },
                                    { id: 'eyeDistance', label: 'Espaciado' },
                                    { id: 'eyeEpicanthus', label: 'Pliegue Epicántico' },
                                ].map(({ id, label }) => (
                                    <div key={id} className="group">
                                        <div className="flex justify-between items-end mb-2.5">
                                            <label className="text-[9px] font-black uppercase tracking-[2px] text-white/30">{label}</label>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.01" value={morphs[id]}
                                            onChange={(e) => updateMorph(id, parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none accent-blue-500 cursor-pointer"
                                        />
                                    </div>
                                ))}
                            </div>
                        </SliderGroup>

                        <SliderGroup 
                            label="Nariz y Boca" 
                            isOpen={openCategory === 'nose_mouth'} 
                            onToggle={() => setOpenCategory(openCategory === 'nose_mouth' ? null : 'nose_mouth')}
                        >
                            <div className="space-y-6 px-1">
                                <label className="text-[8px] font-black uppercase tracking-[3px] text-white/20">Nariz</label>
                                {[
                                    { id: 'noseWidth', label: 'Ancho de la Nariz' },
                                    { id: 'noseHeight', label: 'Altura de la Nariz' },
                                    { id: 'nosePoint', label: 'Punta de la Nariz' },
                                ].map(({ id, label }) => (
                                    <div key={id} className="group">
                                        <div className="flex justify-between items-end mb-2.5">
                                            <label className="text-[9px] font-black uppercase tracking-[2px] text-white/30">{label}</label>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.01" value={morphs[id]}
                                            onChange={(e) => updateMorph(id, parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none accent-blue-500 cursor-pointer"
                                        />
                                    </div>
                                ))}
                                <label className="text-[8px] font-black uppercase tracking-[3px] text-white/20 pt-4 block">Boca</label>
                                {[
                                    { id: 'lipVolume', label: 'Volumen de Labios' },
                                    { id: 'mouthWidth', label: 'Ancho de la Boca' },
                                ].map(({ id, label }) => (
                                    <div key={id} className="group">
                                        <div className="flex justify-between items-end mb-2.5">
                                            <label className="text-[9px] font-black uppercase tracking-[2px] text-white/30">{label}</label>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.01" value={morphs[id]}
                                            onChange={(e) => updateMorph(id, parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none accent-blue-500 cursor-pointer"
                                        />
                                    </div>
                                ))}
                            </div>
                        </SliderGroup>

                        <SliderGroup 
                            label="Forma del Cuerpo" 
                            isOpen={openCategory === 'body'} 
                            onToggle={() => setOpenCategory(openCategory === 'body' ? null : 'body')}
                        >
                            <div className="space-y-6 px-1">
                                {[
                                    { id: 'vShape', label: 'Forma en V' },
                                    { id: 'stomach', label: 'Estómago' },
                                    { id: 'hips', label: 'Escala de Caderas' },
                                    { id: 'buttocks', label: 'Glúteos' },
                                    { id: 'breastSize', label: 'Pecho (Femenino)' },
                                ].map(({ id, label }) => (
                                    <div key={id} className="group">
                                        <div className="flex justify-between items-end mb-2.5">
                                            <label className="text-[9px] font-black uppercase tracking-[2px] text-white/30">{label}</label>
                                        </div>
                                        <input
                                            type="range" min="0" max="1" step="0.01" value={morphs[id]}
                                            onChange={(e) => updateMorph(id, parseFloat(e.target.value))}
                                            className="w-full h-1 bg-white/10 rounded-full appearance-none outline-none accent-blue-500 cursor-pointer"
                                        />
                                    </div>
                                ))}
                            </div>
                        </SliderGroup>
                        </div> {/* End Step 1 */}

                        {/* STEP 2: VISUAL IDENTITY (AI Editor) */}
                        <div className="space-y-6 relative pt-8 mt-4 border-t border-white/5">
                            <div className="absolute -left-3 top-8 bottom-0 w-[2px] bg-gradient-to-b from-pink-500/50 to-transparent rounded-full" />
                            
                            <div className="flex flex-col gap-2 mb-6">
                                <h2 className="text-sm font-black uppercase tracking-[0.2em] text-pink-400 flex items-center gap-2">
                                    <span className="bg-pink-500/20 px-2 py-0.5 rounded text-[10px]">Paso 2</span>
                                    Identidad Visual (Editor IA)
                                </h2>
                                <p className="text-[10px] text-white/40 leading-relaxed pr-4">
                                    Estos atributos <strong>no afectan la geometría 3D base</strong>. El motor IA neuronal pintará estas características como textura en el modelo en el escaneo final.
                                </p>
                            </div>



                            {/* FACE FUSION BLOCK */}
                            <div className="mt-4 p-5 bg-gradient-to-br from-white/5 to-transparent rounded-2xl border border-white/10">
                                <label className="text-[10px] font-black uppercase tracking-[2px] text-white/50 block mb-1">
                                    Clonación de Rostro con IA
                                </label>
                                <p className="text-[9px] text-white/40 mb-4 pr-6">Genera un rostro 100% sintético con IA para usarlo como identidad de tu avatar, evitando riesgos de Deepfakes.</p>
                                
                                {referenceImage ? (
                                    <div className="relative w-full h-24 rounded-xl overflow-hidden group">
                                        <img src={referenceImage} className="w-full h-full object-cover opacity-80" alt="Referencia" />
                                        <button onClick={() => setReferenceImage(null)} className="absolute inset-0 m-auto w-8 h-8 bg-red-500/80 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                            <Trash2 className="w-4 h-4 text-white" />
                                        </button>
                                    </div>
                                ) : (
                                    <button 
                                        onClick={() => setIsPortraitModalOpen(true)}
                                        className="w-full flex items-center justify-center gap-2 px-4 py-4 bg-white/5 hover:bg-white/10 transition-all rounded-xl cursor-pointer text-xs font-bold text-white/70 border border-dashed border-white/20 hover:border-pink-500/50 hover:text-pink-100"
                                    >
                                        <User className="w-4 h-4" />
                                        <span>Abrir Generador IA de Rostros</span>
                                    </button>
                                )}
                            </div>

                            {/* GENERATE BUTTON */}
                            <div className="pt-8">
                                <button
                                    onClick={handleRefineClick}
                                    disabled={isGenerating || isEngineLoading}
                                    className="w-full bg-gradient-to-r from-pink-500 hover:from-pink-400 to-violet-500 hover:to-violet-400 text-white py-5 rounded-2xl text-[13px] font-black uppercase tracking-[0.2em] shadow-[0_10px_30px_rgba(236,72,153,0.3)] hover:shadow-[0_20px_40px_rgba(236,72,153,0.5)] hover:-translate-y-1 transition-all active:scale-95 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center gap-3"
                                >
                                    {isGenerating ? (
                                        <>
                                            <RefreshCw className="w-4 h-4 animate-spin text-white" />
                                            Generando Textura...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            <span>Generar Textura IA en 8K</span>
                                        </>
                                    )}
                                </button>
                                <p className="mt-4 text-[9px] text-center font-bold text-white/30 uppercase tracking-[3px]">Costo: 10 Créditos Neurales</p>
                            </div>

                        </div> {/* End Step 2 */}
                    </div>
                </div>
            </div>

            <PortraitGeneratorModal 
                isOpen={isPortraitModalOpen} 
                onClose={() => setIsPortraitModalOpen(false)}
                onSelectImage={(url) => {
                    setReferenceImage(url);
                    setIsPortraitModalOpen(false);
                }}
            />
        </div>
    );
}
