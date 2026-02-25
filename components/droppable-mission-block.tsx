"use client";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import { MissionBlock, toggleMissionBlock, assignTasksToBlock, updateMissionBlock, unassignTaskFromBlock, deleteMissionBlock, archiveMissionBlock, toggleSubTaskCompletion, toggleNestedSubTaskCompletion } from "@/lib/actions/mission.actions";
import { BLOCK_ICONS } from "./constants";
import { Zap, Trash2, Pencil, Check, Repeat, X, Plus, ChevronDown, ChevronUp, AlertTriangle, Archive, GripVertical, ArrowUp, ArrowDown, Pin, PinOff } from "lucide-react";
import { differenceInCalendarDays, parseISO } from "date-fns";
// ... (rest of imports)

// ... inside component ...


// Helper for Suggestions
function getBestSuggestion(tasks: BacklogTask[], maxDuration: number, mode: 'block' | 'gap', blockType?: string): BacklogTask | undefined {
    const candidates: any[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    tasks.forEach(t => {
        if (t.status !== 'pending') return;

        // Block type constraint
        if (mode === 'block' && t.linkedBlockType && t.linkedBlockType !== blockType && t.linkedBlockType !== 'Geral') return;

        const duration = t.estimatedDuration || 30;

        // 1. Try Main Task whole
        if (duration <= maxDuration) {
            candidates.push(t);
        }
        // 2. Try ONLY the first unsolved Subtask if the Main Task is too big
        else if (t.subTasks && (t.subTasks as any[]).length > 0) {
            const subs = t.subTasks as any[];
            const firstPendingIndex = subs.findIndex(s => !s.done);
            if (firstPendingIndex !== -1) {
                const sub = subs[firstPendingIndex];
                const subDuration = parseInt(sub.duration) || 15;
                if (subDuration <= maxDuration) {
                    candidates.push({
                        ...t,
                        id: `${t.id}-sub-${firstPendingIndex}`, // Virtual ID to distinguish
                        title: `${sub.title} - ${t.title}`,
                        estimatedDuration: subDuration,
                        isVirtual: true,
                        originalTaskId: t.id,
                        subTaskIndex: firstPendingIndex
                    });
                }
            }
        }
    });

    if (candidates.length === 0) return undefined;

    const getDeadlineScore = (deadline?: string) => {
        if (!deadline) return 0;
        const deadlineDate = parseISO(deadline);
        deadlineDate.setHours(0, 0, 0, 0);
        const daysLeft = differenceInCalendarDays(deadlineDate, today);
        if (daysLeft <= 1) return 1; // Red deadline (Atrasado, Hoje, Amanhã)
        return 0;
    };

    return candidates.sort((a, b) => {
        // 0. Deadline (Red Deadlines first -> 1 > 0)
        const deadlineA = getDeadlineScore(a.deadline);
        const deadlineB = getDeadlineScore(b.deadline);
        if (deadlineA !== deadlineB) {
            return deadlineB - deadlineA; // Higher score (1) comes first 
        }

        // 1. Priority (Higher is better: alta > media > baixa)
        const priorityWeight: Record<string, number> = { high: 3, medium: 2, low: 1, alta: 3, media: 2, baixa: 1 };
        const pA = priorityWeight[a.priority?.toLowerCase() || 'medium'] || 1;
        const pB = priorityWeight[b.priority?.toLowerCase() || 'medium'] || 1;
        if (pA !== pB) {
            return pB - pA; // Higher priority first
        }

        // 2. Duration (Maximize time usage! Largest possible fit wins among same priority tasks)
        const dA = a.estimatedDuration || 30;
        const dB = b.estimatedDuration || 30;
        if (dA !== dB) {
            return dB - dA; // Longest duration first (descending)
        }

        // 3. GAP Bonus: Prefer tasks without specific block (Geral)
        if (mode === 'gap') {
            const isGeralA = !a.linkedBlockType || a.linkedBlockType === 'Geral';
            const isGeralB = !b.linkedBlockType || b.linkedBlockType === 'Geral';
            if (isGeralA !== isGeralB) {
                return isGeralA ? -1 : 1; // General first
            }
        }

        return 0;
    })[0];
}

import { cn, calculateDynamicTimeChange } from "@/lib/utils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { BacklogTask } from "@/lib/actions/backlog.actions";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { CreateTaskDialog } from "@/components/create-task-dialog";
import { TaskExecutionDialog } from "./task-execution-dialog";

// ... imports

interface MissionBlockProps {
    block: MissionBlock;
    onDelete: (id: string) => void;
    onEdit?: (block: MissionBlock) => void;
    pendingBacklogTasks?: BacklogTask[];
    height?: number; // Visual height
    currentTimeOffset?: number; // Minutes into the block (if current)
}

export function DroppableMissionBlock({ block, onDelete, onEdit, pendingBacklogTasks = [], height, currentTimeOffset }: MissionBlockProps) {
    const { isOver, setNodeRef: setDroppableRef } = useDroppable({
        id: block.id,
        data: { type: 'mission-block', block }
    });

    const { attributes, listeners, setNodeRef: setDraggableRef, transform, isDragging } = useDraggable({
        id: `drag-${block.id}`,
        data: { type: 'mission-block-drag', block }
    });

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [addTasksDialogOpen, setAddTasksDialogOpen] = useState(false);
    const [createTaskDialogOpen, setCreateTaskDialogOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const [executionDialogOpen, setExecutionDialogOpen] = useState(false);
    const [executionData, setExecutionData] = useState<any>(null);

    const [optimisticCompleted, setOptimisticCompleted] = useState(block.status === 'completed');

    useEffect(() => {
        setOptimisticCompleted(block.status === 'completed');
    }, [block.status]);

    const glowColor = block.color || '#3b82f6';
    const isRecurring = block.type === 'recurring' || !!block.recurrencePattern;

    const handleToggle = async (e?: React.MouseEvent) => {
        e?.stopPropagation();
        const newState = !optimisticCompleted;
        setOptimisticCompleted(newState);

        try {
            await toggleMissionBlock(block.id, newState ? 'completed' : 'pending');
        } catch (error) {
            setOptimisticCompleted(!newState);
            toast.error("Erro ao atualizar status do bloco");
        }
    };

    const handleDelete = async (deleteAll: boolean = false) => {
        setDeleteDialogOpen(false);
        // Call onDelete with extra param or handle directly if possible.
        // Since onDelete prop signature is (id: string) => void, we might need to change the prop or handle it here if we imported the server action.
        // But onDelete is likely passed from DashboardClient.
        // Let's assume we need to call the server action directly here OR update the prop signature.
        // Given the architecture, it's cleaner if we handle it here or if DashboardClient passes a smarter handler.
        // However, looking at the code, onDelete is passed. Let's look at DashboardClient later.
        // Actually, we can just call the server action directly here for the specific logic if we want, OR pass a composite ID/flag.
        // But wait, the previous code called onDelete(block.id).

        // Let's modify this component to import deleteMissionBlock directly for this advanced logic, 
        // OR assume onDelete handles it. But DashboardClient's handleDelete just calls generic delete.
        // Let's use the server action directly for the advanced cases to avoid prop drilling complexity changes if possible,
        // BUT we need to be careful about state updates. revalidatePath handles it.

        // BETTER APPROACH: Call the server action directly here for the deletion logic, 
        // ignoring the onDelete prop for the actual action, but maybe calling it for optimistic UI if needed.
        // Actually, let's just stick to the server action.

        try {
            await deleteMissionBlock(block.id, deleteAll);
            toast.success("Bloco removido!");
        } catch (e) {
            toast.error("Erro ao remover.");
        }
    };

    const totalDuration = block.totalDuration;
    const subTasks = (block.subTasks as any[]) || [];
    const isFromTask = subTasks.some(s => s.isFromTask || s.originalTaskId); // Check if the block originated from a task

    // NEW ALGORITHM: Compute times and gaps
    const timeToMins = (t: string) => {
        const [h, m] = t.split(':').map(Number);
        return h * 60 + m;
    };
    const minsToTime = (m: number) => {
        const h = Math.floor(m / 60);
        const mins = m % 60;
        return `${String(h).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    };

    const blockStartMins = timeToMins(block.startTime);
    const blockEndMins = blockStartMins + totalDuration;
    let currentFlowMins = blockStartMins;

    const pinnedSegments: { start: number; end: number }[] = [];
    const computedTaskTimes: { start: number, end: number, isPinned: boolean }[] = [];

    // First pass: extract pinned slots
    subTasks.forEach((sub, i) => {
        if (sub.pinnedTime) {
            const start = timeToMins(sub.pinnedTime);
            const dur = parseInt(sub.duration || '0');
            pinnedSegments.push({ start, end: start + dur });
            computedTaskTimes[i] = { start, end: start + dur, isPinned: true };
        }
    });

    // Sort pinned segments by start time
    pinnedSegments.sort((a, b) => a.start - b.start);

    // Function to find next available slot for a duration
    const findNextAvailableSlot = (dur: number): number => {
        let searchPointer = blockStartMins;

        while (true) {
            // Check if `searchPointer` to `searchPointer + dur` overlaps with any occupied segment
            const overlap = pinnedSegments.find(seg =>
                (searchPointer < seg.end && (searchPointer + dur) > seg.start)
            );

            if (overlap) {
                // If overlap, jump searchPointer to the end of the overlapping segment
                searchPointer = overlap.end;
            } else {
                // Found a slot!
                return searchPointer;
            }
        }
    };

    // Second pass: placed unpinned tasks
    subTasks.forEach((sub, i) => {
        if (!computedTaskTimes[i]) {
            const dur = parseInt(sub.duration || '0');
            // Ensure segments are sorted by start time
            pinnedSegments.sort((a, b) => a.start - b.start);
            const start = findNextAvailableSlot(dur);
            computedTaskTimes[i] = { start, end: start + dur, isPinned: false };
            pinnedSegments.push({ start, end: start + dur }); // Treat placed unpinned task as a segment to avoid future collisions
        }
    });

    // Build processedSubTasks and SORT chronologically
    let processedSubTasks = subTasks.map((sub, i) => {
        const c = computedTaskTimes[i];
        return {
            ...sub,
            originalIndex: i,
            computedStart: c.start,
            computedEnd: c.end,
            isPastEnd: c.end > blockEndMins
        };
    });

    processedSubTasks.sort((a, b) => a.computedStart - b.computedStart);

    // Compute gaps after sorting chronologically
    let lastEnd = blockStartMins;
    processedSubTasks = processedSubTasks.map(sub => {
        let gapBefore = 0;
        let gapStartTime = 0;

        if (sub.computedStart > lastEnd) {
            gapBefore = sub.computedStart - lastEnd;
            gapStartTime = lastEnd;
        }

        lastEnd = Math.max(lastEnd, sub.computedEnd);

        return {
            ...sub,
            gapBefore,
            gapStartTime
        };
    });

    // update currentFlowMins to the max end time for conflict calculation
    currentFlowMins = lastEnd;

    const handleMove = async (index: number, direction: -1 | 1) => {
        const newSubTasks = [...subTasks];
        if (index + direction < 0 || index + direction >= newSubTasks.length) return;
        const temp = newSubTasks[index];
        newSubTasks[index] = newSubTasks[index + direction];
        newSubTasks[index + direction] = temp;
        await updateMissionBlock(block.id, { subTasks: newSubTasks });
    };

    const handlePinToggle = async (index: number, sub: any) => {
        if (sub.pinnedTime) {
            const newSubTasks = [...subTasks];
            const updatedSub = { ...newSubTasks[index] };
            delete updatedSub.pinnedTime;
            newSubTasks[index] = updatedSub;
            await updateMissionBlock(block.id, { subTasks: newSubTasks });
        } else {
            const input = window.prompt(`Digite o horário para cravar a tarefa "${sub.title}" no bloco (Formato: HH:MM):`, minsToTime(sub.computedStart || currentFlowMins));
            if (!input) return;
            if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(input)) {
                toast.error("Formato de hora inválido. Use HH:MM.");
                return;
            }
            const inputMins = timeToMins(input);
            if (inputMins < blockStartMins || inputMins > blockEndMins) {
                toast.error(`O horário deve estar dentro do limite do bloco (${block.startTime} às ${minsToTime(blockEndMins)}).`);
                return;
            }
            const newSubTasks = [...subTasks];
            newSubTasks[index] = { ...sub, pinnedTime: input };
            await updateMissionBlock(block.id, { subTasks: newSubTasks });
        }
    };

    // Calculate non-subtask time (remainder)
    const subTaskTotalDuration = subTasks.reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
    const remainder = Math.max(0, totalDuration - subTaskTotalDuration);

    // Conflict Check using actual flow time
    const neededTotalDuration = currentFlowMins - blockStartMins;
    const hasConflict = currentFlowMins > blockEndMins;

    const handleAutoResize = async () => {
        try {
            await updateMissionBlock(block.id, { totalDuration: neededTotalDuration });
            toast.success("Tempo do bloco ajustado!");
        } catch (error) {
            toast.error("Erro ao ajustar tempo.");
        }
    };

    // Calculate subtask vertical segments
    // We want the line to take up some vertical space.
    // If the card height is proportional, we can aim for the line to match the visual duration?
    // User said "3 pixels below the check showing the time space of internal tasks".
    // I will make a fixed height line or proportional max height.
    // Let's make it proportional to the list of subtasks.

    const availableTasksForBlock: any[] = [];
    pendingBacklogTasks.forEach((t) => {
        if (t.linkedBlockType === block.title && t.status === 'pending') {
            const tDuration = t.estimatedDuration || 30;
            if (remainder > 0 && tDuration > remainder) {
                // Main task exceeds remaining time. Try showing its subtasks instead.
                let addedSub = false;
                if (t.subTasks && (t.subTasks as any[]).length > 0) {
                    (t.subTasks as any[]).forEach((sub, index) => {
                        if (!sub.done) {
                            const subDur = parseInt(sub.duration) || 15;
                            if (subDur <= remainder) {
                                availableTasksForBlock.push({
                                    ...t,
                                    id: `${t.id}-sub-${index}`,
                                    title: `${sub.title} - ${t.title}`,
                                    estimatedDuration: subDur,
                                    isVirtual: true,
                                    originalTaskId: t.id,
                                    subTaskIndex: index,
                                    subTasks: t.subTasks // kept so it can be viewed in execution modal
                                });
                                addedSub = true;
                            }
                        }
                    });
                }
                if (!addedSub) {
                    // No subtasks fit, so just show the main task as a fallback
                    availableTasksForBlock.push(t);
                }
            } else {
                // Main task fits, so show it normally
                availableTasksForBlock.push(t);
            }
        }
    });
    const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

    const handleAddTasks = async () => {
        // ... (keep existing logic)
        if (selectedTasks.length === 0) return;
        const tasksToAssign = availableTasksForBlock.filter(t => selectedTasks.includes(t.id));
        const res = await assignTasksToBlock(block.id, tasksToAssign);
        if (res?.success) {
            toast.success("Tarefas adicionadas!");
            setAddTasksDialogOpen(false);
            setSelectedTasks([]);
        } else {
            toast.error("Erro ao adicionar.");
        }
    };

    // Dynamic Height Logic
    // Base height for 30m = 80px (from passed height prop or default)
    // Rule: +5% height for every extra 10 mins (beyond base 30m)
    const expandedHeight = height || 80;
    const baseHeight = 80;
    const extra10Segments = Math.max(0, (block.totalDuration - 30) / 10);
    const collapsedHeight = baseHeight * (1 + extra10Segments * 0.05);

    const currentHeight = expanded ? expandedHeight : collapsedHeight;

    // Style for Neon Border (Top, Bottom, Left)
    const containerStyle: React.CSSProperties = {
        '--block-color': glowColor,
        height: expanded ? 'auto' : `${currentHeight}px`,
        minHeight: expanded ? `${expandedHeight}px` : '0px',
        transition: expanded ? 'none' : 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)', // Disable transition on auto height to avoid snap
    } as React.CSSProperties;

    // Custom Border Logic
    // If completed: border-color + boxShadow. borders on T, B, L.
    const borderStyle = optimisticCompleted ? {
        borderTop: `2px solid ${glowColor}`,
        borderBottom: `2px solid ${glowColor}`,
        borderLeft: `2px solid ${glowColor}`,
        borderRight: 'none',
        boxShadow: `inset 6px 0 0 0 ${glowColor}, -2px 0 15px -2px ${glowColor}, 0 -4px 15px -2px ${glowColor}, 0 4px 15px -2px ${glowColor}`,
    } : {
        boxShadow: `0 4px 20px -5px ${glowColor}40`,
    };

    const suggestedTask = getBestSuggestion(availableTasksForBlock, remainder, 'block', block.title);

    const Icon = BLOCK_ICONS.find(i => i.name === block.icon)?.icon || Zap;

    // Calculate preview time during drag
    let displayTime = block.startTime;
    let isTimeChanged = false;
    let visualDeltaY = 0;

    if (isDragging && transform) {
        const [h, m] = block.startTime.split(':').map(Number);
        const originalMins = h * 60 + m;

        const deltaY = transform.y;
        const timeChangeMins = calculateDynamicTimeChange(deltaY, originalMins);
        visualDeltaY = deltaY; // Snap visually EXACTLY to the mouse cursor!

        if (timeChangeMins !== 0) {
            const totalMins = originalMins + timeChangeMins;
            if (totalMins >= 0 && totalMins < 24 * 60) {
                const newH = Math.floor(totalMins / 60);
                const newM = totalMins % 60;
                displayTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
                isTimeChanged = true;
            }
        }
    }

    return (
        <>
            <div
                ref={(node) => {
                    setDroppableRef(node);
                    setDraggableRef(node);
                }}
                className={cn("relative w-full group mb-4 pl-12 transition-opacity", isDragging ? "opacity-50 z-50" : "z-10")}
            >
                {/* Drag Handle */}
                <div
                    {...listeners}
                    {...attributes}
                    className="absolute left-2 top-0 bottom-0 flex items-center justify-center w-8 cursor-grab active:cursor-grabbing text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity z-50"
                    title="Arraste para ajustar o horário (15 em 15 min)"
                >
                    <GripVertical className="w-4 h-4" />
                </div>

                {/* Time Marker */}
                <span className={cn(
                    "text-[10px] font-mono absolute left-2 top-0 mt-3 w-8 text-right pointer-events-none transition-all",
                    isTimeChanged ? "text-amber-400 font-black scale-110 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" : "text-zinc-600 font-medium"
                )}
                    style={isTimeChanged ? { transform: `translate3d(0, ${visualDeltaY}px, 0)` } : undefined}>
                    {displayTime}
                </span>

                <div
                    onClick={() => setExpanded(!expanded)}
                    className={cn(
                        "relative overflow-visible rounded-2xl transition-all duration-300 cursor-pointer", // overflow-visible for shadow
                        optimisticCompleted ? "bg-[#050506]" : "bg-[var(--block-color)]",
                        isOver ? "scale-[1.02] ring-1 ring-white/20" : "hover:scale-[1.01]"
                    )}
                    style={{ ...containerStyle, ...borderStyle }}
                >
                    {/* Current Time Line Indicator */}
                    {currentTimeOffset !== undefined && (
                        <div
                            className="absolute left-0 w-full z-30 pointer-events-none flex items-center"
                            style={{ top: `${(currentTimeOffset / block.totalDuration) * 100}%` }}
                            id="current-time-line"
                        >
                            <div className="w-full h-[2px] bg-blue-500 shadow-[0_0_10px_2px_rgba(59,130,246,0.5)]"></div>
                            <div className="absolute -left-1.5 w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_2px_rgba(59,130,246,0.5)]"></div>
                        </div>
                    )}

                    <div className="p-4 flex gap-4 relative z-10 h-full">
                        {/* Column for Checkbox + Vertical Timeline */}
                        <div className="flex flex-col items-center gap-1 shrink-0">
                            {/* Checkbox */}
                            <div
                                onClick={handleToggle}
                                className={cn(
                                    "h-8 w-8 shrink-0 rounded-[8px] border-2 flex items-center justify-center cursor-pointer transition-all duration-300 z-20",
                                    optimisticCompleted
                                        ? "bg-[#050506] border-zinc-800"
                                        : "bg-transparent border-white/30 hover:bg-white/10"
                                )}
                            >
                                {optimisticCompleted && <Check className="h-5 w-5 text-white" strokeWidth={3} />}
                            </div>

                            {/* Vertical Timeline Removed */}
                        </div>

                        {/* Content Column */}
                        <div className="flex-1 min-w-0 flex flex-col h-full">

                            <div className="flex items-center gap-2 mb-1">
                                <Icon className={cn("w-5 h-5", optimisticCompleted ? "text-[var(--block-color)]" : "text-white")} />
                                <h3
                                    onClick={isFromTask ? (e) => {
                                        e.stopPropagation();
                                        setExecutionData({
                                            id: block.id,
                                            type: 'mission-block',
                                            title: block.title,
                                            description: (block as any).description || "",
                                            subTasks: block.subTasks as any[] || [],
                                            priority: (block as any).priority || 'media',
                                            linkedBlockType: (block as any).linkedBlockType || block.title,
                                            deadline: (block as any).deadline
                                        });
                                        setExecutionDialogOpen(true);
                                    } : undefined}
                                    className={cn(
                                        "text-lg font-black uppercase tracking-wider truncate transition-colors duration-300 inline-block w-fit max-w-full",
                                        isFromTask ? "cursor-pointer hover:underline hover:text-blue-400" : "",
                                        optimisticCompleted ? "text-[var(--block-color)] line-through" : "text-white"
                                    )}
                                    title={isFromTask ? "Executar Bloco" : undefined}
                                >
                                    {block.title}
                                </h3>
                                {isRecurring && (
                                    <Repeat className={cn("h-3 w-3", optimisticCompleted ? "text-[#3a3a3a]" : "text-white/60")} />
                                )}
                            </div>

                            <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-4 mb-1 sm:mb-2">
                                {/* Suggestion Buttons (Now inline, order 1 on mobile to appear above time) */}
                                <div className="flex items-center gap-1 sm:gap-2 order-1 sm:order-2 min-w-0">
                                    {suggestedTask && (
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            className="h-5 sm:h-6 text-[9px] sm:text-[10px] bg-white/10 hover:bg-white/20 text-white border border-white/5 py-0 px-1.5 sm:px-2 rounded-full shrink"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                toast.promise(assignTasksToBlock(block.id, [suggestedTask]), {
                                                    loading: 'Adicionando...',
                                                    success: 'Tarefa adicionada!',
                                                    error: 'Erro'
                                                });
                                            }}
                                        >
                                            <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-0.5 sm:mr-1 shrink-0" />
                                            <span className="truncate max-w-[60px] sm:max-w-none">{suggestedTask.title}</span>
                                        </Button>
                                    )}
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-5 sm:h-6 text-[9px] sm:text-[10px] bg-white/5 hover:bg-white/10 text-white/70 py-0 px-2 sm:px-3 rounded-full shrink-0"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setAddTasksDialogOpen(true);
                                        }}
                                    >
                                        <Plus className="w-2.5 h-2.5 sm:w-3 sm:h-3 mr-1 shrink-0 text-white/50" />
                                        <span>Organizar</span>
                                    </Button>
                                </div>

                                <div className={cn(
                                    "flex gap-2 text-[9px] sm:text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 order-2 sm:order-1",
                                    optimisticCompleted ? "text-[#3a3a3a]" : "text-white/60"
                                )}>
                                    <span>{block.totalDuration} MIN</span>
                                </div>
                            </div>

                            {/* Expanded Content: Subtasks List */}
                            {expanded && (
                                <div className="space-y-0 pt-2 border-t border-white/10 mt-auto animate-in fade-in duration-300">
                                    {subTasks.length === 0 ? (
                                        <p className="text-xs text-white/40 italic py-2">Nenhuma tarefa.</p>
                                    ) : (
                                        <div className="flex flex-col">
                                            {processedSubTasks.map((sub: any) => {
                                                const i = sub.originalIndex;
                                                return (
                                                    <div key={i} className="flex flex-col w-full">
                                                        {/* Gap Indicator */}
                                                        {sub.gapBefore > 0 && (
                                                            <div className="flex items-center gap-3 py-1 opacity-50 relative group">
                                                                <div className="w-[30px] text-right pt-[1px]">
                                                                    <span className="text-[9px] font-mono text-white/30 truncate">{sub.gapBefore}m</span>
                                                                </div>
                                                                <div className="flex flex-col items-center">
                                                                    <div className="w-[1px] bg-transparent border-l border-dashed border-white/20 h-4 ml-[0.5px]" />
                                                                </div>
                                                                <div className="text-[9px] text-white/30 flex-1 font-mono italic pl-2">
                                                                    Vazio: {minsToTime(sub.gapStartTime)} - {minsToTime(sub.gapStartTime + sub.gapBefore)}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className={cn("flex items-start gap-3 group/item relative", sub.isPastEnd && "opacity-60")}>
                                                            {sub.isPastEnd && (
                                                                <div className="absolute left-[-2px] bottom-0 w-[2px] h-full bg-red-500/50 rounded-full" title="Ultrapassa o horário final do bloco" />
                                                            )}
                                                            {/* Duration Column */}
                                                            <div className="w-[30px] text-right pt-[2px]">
                                                                <span className="text-[10px] font-mono text-white/40 group-hover/item:text-white/60 transition-colors block leading-none" title={sub.pinnedTime ? `Cravado: ${sub.pinnedTime}` : `Automático: ${minsToTime(sub.computedStart)}`}>
                                                                    {sub.duration}m
                                                                </span>
                                                            </div>

                                                            {/* Visual Bar Column */}
                                                            <div className="flex flex-col items-center pt-[2px]">
                                                                {/* The Bar */}
                                                                <div
                                                                    className={cn("w-1 rounded-full transition-all duration-300",
                                                                        optimisticCompleted ? "bg-white/20" : "bg-white/50",
                                                                        sub.done ? "bg-emerald-500/50" : ""
                                                                    )}
                                                                    style={{
                                                                        height: `${Math.max(12, parseInt(sub.duration) * 1.5)}px`
                                                                    }}
                                                                />
                                                            </div>

                                                            {/* Content Column */}
                                                            <div className="flex-1 min-w-0 pb-2 pt-[2px]">
                                                                <div className="flex items-start gap-2">
                                                                    {/* Checkbox for Subtask */}
                                                                    <div
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            const promise = toggleSubTaskCompletion(block.id, i, !!sub.done);
                                                                            // Optimistic update could be added locally but let's rely on revalidation for now or simple toast
                                                                            toast.promise(promise, {
                                                                                loading: 'Atualizando...',
                                                                                success: 'Atualizado!',
                                                                                error: 'Erro'
                                                                            });
                                                                        }}
                                                                        className={cn(
                                                                            "mt-0.5 w-3 h-3 rounded-[3px] border border-white/30 cursor-pointer flex items-center justify-center transition-colors hover:border-white/60 shrink-0",
                                                                            sub.done ? "bg-emerald-500 border-emerald-500" : "bg-transparent"
                                                                        )}
                                                                    >
                                                                        {sub.done && <Check className="w-2.5 h-2.5 text-black" strokeWidth={4} />}
                                                                    </div>

                                                                    <div className="flex-1 flex flex-col min-w-0">
                                                                        <div className="flex justify-between items-start gap-2">
                                                                            <span className={cn(
                                                                                "text-sm font-medium leading-none truncate transition-colors",
                                                                                "cursor-pointer hover:underline hover:text-blue-400",
                                                                                optimisticCompleted ? "line-through opacity-50 text-white/50" : "text-white/90",
                                                                                sub.done ? "line-through text-white/40" : ""
                                                                            )}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    setExecutionData({
                                                                                        id: block.id,
                                                                                        type: 'mission-subtask',
                                                                                        subTaskIndex: i,
                                                                                        title: sub.title,
                                                                                        linkedBlockType: sub.originalLinkedBlockType || (block as any).linkedBlockType || block.title,
                                                                                        description: sub.description || (block as any).description || "",
                                                                                        subTasks: sub.subTasks || [],
                                                                                        priority: sub.originalPriority || (block as any).priority || 'media',
                                                                                        deadline: sub.deadline || (block as any).deadline
                                                                                    });
                                                                                    setExecutionDialogOpen(true);
                                                                                }}
                                                                                title="Executar Tarefa"
                                                                            >
                                                                                {sub.title}
                                                                            </span>

                                                                            {/* Actions */}
                                                                            <div className="flex gap-1 shrink-0 opacity-100 lg:opacity-50 lg:group-hover/item:opacity-100 transition-all -mt-1">
                                                                                <button onClick={(e) => { e.stopPropagation(); handleMove(i, -1); }} disabled={i === 0} className="p-0.5 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="Subir (Ordem)">
                                                                                    <ArrowUp className="w-3 h-3 text-white/50" />
                                                                                </button>
                                                                                <button onClick={(e) => { e.stopPropagation(); handleMove(i, 1); }} disabled={i === processedSubTasks.length - 1} className="p-0.5 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed" title="Descer (Ordem)">
                                                                                    <ArrowDown className="w-3 h-3 text-white/50" />
                                                                                </button>
                                                                                <button onClick={(e) => { e.stopPropagation(); handlePinToggle(i, sub); }} className="p-0.5 hover:bg-white/10 rounded" title={sub.pinnedTime ? "Desafixar horário" : "Cravar (Fixar horário)"}>
                                                                                    {sub.pinnedTime ? <PinOff className="w-3 h-3 text-amber-500 hover:text-amber-400" /> : <Pin className="w-3 h-3 text-white/50 hover:text-white" />}
                                                                                </button>
                                                                                {sub.isFixed ? (
                                                                                    <div className="p-0.5 ml-1 inline-flex items-center" title="Tarefa fixa original do Bloco">
                                                                                        <Repeat className="w-3 h-3 text-white/30" />
                                                                                    </div>
                                                                                ) : (
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const promise = unassignTaskFromBlock(block.id, i, sub);
                                                                                            toast.promise(promise, {
                                                                                                loading: 'Arquivando...',
                                                                                                success: 'Tarefa arquivada!',
                                                                                                error: 'Erro ao arquivar'
                                                                                            });
                                                                                        }}
                                                                                        className="p-0.5 hover:bg-white/10 rounded ml-1"
                                                                                        title="Remover Tarefa"
                                                                                    >
                                                                                        <Archive className="w-3 h-3 text-white/50 hover:text-white" />
                                                                                    </button>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                        {/* Nested Sub-Tasks */}
                                                                        {(!sub.isVirtual || !sub.originalTaskId) && sub.subTasks && sub.subTasks.length > 0 && (
                                                                            <div className="mt-1 flex flex-col gap-1.5 animate-in slide-in-from-top-1 pl-1">
                                                                                {sub.subTasks.map((nested: any, j: number) => (
                                                                                    <div
                                                                                        key={j}
                                                                                        className="flex gap-2 items-start group/nested cursor-pointer"
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            toggleNestedSubTaskCompletion(block.id, i, j, !!nested.done);
                                                                                        }}
                                                                                    >
                                                                                        <div className={cn(
                                                                                            "w-3.5 h-3.5 mt-0.5 rounded-[3px] border transition-colors flex items-center justify-center shrink-0",
                                                                                            nested.done
                                                                                                ? "bg-emerald-500/50 border-emerald-500/50 group-hover/nested:bg-emerald-500 group-hover/nested:border-emerald-500"
                                                                                                : "border-white/20 bg-transparent group-hover/nested:border-white/40"
                                                                                        )}>
                                                                                            {nested.done && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
                                                                                        </div>
                                                                                        <span className={cn(
                                                                                            "text-[11px] leading-tight transition-colors",
                                                                                            nested.done ? "line-through text-white/30" : "text-white/60 group-hover/nested:text-white/80"
                                                                                        )}>
                                                                                            {nested.title}
                                                                                        </span>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                    {/* Conflict Warning */}
                                    {hasConflict && (
                                        <div className="mt-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20 flex flex-col gap-2 animate-pulse">
                                            <div className="flex items-center gap-2 text-red-400 text-xs font-bold uppercase">
                                                <AlertTriangle className="w-4 h-4" />
                                                <span>Conflito de Tempo</span>
                                            </div>
                                            <p className="text-[10px] text-red-300/80">
                                                O fluxo de tarefas exigirá ({neededTotalDuration}m) mas o bloco só possui ({totalDuration}m).
                                            </p>
                                            <Button
                                                size="sm"
                                                variant="destructive"
                                                className="h-6 text-[10px] uppercase font-bold w-full"
                                                onClick={(e) => { e.stopPropagation(); handleAutoResize(); }}
                                            >
                                                Aumentar para {neededTotalDuration} min
                                            </Button>
                                        </div>
                                    )}

                                    {/* Add Task Button Removed as requested */}
                                </div>
                            )}
                        </div>

                        {/* Actions (Slide in on hover / Display on expand on mobile) */}
                        <div className={cn(
                            "flex-col gap-2 transition-opacity absolute right-4 top-4 z-20",
                            expanded ? "flex opacity-100" : "hidden lg:flex lg:opacity-0 lg:group-hover:opacity-100"
                        )}>
                            {onEdit && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(block); }}
                                    className="p-1 hover:bg-white/20 rounded text-white/80 hover:text-white transition-colors"
                                    title="Editar bloco"
                                >
                                    <Pencil className="h-3 w-3" />
                                </button>
                            )}
                            {isFromTask && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const promise = archiveMissionBlock(block.id);
                                        toast.promise(promise, {
                                            loading: 'Arquivando bloco...',
                                            success: 'Bloco voltou para o backlog!',
                                            error: 'Erro ao arquivar'
                                        });
                                    }}
                                    className="p-1 hover:bg-emerald-500/20 rounded text-white/80 hover:text-emerald-500 transition-colors"
                                    title="Arquivar bloco (voltar para Tarefas)"
                                >
                                    <Archive className="h-3 w-3" />
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
                                className="p-1 hover:bg-red-500/20 rounded text-white/80 hover:text-red-500 transition-colors"
                                title="Excluir bloco definitivamente"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                    {/* No horizontal timeline */}
                </div>
            </div >

            {/* Dialogs... (keep existing) */}
            < Dialog open={addTasksDialogOpen} onOpenChange={setAddTasksDialogOpen} >
                <DialogContent className="bg-[#050506] border-white/10 text-white sm:max-w-[400px]">
                    <DialogHeader>
                        <div className="flex justify-between items-center pr-8">
                            <DialogTitle>Adicionar Tarefas</DialogTitle>
                            <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400"
                                onClick={() => setCreateTaskDialogOpen(true)}
                                title="Criar nova tarefa vinculada"
                            >
                                <Plus className="w-4 h-4" />
                            </Button>
                        </div>
                        <DialogDescription>Tarefas do backlog para {block.title}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[250px] bg-white/5 rounded-xl p-2">
                        {availableTasksForBlock.map(task => {
                            // Calculation Logic (same as BacklogItemCard)
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            let daysLeft: number | null = null;
                            if (task.deadline) {
                                const deadlineDate = parseISO(task.deadline);
                                deadlineDate.setHours(0, 0, 0, 0);
                                daysLeft = differenceInCalendarDays(deadlineDate, today);
                            }

                            let DangerIcon = null;
                            if (daysLeft !== null && daysLeft <= 5) {
                                const isRed = daysLeft <= 3;
                                DangerIcon = (
                                    <div className={cn("text-[10px] font-bold uppercase tracking-wider", isRed ? "text-red-500" : "text-amber-500")} title={`${daysLeft} dias restantes`}>
                                        <AlertTriangle className="w-4 h-4" strokeWidth={2.5} />
                                    </div>
                                );
                            }

                            let priorityColor = 'bg-amber-500';
                            switch (task.priority) {
                                case 'high': priorityColor = 'bg-red-500'; break;
                                case 'medium': priorityColor = 'bg-amber-500'; break;
                                case 'low': priorityColor = 'bg-emerald-500'; break;
                            }

                            return (
                                <div key={task.id} className="flex items-center gap-3 p-2 hover:bg-white/10 rounded-lg cursor-pointer transition-colors group" onClick={() => setSelectedTasks(p => p.includes(task.id) ? p.filter(x => x !== task.id) : [...p, task.id])}>
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <Checkbox checked={selectedTasks.includes(task.id)} className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                                        <span className={cn("text-sm truncate", selectedTasks.includes(task.id) && "text-primary font-medium")}>{task.title}</span>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        {DangerIcon}
                                        <div className={cn("w-2 h-2 rounded-full ring-1 ring-white/10 shadow-[0_0_8px_rgba(0,0,0,0.5)]", priorityColor)} title={`Prioridade: ${task.priority}`} />
                                    </div>
                                </div>
                            );
                        })}
                        {availableTasksForBlock.length === 0 && <p className="text-xs text-zinc-500 text-center py-4">Sem tarefas disponíveis.</p>}
                    </ScrollArea>
                    <DialogFooter>
                        <Button onClick={handleAddTasks}>Confirmar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog >

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent className="bg-[#050506] border-white/10 text-white group-data-[state=open]:animate-in group-data-[state=closed]:animate-out fade-in-0 zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2 duration-200">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-black uppercase text-red-500 italic flex items-center gap-2">
                            <Trash2 className="w-5 h-5" /> Excluir Recorrência
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            Este é um bloco recorrente. Como deseja prosseguir?
                        </DialogDescription>
                    </DialogHeader>

                    {isRecurring || (block.id.includes("-virtual-")) ? (
                        <div className="flex flex-col gap-3 pt-4">
                            <Button
                                variant="outline"
                                className="border-white/10 hover:bg-white/5 justify-start h-12 text-left font-bold"
                                onClick={() => handleDelete(false)}
                            >
                                <span className="flex flex-col items-start leading-none gap-1">
                                    <span>Deletar apenas este</span>
                                    <span className="text-[10px] text-zinc-500 font-normal uppercase">Cria uma exceção para hoje</span>
                                </span>
                            </Button>

                            <Button
                                variant="destructive"
                                className="justify-start h-12 text-left font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20 border"
                                onClick={() => handleDelete(true)}
                            >
                                <span className="flex flex-col items-start leading-none gap-1">
                                    <span>Deletar {block.recurrencePattern === 'weekdays' ? 'dias de semana' : 'toda a série'}</span>
                                    <span className="text-[10px] text-red-300/50 font-normal uppercase">Remove todas as ocorrências futuras</span>
                                </span>
                            </Button>

                            <Button variant="ghost" className="mt-2 text-zinc-500 hover:text-white" onClick={() => setDeleteDialogOpen(false)}>
                                Cancelar
                            </Button>
                        </div>
                    ) : (
                        <DialogFooter className="gap-2 sm:gap-0">
                            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                            <Button variant="destructive" onClick={() => handleDelete(false)}>Excluir Definitivamente</Button>
                        </DialogFooter>
                    )}
                </DialogContent>
            </Dialog>


            <CreateTaskDialog
                open={createTaskDialogOpen}
                onOpenChange={setCreateTaskDialogOpen}
                defaultLinkedBlockType={block.title}
            />

            <TaskExecutionDialog
                open={executionDialogOpen}
                onOpenChange={setExecutionDialogOpen}
                data={executionData}
            />
        </>
    );
}
// Helper...


// Helper for time calc
function addMinutes(time: string, mins: number) {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

