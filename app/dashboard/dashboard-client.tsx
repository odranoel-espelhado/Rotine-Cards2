"use client";

import { UserButton } from "@clerk/nextjs";
import { Zap, Target, Heart, Plus, Trash2, Calendar as CalendarIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
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
import { CardHistory, CardLog } from "@/components/card-history";

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

    // Day Selector Refs & Drag Logic
    const daySelectorRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeftState, setScrollLeftState] = useState(0);

    const startDragging = (e: React.MouseEvent) => {
        if (!daySelectorRef.current) return;
        setIsDragging(true);
        setStartX(e.pageX - daySelectorRef.current.offsetLeft);
        setScrollLeftState(daySelectorRef.current.scrollLeft);
    };

    const stopDragging = () => {
        setIsDragging(false);
    };

    const onDrag = (e: React.MouseEvent) => {
        if (!isDragging || !daySelectorRef.current) return;
        e.preventDefault();
        const x = e.pageX - daySelectorRef.current.offsetLeft;
        const walk = (x - startX) * 2; // Scroll speed multiplier
        daySelectorRef.current.scrollLeft = scrollLeftState - walk;
    };

    // Auto-scroll to Selected Date on Mount
    useEffect(() => {
        const timer = setTimeout(() => {
            const el = document.getElementById(`day-${selectedDate}`);
            if (el && daySelectorRef.current) {
                const container = daySelectorRef.current;
                const scrollPosition = el.offsetLeft - (container.clientWidth / 2) + (el.clientWidth / 2);
                container.scrollTo({ left: scrollPosition, behavior: 'smooth' });
            }
        }, 300); // Slight delay to ensure DOM is ready
        return () => clearTimeout(timer);
    }, [selectedDate]); // Re-run when date changes to keep it centered

    const [logs, setLogs] = useState<CardLog[]>([]);

    const handleCardUsed = (card: TacticalCard) => {
        if (card.name === "Hiperfoco") {
            setFocusMode(true);
            toast.message("Modo Hiperfoco Ativado", {
                description: "Distrações visuais foram minimizadas.",
            });
        }

        const newLog: CardLog = {
            id: Date.now().toString(),
            cardName: card.name,
            timestamp: new Date(),
            description: card.effect || "Efeito Tático Ativado"
        };
        setLogs(prev => [newLog, ...prev]);
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

                <main className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8 container mx-auto max-w-7xl">

                    {/* Top Section: Timeline (Left) & Tasks/Stats (Right) */}
                    <div className="flex flex-col lg:flex-row w-full gap-[2.5%]">

                        {/* LEFT COLUMN: Calendar & Timeline - 55% Width */}
                        <div className="w-full lg:w-[55%] flex flex-col gap-6">
                            {/* Day Carousel with Drag-to-Scroll */}
                            <div
                                ref={daySelectorRef}
                                onMouseDown={startDragging}
                                onMouseLeave={stopDragging}
                                onMouseUp={stopDragging}
                                onMouseMove={onDrag}
                                className={cn(
                                    "w-full overflow-x-auto pb-4 custom-scrollbar flex gap-3 cursor-grab select-none active:cursor-grabbing",
                                    focusMode ? "opacity-20 pointer-events-none grayscale" : ""
                                )}
                                style={{ scrollBehavior: isDragging ? 'auto' : 'smooth' }}
                            >
                                {days.map((d) => (
                                    <button
                                        key={d.date}
                                        id={`day-${d.date}`}
                                        onClick={() => {
                                            if (!isDragging) handleDateSelect(d.date);
                                        }}
                                        className={cn(
                                            "day-card shrink-0 transition-all duration-300",
                                            selectedDate === d.date ? "active scale-105" : "hover:bg-white/5",
                                            d.isToday ? "today border-primary" : ""
                                        )}
                                    >
                                        <span className="text-[10px] uppercase font-black tracking-widest opacity-60">{d.weekday}</span>
                                        <span className="text-2xl font-black">{d.day}</span>
                                        {d.isToday && (
                                            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[8px] bg-primary text-black px-1.5 rounded font-black uppercase">
                                                HOJE
                                            </span>
                                        )}
                                    </button>
                                ))}
                            </div>

                            {/* Mission Timeline */}
                            <div className="bg-[#050506] border border-white/5 rounded-3xl overflow-hidden shadow-2xl relative flex flex-col h-[600px]">
                                <div className="p-6 border-b border-white/5 flex justify-between items-center bg-[#050506]/95 backdrop-blur-md z-10 sticky top-0">
                                    <h2 className="text-2xl font-black uppercase italic text-white flex items-center gap-2">
                                        <CalendarIcon className="w-6 h-6 text-primary" />
                                        <span>Cronograma</span>
                                    </h2>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 relative space-y-4 custom-scrollbar">
                                    <div className="absolute top-6 left-6 h-full w-[2px] bg-white/5 z-0"></div>
                                    {blocks.length === 0 ? (
                                        <div className="flex flex-col items-center justify-center h-48 text-zinc-500 mt-10 relative z-10">
                                            <CalendarIcon className="h-12 w-12 mb-4 opacity-20" />
                                            <p>Nenhuma missão para este dia.</p>
                                        </div>
                                    ) : (
                                        blocks.map(block => (
                                            <DroppableMissionBlock key={block.id} block={block} onDelete={handleDelete} />
                                        ))
                                    )}
                                    <div className="h-20"></div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Tasks (Backlog) & Stats - Remaining Width */}
                        <div className={cn("flex-1 flex flex-col gap-6", focusMode ? "opacity-10 pointer-events-none blur-sm" : "")}>
                            {/* Efficiency Chart */}
                            <div className="bg-[#050506] border border-white/5 rounded-3xl p-6">
                                <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">Performance Tática</h2>
                                <div className="h-[200px] w-full relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart cx="50%" cy="50%" outerRadius="70%" data={initialStats}>
                                            <PolarGrid stroke="rgba(255,255,255,0.1)" />
                                            <PolarAngleAxis dataKey="subject" tick={{ fill: '#a1a1aa', fontSize: 10 }} />
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
                                </div>
                            </div>

                            {/* Backlog Section */}
                            <div className="flex-1 bg-[#050506] border border-white/5 rounded-3xl overflow-hidden flex flex-col h-[500px]">
                                <BacklogComponent initialTasks={initialBacklog} />
                            </div>
                        </div>
                    </div>

                    {/* Middle Section: Deck Tatico */}
                    <div className={cn("w-full space-y-4", focusMode ? "opacity-10 pointer-events-none blur-sm" : "")}>
                        <div className="flex items-center gap-2 px-2">
                            <Zap className="w-5 h-5 text-amber-400" />
                            <h2 className="text-xl font-black uppercase italic text-zinc-300">Deck Tático</h2>
                        </div>
                        <TacticalDeck cards={initialCards} onCardUsed={handleCardUsed} />
                    </div>

                    {/* Bottom Section: History */}
                    <div className={cn("w-full space-y-4", focusMode ? "opacity-10 pointer-events-none blur-sm" : "")}>
                        <div className="flex items-center gap-2 px-2">
                            <CalendarIcon className="w-5 h-5 text-zinc-500" />
                            <h2 className="text-xl font-black uppercase italic text-zinc-300">Histórico de Operações</h2>
                        </div>
                        <CardHistory logs={logs} />
                    </div>

                </main>
            </div>
        </DndContext>
    );
}
