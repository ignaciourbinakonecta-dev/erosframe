'use client';

import React, { useState } from 'react';
import { X, Shuffle, Image as ImageIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { api } from '@/lib/api';

interface PortraitGeneratorModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectImage: (imageUrl: string) => void;
}

export default function PortraitGeneratorModal({ isOpen, onClose, onSelectImage }: PortraitGeneratorModalProps) {
    const [history, setHistory] = useState<string[]>([]);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);

    // Form State
    const [gender, setGender] = useState<'Hombre' | 'Mujer' | 'Secreto'>('Mujer');
    const [age, setAge] = useState(25);
    const [height, setHeight] = useState(175);
    const [weight, setWeight] = useState(55);
    const [constitution, setConstitution] = useState('');
    const [ethnicity, setEthnicity] = useState('');

    if (!isOpen) return null;

    const handleRandomize = () => {
        setGender(Math.random() > 0.5 ? 'Mujer' : 'Hombre');
        setAge(Math.floor(Math.random() * (50 - 18 + 1)) + 18);
        setHeight(Math.floor(Math.random() * (195 - 150 + 1)) + 150);
        setWeight(Math.floor(Math.random() * (100 - 45 + 1)) + 45);
        
        const constitutions = ['Delgado', 'Atlético', 'Musculoso', 'Curvy', 'Promedio'];
        setConstitution(constitutions[Math.floor(Math.random() * constitutions.length)]);

        const ethnicities = ['Caucásico', 'Latino', 'Asiático', 'Afroamericano', 'Nórdico', 'Mediterráneo'];
        setEthnicity(ethnicities[Math.floor(Math.random() * ethnicities.length)]);
    };

    const handleGenerate = async () => {
        setIsGenerating(true);
        // Build prompt from parameters
        const promptParams = [];
        if (gender !== 'Secreto') promptParams.push(`género ${gender.toLowerCase()}`);
        promptParams.push(`${age} años de edad`);
        promptParams.push(`mide ${height} cm y pesa ${weight} kg`);
        if (constitution) promptParams.push(`constitución física ${constitution.toLowerCase()}`);
        if (ethnicity) promptParams.push(`etnia ${ethnicity.toLowerCase()}`);

        const basePrompt = `Portrait photo, upper body, facing camera directly, neutral lighting, passport style but cinematic, detailed face. Person characteristics: ${promptParams.join(', ')}. Photorealistic, 8k, raw photo, highly detailed skin pores.`;

        try {
            const data = await api.generatePortrait(basePrompt);
            
            // Assuming data returns a base64 or URL
            const imageUrl = data.image_b64 ? `data:image/png;base64,${data.image_b64}` : data.url;
            
            setHistory(prev => [imageUrl, ...prev]);
            setSelectedImage(imageUrl);
        } catch (error) {
            console.error(error);
            alert("Error al generar la imagen. (Endpoint en construcción)");
            
            // Mock response for UI testing
            const mockImg = "https://images.unsplash.com/photo-1494790108377-be9c29b29330?q=80&w=600&auto=format&fit=crop";
            setHistory(prev => [mockImg, ...prev]);
            setSelectedImage(mockImg);
            
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
            <div className="bg-white text-black w-full max-w-5xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
                
                {/* Header */}
                <div className="flex justify-between items-center p-4 border-b border-gray-100">
                    <h2 className="text-xl font-bold flex-1 text-center">Generador de Identidad con IA</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors absolute right-4">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    {/* LEFT: History */}
                    <div className="w-[180px] border-r border-gray-100 p-4 overflow-y-auto bg-gray-50/50">
                        <h3 className="text-xs font-bold text-gray-500 uppercase mb-4">Historial</h3>
                        <div className="grid grid-cols-2 gap-2">
                            {history.length > 0 ? history.map((img, i) => (
                                <button 
                                    key={i}
                                    onClick={() => setSelectedImage(img)}
                                    className={cn(
                                        "aspect-square rounded-lg overflow-hidden border-2 transition-all",
                                        selectedImage === img ? "border-pink-500 ring-2 ring-pink-500/20" : "border-transparent hover:border-gray-300"
                                    )}
                                >
                                    <img src={img} alt="History" className="w-full h-full object-cover" />
                                </button>
                            )) : (
                                <p className="text-[10px] text-gray-400 col-span-2 text-center py-4">Sin historial</p>
                            )}
                        </div>
                        {history.length > 0 && <p className="text-[10px] text-gray-400 text-center mt-6">Has llegado al final de la lista.</p>}
                    </div>

                    {/* CENTER: Preview */}
                    <div className="flex-1 flex flex-col p-6 bg-gray-50/30">
                        <h3 className="text-sm font-bold text-gray-700 mb-4 text-center">Imagen seleccionada</h3>
                        
                        <div className="flex-1 rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center p-4 overflow-hidden relative group">
                            {selectedImage ? (
                                <img src={selectedImage} alt="Preview" className="w-full h-full object-contain" />
                            ) : (
                                <div className="text-center text-gray-400">
                                    <ImageIcon className="w-12 h-12 mx-auto mb-2 opacity-20" />
                                    <p className="text-sm">Tu generación aparecerá aquí.</p>
                                </div>
                            )}
                            {isGenerating && (
                                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                                    <Loader2 className="w-8 h-8 text-pink-500 animate-spin mb-3" />
                                    <p className="text-sm font-bold text-pink-600 animate-pulse">Sintetizando Identidad...</p>
                                </div>
                            )}
                        </div>

                        <button 
                            disabled={!selectedImage || isGenerating}
                            onClick={() => {
                                if (selectedImage) onSelectImage(selectedImage);
                            }}
                            className={cn(
                                "mt-6 py-4 rounded-xl font-bold text-sm transition-all",
                                selectedImage 
                                    ? "bg-gray-200 text-gray-800 hover:bg-gray-300 active:bg-gray-400" 
                                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                            )}
                        >
                            Seleccionar esta imagen como referencia
                        </button>
                    </div>

                    {/* RIGHT: Controls */}
                    <div className="w-[320px] border-l border-gray-100 p-6 overflow-y-auto">
                        <button 
                            onClick={handleRandomize}
                            className="w-full flex items-center justify-center gap-2 bg-[#f0386b] hover:bg-[#d62857] text-white py-3 rounded-xl font-bold text-sm transition-all shadow-md shadow-pink-500/20 mb-8"
                        >
                            <Shuffle className="w-4 h-4" />
                            Aleatorio
                        </button>

                        <div className="space-y-6">
                            {/* Gender */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 block">Género</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {['Hombre', 'Mujer', 'Secreto'].map((g) => (
                                        <button
                                            key={g}
                                            onClick={() => setGender(g as any)}
                                            className={cn(
                                                "py-2 px-1 rounded-lg text-xs font-bold transition-all border",
                                                gender === g 
                                                    ? "border-black text-black bg-white shadow-sm" 
                                                    : "border-gray-200 text-gray-500 hover:border-gray-300 bg-gray-50"
                                            )}
                                        >
                                            {g}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Age */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <label className="text-xs font-bold text-gray-500">Edad</label>
                                    <span className="text-xs font-bold">{age}</span>
                                </div>
                                <input 
                                    type="range" min="18" max="70" value={age} 
                                    onChange={(e) => setAge(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-200 rounded-full appearance-none outline-none accent-black cursor-pointer"
                                />
                            </div>

                            {/* Height */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <label className="text-xs font-bold text-gray-500">Altura</label>
                                    <div className="text-xs font-bold flex gap-2">
                                        <span>{height} cm</span>
                                    </div>
                                </div>
                                <input 
                                    type="range" min="140" max="220" value={height} 
                                    onChange={(e) => setHeight(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-200 rounded-full appearance-none outline-none accent-black cursor-pointer"
                                />
                            </div>

                            {/* Weight */}
                            <div className="space-y-2">
                                <div className="flex justify-between items-end">
                                    <label className="text-xs font-bold text-gray-500">Peso</label>
                                    <div className="text-xs font-bold flex gap-2">
                                        <span>{weight} kg</span>
                                    </div>
                                </div>
                                <input 
                                    type="range" min="40" max="150" value={weight} 
                                    onChange={(e) => setWeight(parseInt(e.target.value))}
                                    className="w-full h-1 bg-gray-200 rounded-full appearance-none outline-none accent-black cursor-pointer"
                                />
                            </div>

                            {/* Constitution */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 block">Constitución</label>
                                <select 
                                    value={constitution}
                                    onChange={(e) => setConstitution(e.target.value)}
                                    className="w-full bg-white border border-gray-200 text-sm font-bold text-gray-700 rounded-lg px-3 py-2.5 outline-none focus:border-black"
                                >
                                    <option value="">Sin selección</option>
                                    <option value="Delgado">Delgado</option>
                                    <option value="Atlético">Atlético</option>
                                    <option value="Musculoso">Musculoso</option>
                                    <option value="Curvy">Curvy</option>
                                    <option value="Promedio">Promedio</option>
                                </select>
                            </div>

                            {/* Ethnicity */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 block">Etnia / Origen</label>
                                <select 
                                    value={ethnicity}
                                    onChange={(e) => setEthnicity(e.target.value)}
                                    className="w-full bg-white border border-gray-200 text-sm font-bold text-gray-700 rounded-lg px-3 py-2.5 outline-none focus:border-black"
                                >
                                    <option value="">Sin selección</option>
                                    <option value="Caucásico">Caucásico</option>
                                    <option value="Latino">Latino / Hispano</option>
                                    <option value="Asiático">Asiático</option>
                                    <option value="Afroamericano">Afrodescendiente</option>
                                    <option value="Nórdico">Nórdico</option>
                                    <option value="Mediterráneo">Mediterráneo</option>
                                    <option value="Medio Oriente">Medio Oriente</option>
                                </select>
                            </div>
                        </div>

                        {/* Bottom Actions */}
                        <div className="mt-8 pt-6 border-t border-gray-100 flex gap-3">
                            <button 
                                onClick={() => {
                                    setGender('Mujer'); setAge(25); setHeight(175); setWeight(55); setConstitution(''); setEthnicity('');
                                }}
                                className="px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-xl font-bold text-xs text-gray-600 transition-colors"
                            >
                                Restablecer
                            </button>
                            <button 
                                onClick={handleGenerate}
                                disabled={isGenerating}
                                className="flex-1 bg-[#f0386b] hover:bg-[#d62857] text-white py-3 rounded-xl font-bold text-xs transition-colors shadow-md shadow-pink-500/20 disabled:opacity-50"
                            >
                                Generate <span className="font-normal opacity-70 ml-1">-10 créditos</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
