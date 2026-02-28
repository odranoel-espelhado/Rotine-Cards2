"use client";

import { UserButton } from "@clerk/nextjs";
import { Zap, Target, Heart, Plus, Trash2, Calendar as CalendarIcon, AlertTriangle } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";
import { CartesianGrid, PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { MissionBlock, getUniqueBlockTypes, checkAndArchivePastTasks } from "@/lib/actions/mission.actions";
import { Button } from "@/components/ui/button";
import { deleteMissionBlock, updateMissionBlock } from "@/lib/actions/mission.actions";
import { useRouter } from "next/navigation";
import { format, addDays, subDays, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CreateBlockDialog } from "@/components/create-block-dialog";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { BacklogComponent } from "@/components/backlog-component";
import { BacklogTask, moveTaskToBlock } from "@/lib/actions/backlog.actions";
import { convertTaskToBlock } from "@/lib/actions/mission.actions";
import { TacticalDeck } from "@/components/tactical-deck";
import { TacticalCard } from "@/lib/actions/cards.actions";
import { DroppableGap } from "@/components/droppable-gap";
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, useSensor, useSensors, MouseSensor, TouchSensor } from "@dnd-kit/core";
import { BacklogItemCard } from "@/components/backlog-item-card";
import { DroppableMissionBlock } from "@/components/droppable-mission-block";
import { toast } from "sonner";
import { cn, calculateDynamicTimeChange } from "@/lib/utils";
import { CardHistory, CardLog } from "@/components/card-history";
import { SettingsDialog } from "@/components/settings-dialog";
import { TaskPickerDialog } from "@/components/task-picker-dialog";
import { DroppableBoundary } from "@/components/droppable-boundary";
import { RemindersComponent } from "@/components/reminders-component";

// Helper for Suggestions
function getBestSuggestion(tasks: BacklogTask[], maxDuration: number, mode: 'block' | 'gap', blockType?: string): BacklogTask | undefined {
    const candidates: any[] = [];

    tasks.forEach(t => {
        if (t.status !== 'pending') return;
        const duration = t.estimatedDuration || 30;

        // 1. Try Main Task
        if (duration <= maxDuration) {
            if (mode === 'block') {
                if (t.linkedBlockType && t.linkedBlockType !== blockType && t.linkedBlockType !== 'Geral') return;
                candidates.push(t);
            } else {
                candidates.push(t);
            }
        }
        // 2. Try Subtasks (If Main Task too big)
        else {
            if (t.subTasks && (t.subTasks as any[]).length > 0) {
                const subs = t.subTasks as any[];
                const firstPendingIndex = subs.findIndex(s => !s.done);

                if (firstPendingIndex !== -1) {
                    const sub = subs[firstPendingIndex];
                    const subDuration = parseInt(sub.duration) || 15;

                    if (subDuration <= maxDuration) {
                        // Check Block Type Constraint (inherited from parent)
                        if (mode === 'block') {
                            if (t.linkedBlockType && t.linkedBlockType !== blockType && t.linkedBlockType !== 'Geral') return;
                        }

                        // Create Virtual Task
                        candidates.push({
                            ...t,
                            id: `${t.id}-sub-${firstPendingIndex}`,
                            title: `${sub.title} - ${t.title}`,
                            estimatedDuration: subDuration,
                            isVirtual: true,
                            originalTaskId: t.id,
                            subTaskIndex: firstPendingIndex
                        });
                    }
                }
            }
        }
    });

    if (candidates.length === 0) return undefined;

    // Sorting Helper
    const priorityMap = { 'alta': 3, 'media': 2, 'baixa': 1 };

    return candidates.sort((a, b) => {
        // 1. Priority (Higher is better: alta > media > baixa)
        const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1, alta: 3, media: 2, baixa: 1 };

        const priorityA = a.priority?.toLowerCase() || 'medium';
        const priorityB = b.priority?.toLowerCase() || 'medium';

        const pA = priorityWeight[priorityA] || 1;
        const pB = priorityWeight[priorityB] || 1;

        if (pA !== pB) {
            return pB - pA; // Higher priority first
        }

        // 2. GAP Bonus: Prefer tasks without specific block (Geral)
        if (mode === 'gap') {
            const isGeralA = !a.linkedBlockType || a.linkedBlockType === 'Geral';
            const isGeralB = !b.linkedBlockType || b.linkedBlockType === 'Geral';
            if (isGeralA !== isGeralB) {
                return isGeralA ? -1 : 1; // General first
            }
        }

        // 3. Duration (If priority is equal)
        const dA = a.estimatedDuration || 30;
        const dB = b.estimatedDuration || 30;

        if (mode === 'block') {
            // Block: Longest time first (Descending)
            return dB - dA;
        } else {
            // Gap: Shortest time first (Ascending)
            return dA - dB;
        }
    })[0];
}

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
    currentDate,
    settings
}: {
    initialBlocks: MissionBlock[],
    initialBacklog: BacklogTask[],
    initialCards: TacticalCard[],
    initialStats: any[],
    userId: string,
    currentDate: string,
    settings: any
}) {
    const router = useRouter();
    const [selectedDate, setSelectedDate] = useState<string>(currentDate);
    const blocks = initialBlocks; // In a real app with optimization, might use optmistic updates


    // Time Tracking for Timeline
    const [currentMinutes, setCurrentMinutes] = useState(0);

    useEffect(() => {
        const updateTime = () => {
            const now = new Date();
            setCurrentMinutes(now.getHours() * 60 + now.getMinutes());
        };
        updateTime();
        const interval = setInterval(updateTime, 60000); // Update every minute
        return () => clearInterval(interval);
    }, []);

    // Check for past tasks to archive on mount
    useEffect(() => {
        checkAndArchivePastTasks(
            format(new Date(), 'yyyy-MM-dd'),
            format(new Date(), 'HH:mm')
        );
    }, []);

    // Auto-scroll logic for current time line
    useEffect(() => {
        setTimeout(() => {
            const timeLine = document.getElementById('current-time-line');
            if (timeLine) {
                timeLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 500);
    }, [selectedDate, currentDate]);

    const getMinutes = (time: string) => {
        const [h, m] = time.split(':').map(Number);
        return h * 60 + m;
    };

    const minutesToTime = (mins: number) => {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    };

    const PIXELS_PER_MINUTE = 2.5;

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



    const [activeTask, setActiveTask] = useState<BacklogTask | null>(null);
    const [taskPickerState, setTaskPickerState] = useState<{ open: boolean; startTime?: string; date?: string }>({ open: false });

    const sensors = useSensors(
        useSensor(MouseSensor, {
            activationConstraint: {
                distance: 10,
            },
        }),
        useSensor(TouchSensor, {
            activationConstraint: {
                delay: 250,
                tolerance: 5,
            },
        })
    );

    const handleDragStart = (event: DragStartEvent) => {
        if (event.active.data.current?.type === 'backlog-task') {
            setActiveTask(event.active.data.current.task as BacklogTask);
        }
    };

    const handleDragEnd = async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTask(null);

        if (over && active.data.current?.type === 'backlog-task' && over.data.current?.type === 'mission-block') {
            const taskId = active.id as string;
            const blockId = over.id as string;

            toast.promise(moveTaskToBlock(taskId, blockId), {
                loading: 'Movendo tarefa...',
                success: 'Tarefa movida para o bloco!',
                error: 'Erro ao mover tarefa'
            });
        }

        // Handle Drop to Gap
        if (over && active.data.current?.type === 'backlog-task' && over.data.current?.type === 'gap') {
            const taskId = active.id as string;
            const startTime = over.data.current.startTime as string; // HH:mm
            const gapDate = over.id.toString().split('gap-')[1].split('-')[0] + '-' + over.id.toString().split('gap-')[1].split('-')[1] + '-' + over.id.toString().split('gap-')[1].split('-')[2]; // Extract date? Or use selectedDate if easier. 
            // Better: gap id structure `gap-${date}-${startTime}`
            // id: gap-2023-10-10-09:00

            const uniqueGapId = over.id as string;
            // Gap ID format: `gap-${selectedDate}-${startTime}`
            // selectedDate is yyyy-MM-dd.
            // ID: gap-yyyy-MM-dd-HH:mm

            // Extract from ID is safer if date changes
            const parts = uniqueGapId.replace('gap-', '').split('-');
            // yyyy-MM-dd-HH:mm. 0=yyyy, 1=MM, 2=dd, 3=HH:mm (but : might be ok)
            // Wait, split('-') might break HH:mm if it uses :.
            // Let's use simpler ID constructing in loop.

            // Or just use selectedDate since gaps are only shown for selectedDate
            const date = selectedDate;

            toast.promise(convertTaskToBlock(taskId, date, startTime), {
                loading: 'Criando bloco...',
                success: 'Bloco criado!',
                error: 'Erro ao criar bloco'
            });
        }

        // Handle block time drag (dynamic scaling by distance)
        if (active.data.current?.type === 'mission-block-drag') {
            const block = active.data.current.block as MissionBlock;
            const [h, m] = block.startTime.split(':').map(Number);
            const originalMins = h * 60 + m;

            const deltaY = event.delta.y;
            const timeChangeMins = calculateDynamicTimeChange(deltaY, originalMins);

            if (timeChangeMins !== 0) {
                const totalMins = originalMins + timeChangeMins;

                // Ensure it stays within the same day
                if (totalMins >= 0 && totalMins < 24 * 60) {
                    const newH = Math.floor(totalMins / 60);
                    const newM = totalMins % 60;
                    const newTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;

                    toast.promise(updateMissionBlock(block.id, { startTime: newTime }), {
                        loading: 'Reprogramando...',
                        success: 'Horário ajustado!',
                        error: 'Erro ao ajustar horário'
                    });
                }
            }
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

    const [editingBlock, setEditingBlock] = useState<MissionBlock | null>(null);
    const [createDialogState, setCreateDialogState] = useState<{ open: boolean; startTime?: string; duration?: number }>({ open: false });
    const [createTaskOpen, setCreateTaskOpen] = useState(false);
    const [allBlockTypes, setAllBlockTypes] = useState<{ label: string; icon: string; color: string; value: string }[]>([]);

    useEffect(() => {
        getUniqueBlockTypes().then(setAllBlockTypes);
    }, []);

    const handleConvertToBlock = async (task: BacklogTask, targetDate?: string, targetTime?: string) => {
        const dateToUse = targetDate || taskPickerState.date;
        const timeToUse = targetTime || taskPickerState.startTime;

        if (!dateToUse || !timeToUse) return;

        toast.promise(convertTaskToBlock(task.id, dateToUse, timeToUse), {
            loading: 'Alocando tarefa...',
            success: 'Tarefa alocada na timeline!',
            error: 'Erro ao alocar tarefa'
        });
        setTaskPickerState(prev => ({ ...prev, open: false }));
    };

    return (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
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
                        {!focusMode && (
                            <SettingsDialog initialSettings={settings} />
                        )}
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
                                    "w-full overflow-x-auto pt-4 pb-4 custom-scrollbar flex gap-3 cursor-grab select-none active:cursor-grabbing",
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
                                <div className="p-6 border-b border-white/5 flex flex-col sm:flex-row justify-between items-center bg-[#050506]/95 backdrop-blur-md z-10 sticky top-0 gap-4 sm:gap-0">
                                    <h2 className="text-xl sm:text-2xl font-black uppercase italic text-white flex items-center gap-2">
                                        <CalendarIcon className="w-5 h-5 sm:w-6 sm:h-6 text-primary" />
                                        <span>Cronograma</span>
                                    </h2>
                                    <div className="flex items-center gap-2 w-full sm:w-auto">
                                        <Button
                                            size="sm"
                                            onClick={() => setCreateDialogState({ open: true })}
                                            className="bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black rounded-lg px-4 uppercase text-xs shadow-lg transition-transform hover:scale-105 flex-1 sm:flex-none"
                                        >
                                            + Agendar
                                        </Button>
                                        <Button
                                            size="icon"
                                            variant="secondary"
                                            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 shrink-0"
                                            onClick={() => setCreateTaskOpen(true)}
                                        >
                                            <Plus className="w-5 h-5" />
                                        </Button>
                                    </div>
                                </div>
                                <div className="flex-1 overflow-y-auto p-6 relative space-y-4 custom-scrollbar">
                                    <div className="absolute top-6 left-6 h-full w-[2px] bg-white/5 z-0"></div>
                                    {(() => {
                                        if (blocks.length === 0) {
                                            return (
                                                <>
                                                    <DroppableBoundary
                                                        id={`boundary-start-${selectedDate}`}
                                                        time={settings.timelineStart || '08:00'}
                                                        label="Início do Dia"
                                                    />
                                                    <div className="flex flex-col items-center justify-center h-48 text-zinc-500 mt-10 relative z-10">
                                                        <CalendarIcon className="h-12 w-12 mb-4 opacity-20" />
                                                        <p>Nenhuma missão para este dia.</p>
                                                    </div>
                                                    <DroppableBoundary
                                                        id={`boundary-end-${selectedDate}`}
                                                        time={settings.timelineEnd || '24:00'}
                                                        label="Fim do Dia"
                                                    />
                                                </>
                                            );
                                        }

                                        let startBoundaryRendered = false;
                                        let endBoundaryRendered = false;
                                        const timelineStartMins = getMinutes(settings.timelineStart || '08:00');
                                        const timelineEndMins = getMinutes(settings.timelineEnd || '24:00');

                                        const mapNodes = blocks.map((block, index) => {
                                            const blockStart = getMinutes(block.startTime);
                                            const prevBlock = index > 0 ? blocks[index - 1] : null;

                                            // Gap Logic: Between Blocks
                                            let gapStart = prevBlock ? getMinutes(prevBlock.startTime) + prevBlock.totalDuration : getMinutes(settings.timelineStart || '08:00');
                                            let showGap = false;
                                            let gapDuration = 0;

                                            if (blockStart > gapStart) {
                                                if (index >= 0) {
                                                    showGap = true;
                                                    gapDuration = blockStart - gapStart;
                                                }
                                            }

                                            // Current Time Logic
                                            const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');

                                            let effectiveGapStart = gapStart;
                                            let effectiveGapDuration = gapDuration;

                                            if (showGap && isToday && currentMinutes > gapStart) {
                                                if (currentMinutes < gapStart + gapDuration) {
                                                    effectiveGapStart = currentMinutes;
                                                    effectiveGapDuration = (gapStart + gapDuration) - currentMinutes;
                                                } else {
                                                    effectiveGapDuration = 0;
                                                }
                                            }

                                            const suggestedGapTask = effectiveGapDuration > 0 ? getBestSuggestion(initialBacklog, effectiveGapDuration, 'gap') : undefined;
                                            const isGapCurrent = isToday && currentMinutes >= gapStart && currentMinutes < (gapStart + gapDuration);
                                            const isBlockCurrent = isToday && currentMinutes >= blockStart && currentMinutes < (blockStart + block.totalDuration);
                                            const blockTimeOffset = isBlockCurrent ? currentMinutes - blockStart : undefined;

                                            const nodes: React.ReactNode[] = [];

                                            if (!startBoundaryRendered && blockStart >= timelineStartMins) {
                                                nodes.push(
                                                    <DroppableBoundary
                                                        key={`boundary-start-${selectedDate}`}
                                                        id={`boundary-start-${selectedDate}`}
                                                        time={settings.timelineStart || '08:00'}
                                                        label="Início do Dia"
                                                    />
                                                );
                                                startBoundaryRendered = true;
                                            }

                                            if (!endBoundaryRendered && blockStart >= timelineEndMins) {
                                                nodes.push(
                                                    <DroppableBoundary
                                                        key={`boundary-end-${selectedDate}`}
                                                        id={`boundary-end-${selectedDate}`}
                                                        time={settings.timelineEnd || '24:00'}
                                                        label="Fim do Dia"
                                                    />
                                                );
                                                endBoundaryRendered = true;
                                            }

                                            nodes.push(
                                                <div key={block.id}>
                                                    {/* Gap Indicator */}
                                                    {showGap && gapDuration > 0 && effectiveGapDuration > 0 && (
                                                        <DroppableGap
                                                            id={`gap-${selectedDate}-${minutesToTime(gapStart)}`}
                                                            durationMinutes={effectiveGapDuration}
                                                            startTime={minutesToTime(effectiveGapStart)}
                                                            suggestedTask={suggestedGapTask}
                                                            onConvertToBlock={(t) => handleConvertToBlock(t, selectedDate, minutesToTime(effectiveGapStart))}
                                                            onAddTask={() => setTaskPickerState({ open: true, startTime: minutesToTime(effectiveGapStart), date: selectedDate })}
                                                            isCurrent={isGapCurrent}
                                                        />
                                                    )}

                                                    {/* Conflict Indicator */}
                                                    {index > 0 && blockStart < gapStart && (
                                                        <div className="relative z-20 -mt-6 mb-2 flex justify-end pr-12 pointer-events-none">
                                                            <div className="bg-red-500 text-white text-[10px] font-black uppercase px-3 py-1 rounded-b-lg shadow-lg flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
                                                                <AlertTriangle className="w-3 h-3 text-white" fill="currentColor" />
                                                                <span>CONFLITO: {gapStart - blockStart} MIN</span>
                                                            </div>
                                                        </div>
                                                    )}

                                                    <DroppableMissionBlock
                                                        block={block}
                                                        onDelete={handleDelete}
                                                        onEdit={setEditingBlock}
                                                        pendingBacklogTasks={initialBacklog}
                                                        height={Math.max(80, block.totalDuration * PIXELS_PER_MINUTE)}
                                                        currentTimeOffset={blockTimeOffset}
                                                        isToday={isToday}
                                                        currentMinutes={currentMinutes}
                                                    />
                                                </div>
                                            );

                                            return <React.Fragment key={`frag-${block.id}`}>{nodes}</React.Fragment>;
                                        });

                                        const lastBlock = blocks[blocks.length - 1];
                                        const dayEndMins = getMinutes(settings.timelineEnd || '24:00');
                                        let finalGapStart = getMinutes(settings.timelineStart || '08:00');

                                        if (lastBlock) {
                                            finalGapStart = getMinutes(lastBlock.startTime) + lastBlock.totalDuration;
                                        }

                                        const finalGapDuration = dayEndMins - finalGapStart;
                                        const isToday = selectedDate === format(new Date(), 'yyyy-MM-dd');
                                        let finalEffectiveGapStart = finalGapStart;
                                        let finalEffectiveGapDuration = finalGapDuration;

                                        if (isToday && currentMinutes > finalGapStart) {
                                            if (currentMinutes < dayEndMins) {
                                                finalEffectiveGapStart = currentMinutes;
                                                finalEffectiveGapDuration = dayEndMins - currentMinutes;
                                            } else {
                                                finalEffectiveGapDuration = 0;
                                            }
                                        }

                                        const suggestedFinalGapTask = finalEffectiveGapDuration > 0 ? getBestSuggestion(initialBacklog, finalEffectiveGapDuration, 'gap') : undefined;
                                        const isFinalGapCurrent = isToday && currentMinutes >= finalGapStart && currentMinutes < dayEndMins;

                                        const finalNodes: React.ReactNode[] = [];

                                        if (!startBoundaryRendered) {
                                            finalNodes.push(
                                                <DroppableBoundary
                                                    key={`boundary-start-endofloop-${selectedDate}`}
                                                    id={`boundary-start-${selectedDate}`}
                                                    time={settings.timelineStart || '08:00'}
                                                    label="Início do Dia"
                                                />
                                            );
                                        }

                                        if (finalGapDuration > 0 && finalEffectiveGapDuration > 0) {
                                            finalNodes.push(
                                                <DroppableGap
                                                    key={`gap-final-${selectedDate}`}
                                                    id={`gap-${selectedDate}-${minutesToTime(finalGapStart)}`}
                                                    durationMinutes={finalEffectiveGapDuration}
                                                    startTime={minutesToTime(finalEffectiveGapStart)}
                                                    suggestedTask={suggestedFinalGapTask}
                                                    onConvertToBlock={(t) => handleConvertToBlock(t, selectedDate, minutesToTime(finalEffectiveGapStart))}
                                                    onAddTask={() => setTaskPickerState({ open: true, startTime: minutesToTime(finalEffectiveGapStart), date: selectedDate })}
                                                    isCurrent={isFinalGapCurrent}
                                                />
                                            );
                                        }

                                        if (!endBoundaryRendered) {
                                            finalNodes.push(
                                                <DroppableBoundary
                                                    key={`boundary-end-endofloop-${selectedDate}`}
                                                    id={`boundary-end-${selectedDate}`}
                                                    time={settings.timelineEnd || '24:00'}
                                                    label="Fim do Dia"
                                                />
                                            );
                                        }

                                        return (
                                            <>
                                                {mapNodes}
                                                {finalNodes}
                                            </>
                                        );
                                    })()}
                                    {/* Auto-scroll to Current Time */}
                                    <div id="scroll-target" />
                                    <div className="h-20"></div>
                                </div>
                            </div>
                        </div>

                        {/* RIGHT COLUMN: Tasks (Backlog) & Stats - Remaining Width */}
                        <div className={cn("flex-1 flex flex-col gap-6", focusMode ? "opacity-10 pointer-events-none blur-sm" : "")}>


                            {/* Backlog Section */}
                            <div className="flex-1 bg-[#050506] border border-white/5 rounded-3xl overflow-hidden flex flex-col h-[500px]">
                                <RemindersComponent currentDate={selectedDate} />
                                <BacklogComponent
                                    initialTasks={initialBacklog}
                                    availableBlockTypes={allBlockTypes}
                                />
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

                    {/* Create Dialog */}
                    <CreateBlockDialog
                        currentDate={selectedDate}
                        open={createDialogState.open}
                        onOpenChange={(open) => setCreateDialogState(prev => ({ ...prev, open }))}
                        defaultStartTime={createDialogState.startTime}
                        defaultDuration={createDialogState.duration}
                    />

                    <CreateTaskDialog
                        open={createTaskOpen}
                        onOpenChange={setCreateTaskOpen}
                        availableBlockTypes={allBlockTypes}
                    />

                    {/* Edit Dialog */}
                    {editingBlock && (
                        <CreateBlockDialog
                            currentDate={editingBlock.date}
                            blockToEdit={editingBlock}
                            open={true}
                            onOpenChange={(open) => !open && setEditingBlock(null)}
                        />
                    )}

                    <TaskPickerDialog
                        open={taskPickerState.open}
                        onOpenChange={(open) => setTaskPickerState(prev => ({ ...prev, open }))}
                        tasks={initialBacklog}
                        onSelect={handleConvertToBlock}
                    />

                </main>
            </div>
            <DragOverlay>
                {activeTask ? <BacklogItemCard task={activeTask} isDragging /> : null}
            </DragOverlay>
        </DndContext>
    );
}
