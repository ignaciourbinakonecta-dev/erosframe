import ProfessionalAvatarBuilder from '@/components/ProfessionalAvatarBuilder';

export default function NewAvatarPage() {
    return (
        <div className="min-h-screen bg-[#050505] text-white overflow-hidden">
            {/* Header minimalista para la página */}
            <header className="h-16 border-b border-white/5 flex items-center px-6 bg-black/50 backdrop-blur-md sticky top-0 z-50">
                <a href="/dashboard" className="text-sm font-bold tracking-wider hover:text-accent-purple transition-colors flex items-center gap-2">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
                    Volver a Creadores
                </a>
            </header>

            <main className="h-[calc(100vh-4rem)]">
                <ProfessionalAvatarBuilder />
            </main>
        </div>
    );
}
