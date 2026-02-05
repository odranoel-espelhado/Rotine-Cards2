"use client";

import { UserButton } from "@clerk/nextjs";
import { Zap, Target, Heart, Plus, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { useState } from "react";
import { CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { MissionBlock } from "@/lib/actions/mission.actions";
import { Button } from "@/components/ui/button";
import { deleteMissionBlock } from "@/lib/actions/mission.actions";
import { useRouter } from "next/navigation";
import { format, addDays, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreateBlockDialog } from "@/components/create-block-dialog";
import { BacklogComponent } from "@/components/backlog-component";
import { BacklogTask, moveTaskToBlock } from "@/lib/actions/backlog.actions";
import { TacticalDeck } from "@/components/tactical-deck";
import { TacticalCard } from "@/lib/actions/cards.actions";
import { DndContext, DragEndEvent } from "@dnd-kit/core";
import { DroppableMissionBlock } from "@/components/droppable-mission-block";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// Mock Data for Efficiency Radar Chart (Static for now)
const chartData = [
    { subject: 'Foco', A: 120, fullMark: 150 },
    { subject: 'Saúde', A: 98, fullMark: 150 },
    { subject: 'Meta', A: 86, fullMark: 150 },
    { subject: 'Sono', A: 99, fullMark: 150 },
    { subject: 'Lazer', A: 85, fullMark: 150 },
    { subject: 'Estudo', A: 65, fullMark: 150 },
];

export default function DashboardClient({
    initialBlocks,
    initialBacklog,
    initialCards,
    initialStats,
    userId,
    currentDate
}: {
    initialBlocks: MissionBlock[],
    initialBacklog: BacklogTask[],
    initialCards: TacticalCard[],
    initialStats: any[], // TODO: Define proper type
    userId: string,
    currentDate: string
}) {
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState<string>(currentDate);
    const blocks = initialBlocks; // In a real app with optimization, might use optmistic updates

    // Generate Days (10 back, 20 forward)
    const days = [];
    const today = new Date();
    // Center it somewhat around selectedDate or just keep fixed window around today
    // For simplicity, fixed window around Today
    for (let i = -10; i <= 20; i++) {
        const d = addDays(today, i);
        const dateStr = format(d, 'yyyy-MM-dd');
        days.push({
            date: dateStr,
            day: format(d, 'dd'),
            weekday: format(d, 'EEE', { locale: ptBR }).replace('.', ''),
            isToday: i === 0,
        });
    }

    const handleDateSelect = (date: string) => {
        setSelectedDate(date);
        router.push(`/dashboard?date=${date}`);
    };

    const handleDelete = async (id: string) => {
        if (confirm("Deletar bloco?")) {
            await deleteMissionBlock(id);
        }
    }

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.data.current?.type === 'backlog-task') {
            const taskId = active.id as string;
            const blockId = over.id as string;

            toast.promise(moveTaskToBlock(taskId, blockId), {
                loading: 'Movendo tarefa...',
                success: 'Tarefa movida para o bloco!',
                error: 'Erro ao mover tarefa'
            });
        }
    };

    const [focusMode, setFocusMode] = useState(false);

    const handleCardUsed = (card: TacticalCard) => {
        if (card.name === "Hiperfoco") {
            setFocusMode(true);
            toast.message("Modo Hiperfoco Ativado", {
                description: "Distrações visuais foram minimizadas.",
            });
        }
    }

    return (
        <DndContext onDragEnd={handleDragEnd}>
            <div className={cn("min-h-screen bg-[#020203] text-white selection:bg-primary/30 flex flex-col transition-all duration-700", focusMode ? "grayscale-[0.8]" : "")}>

                {/* Header */}
                <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#050506]/50 backdrop-blur-sm sticky top-0 z-50">
                    <div className="flex items-center gap-2">
                        <div className={cn("h-6 w-6 bg-primary rounded-full shadow-[0_0_15px_-3px_var(--primary)] transition-all", focusMode ? "animate-ping" : "animate-pulse")}></div>
                        <span className="font-bold tracking-tight text-lg">ROTINE CARDS</span>
                    </div>

                    {focusMode && (
                        <div className="absolute left-1/2 -translate-x-1/2 bg-red-500/10 border border-red-500/20 text-red-500 px-3 py-1 rounded-full text-xs font-bold animate-pulse">
                            HIPERFOCO ATIVO
                        </div>
                    )}

                    <div className="flex items-center gap-4">
                        {!focusMode && <CreateBlockDialog currentDate={selectedDate} />}
                        {focusMode && (
                            <Button variant="outline" size="sm" onClick={() => setFocusMode(false)} className="border-red-500/50 text-red-500 hover:bg-red-500/10">
                                Sair
                            </Button>
                        )}
                        <UserButton
                            appearance={{
                                elements: {
                                    userButtonAvatarBox: "h-9 w-9 border-2 border-white/10 hover:border-primary transition-colors"
                                }
                            }}
                        />
                    </div>
                </header>

                <main className="flex-1 overflow-hidden flex flex-col md:flex-row">
                    {/* ... Timeline ... */}
                    <div className="flex-1 flex flex-col border-r border-white/5 relative">
                        {/* Day Carousel */}
                        {/* Day Carousel */}
                        <div className={cn("h-24 w-full border-b border-white/5 flex items-center gap-2 overflow-x-auto px-4 bg-[#050506] transition-all scrollbar-thin scrollbar-thumb-primary/20 scrollbar-track-transparent", focusMode ? "opacity-20 pointer-events-none grayscale" : "")}>
                            {days.map((d) => (
                                <button
                                    key={d.date}
                                    onClick={() => handleDateSelect(d.date)}
                                    className={`flex-shrink-0 w-16 h-18 rounded-xl flex flex-col items-center justify-center gap-1 transition-all border ${selectedDate === d.date
                                        ? "bg-primary/10 border-primary text-primary shadow-[0_0_20px_-5px_var(--primary)] scale-105"
                                        : "bg-white/5 border-transparent text-zinc-500 hover:bg-white/10 hover:text-white"
                                        }`}
                                >
                                    <span className="text-xs uppercase font-bold">{d.weekday}</span>
                                    <span className="text-xl font-bold">{d.day}</span>
                                </button>
                            ))}
                        </div>

                        {/* Mission Timeline - Scrollable */}
                        <div className="flex-1 overflow-y-auto p-4 relative space-y-4">
                            <div className="absolute top-4 left-4 h-full w-[2px] bg-white/5 z-0"></div>

                            {blocks.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-64 text-zinc-500 mt-20">
                                    <CalendarIcon className="h-12 w-12 mb-4 opacity-20" />
                                    <p>Nenhuma missão para este dia.</p>
                                    <Button variant="link" className="text-primary mt-2">Criar Missão Tática</Button>
                                </div>
                            ) : (
                                blocks.map(block => (
                                    <DroppableMissionBlock key={block.id} block={block} onDelete={handleDelete} />
                                ))
                            )}

                            <div className="h-20"></div>
                        </div>
                    </div>

                    {/* ... Right Panel ... */}
                    <div className={cn("w-full md:w-[400px] border-l border-white/5 bg-[#030304] p-6 space-y-8 flex-shrink-0 hidden md:block transition-all", focusMode ? "opacity-10 pointer-events-none blur-sm" : "")}>
                        {/* ... Efficiency Chart ... */}
                        <div>
                            <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Performance Tática</h2>
                            <div className="h-[250px] w-full relative">
                                <ResponsiveContainer width="100%" height="100%">
                                    <RadarChart cx="50%" cy="50%" outerRadius="80%" data={initialStats}>
                                        <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                        <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 12 }} />
                                        <Radar
                                            name="Performance"
                                            dataKey="A"
                                            stroke="#3b82f6"
                                            strokeWidth={3}
                                            fill="#3b82f6"
                                            fillOpacity={0.2}
                                        />
                                    </RadarChart>
                                </ResponsiveContainer>
                                {/* Center Glow */}
                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-20 h-20 bg-primary/20 blur-[50px] rounded-full pointer-events-none"></div>
                            </div>
                        </div>

                        {/* Backlog Section */}
                        <div className="flex-1 bg-[#050506] border border-white/5 rounded-xl overflow-hidden flex flex-col">
                            <BacklogComponent initialTasks={initialBacklog} />
                        </div>

                        {/* Deck Section */}
                        <div>
                            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">Deck de Poder</h2>
                            <TacticalDeck cards={initialCards} onCardUsed={handleCardUsed} />
                        </div>
                    </div>

                </main>
            </div>
        </DndContext>
    );
}
