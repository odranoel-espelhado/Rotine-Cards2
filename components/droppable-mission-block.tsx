"use client";

import { useDroppable, useDraggable } from "@dnd-kit/core";
import { MissionBlock, toggleMissionBlock, assignTasksToBlock, updateMissionBlock, unassignTaskFromBlock, deleteMissionBlock, archiveMissionBlock, toggleSubTaskCompletion, toggleNestedSubTaskCompletion } from "@/lib/actions/mission.actions";
import { BLOCK_ICONS } from "./constants";
import { Zap, Trash2, Pencil, Check, Repeat, X, Plus, ChevronDown, ChevronUp, ChevronRight, AlertTriangle, Archive, GripVertical, ArrowUp, ArrowDown, Pin, PinOff } from "lucide-react";
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
        if (t.suggestible === false) return;

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
import { useState, useEffect, useRef } from "react";
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
    isToday?: boolean;
    currentMinutes?: number;
    conflictDuration?: number;
}

export function DroppableMissionBlock({ block, onDelete, onEdit, pendingBacklogTasks = [], height, currentTimeOffset, isToday, currentMinutes, conflictDuration }: MissionBlockProps) {
    const { isOver, setNodeRef: setDroppableRef } = useDroppable({
        id: block.id,
        data: { type: 'mission-block', block }
    });

    const [isTimeDragging, setIsTimeDragging] = useState(false);
    const [previewTime, setPreviewTime] = useState(block.startTime);
    const [visualDeltaY, setVisualDeltaY] = useState(0);
    const dragRef = useRef<{ startY: number, currentY: number, accumMins: number, timer: ReturnType<typeof setInterval> | null }>({ startY: 0, currentY: 0, accumMins: 0, timer: null });

    useEffect(() => {
        if (!isTimeDragging) setPreviewTime(block.startTime);
    }, [block.startTime, isTimeDragging]);

    const handlePointerDown = (e: React.PointerEvent) => {
        e.stopPropagation();
        setIsTimeDragging(true);

        const [h, m] = block.startTime.split(':').map(Number);
        dragRef.current.accumMins = h * 60 + m;
        dragRef.current.startY = e.clientY;
        dragRef.current.currentY = e.clientY;

        if (dragRef.current.timer) clearTimeout(dragRef.current.timer as any);

        const scheduleTick = () => {
            const deltaY = dragRef.current.currentY - dragRef.current.startY;
            setVisualDeltaY(deltaY);

            const absY = Math.abs(deltaY);
            const sign = Math.sign(deltaY);

            let velocity = 1; // Fixed 1-minute step
            let delay = 1000; // Default slow delay

            if (absY < 5) {
                velocity = 0; // Dead zone
            } else if (absY <= 25) {
                delay = 750; // Surgery-level precision (slightly faster than 800)
            } else if (absY <= 50) {
                delay = 300; // Much faster
            } else if (absY <= 80) {
                delay = 150;
            } else if (absY <= 120) {
                delay = 80;
            } else if (absY <= 180) {
                delay = 40;
            } else if (absY <= 250) {
                delay = 20;
            } else {
                delay = 10;  // Maximum speed (100 ticks/sec)
            }

            if (velocity > 0) {
                dragRef.current.accumMins += sign * velocity;
                let boundedMins = Math.max(0, Math.min(24 * 60 - 1, dragRef.current.accumMins));
                dragRef.current.accumMins = boundedMins;

                const newH = Math.floor(boundedMins / 60);
                const newM = Math.floor(boundedMins % 60);
                setPreviewTime(`${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`);
            }

            dragRef.current.timer = setTimeout(scheduleTick, delay);
        };

        dragRef.current.timer = setTimeout(scheduleTick, 250);

        const onPointerMove = (ev: PointerEvent) => {
            dragRef.current.currentY = ev.clientY;
        };

        const onPointerUp = () => {
            if (dragRef.current.timer) clearTimeout(dragRef.current.timer as any);
            setIsTimeDragging(false);
            setVisualDeltaY(0);

            document.removeEventListener('pointermove', onPointerMove);
            document.removeEventListener('pointerup', onPointerUp);

            let finalMins = Math.round(dragRef.current.accumMins / 5) * 5;
            finalMins = Math.max(0, Math.min(24 * 60 - 1, finalMins));
            const newH = Math.floor(finalMins / 60);
            const newM = finalMins % 60;
            const finalTime = `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;

            if (finalTime !== block.startTime) {
                toast.promise(updateMissionBlock(block.id, { startTime: finalTime }), {
                    loading: 'Reprogramando...',
                    success: 'Horário ajustado!',
                    error: 'Erro ao ajustar horário'
                });
            }
        };

        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
    };

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

    const isGeral = block.color === '#27272a' || block.linkedBlockType === 'none' || block.linkedBlockType === 'Geral' || block.title === 'Geral';
    const glowColor = block.color || (isGeral ? '#27272a' : '#3b82f6');
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

    const handleDelete = async (deleteMode: 'single' | 'forward' | 'all' = 'single') => {
        setDeleteDialogOpen(false);

        try {
            await deleteMissionBlock(block.id, deleteMode);
            toast.success("Bloco removido!");
        } catch (e) {
            toast.error("Erro ao remover.");
        }
    };

    const totalDuration = block.totalDuration;
    const subTasks = (block.subTasks as any[]) || [];
    const isFromTask = !isRecurring && subTasks.some(s => (s.isFromTask || s.originalTaskId) && s.title === block.title); // True ONLY if the block was generated from the task directly

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

    const findNextAvailableSlotReverse = (dur: number): number => {
        let searchPointer = blockEndMins;

        // Reverse check through blocks (we must find overlap starting from end)
        while (true) {
            const overlap = pinnedSegments.slice().reverse().find(seg =>
                ((searchPointer - dur) < seg.end && searchPointer > seg.start)
            );

            if (overlap) {
                // If overlap, jump searchPointer to the start of the overlapping segment
                searchPointer = overlap.start;
            } else {
                return searchPointer - dur; // Return the start time of the found reversed slot
            }
        }
    };

    // Second pass: placed unpinned tasks
    subTasks.forEach((sub, i) => {
        if (!computedTaskTimes[i]) {
            const dur = parseInt(sub.duration || '0');
            // Ensure segments are sorted by start time
            pinnedSegments.sort((a, b) => a.start - b.start);
            const start = sub.orderDir === 'down' ? findNextAvailableSlotReverse(dur) : findNextAvailableSlot(dur);
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

    // Notification Logic
    useEffect(() => {
        if (!isToday || currentMinutes === undefined) return;

        processedSubTasks.forEach((sub: any, i: number) => {
            const taskNotifs = sub.notifications || (sub.remindMe ? [sub.remindMe] : null);
            if (sub.done || !taskNotifs || !Array.isArray(taskNotifs)) return;

            taskNotifs.forEach((notifyMin: number) => {
                const notifyTime = sub.computedStart - notifyMin;

                // Only fire if we precisely bounded to notifyTime (+ up to 1 mins window for safety)
                if (currentMinutes >= notifyTime && currentMinutes <= notifyTime + 1) {
                    const key = `notified-${block.id}-${sub.originalTaskId || sub.title}-${notifyTime}-${new Date().toDateString()}`;
                    if (!localStorage.getItem(key)) {
                        const timeText = notifyMin === 0 ? "agorinha" : `em ${notifyMin} minutos`;
                        if (typeof window !== "undefined" && "Notification" in window && Notification.permission === 'granted') {
                            try {
                                new Notification("Rotine Cards: Lembrete", {
                                    body: `A tarefa "${sub.title}" começará ${timeText}.`,
                                    icon: "/favicon.ico"
                                });
                            } catch (e) {
                                console.error("Notificação direta falhou (Mobile Chrome limitation), tentando fallback:", e);
                                if ('serviceWorker' in navigator) {
                                    navigator.serviceWorker.ready.then(reg => {
                                        reg.showNotification("Rotine Cards: Lembrete", {
                                            body: `A tarefa "${sub.title}" começará ${timeText}.`,
                                            icon: "/favicon.ico"
                                        });
                                    }).catch(err => console.error("Fallback do SW também falhou:", err));
                                }
                            }
                        }
                        localStorage.setItem(key, "1");
                    }
                }
            });
        });
    }, [currentMinutes, isToday, processedSubTasks, block.id]);

    const handleMove = async (index: number, direction: -1 | 1) => {
        const newSubTasks = [...subTasks];
        if (index + direction < 0 || index + direction >= newSubTasks.length) return;
        const temp = { ...newSubTasks[index] };
        newSubTasks[index] = { ...newSubTasks[index + direction] };
        newSubTasks[index + direction] = temp;

        // Remove 'orderDir' from both items specifically when user explicitly defines their visual order placement
        delete newSubTasks[index].orderDir;
        delete newSubTasks[index + direction].orderDir;

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

    const availableTasksForBlock = pendingBacklogTasks.filter(
        (t) => t.linkedBlockType === block.title && t.status === 'pending'
    );
    const [selectedTasks, setSelectedTasks] = useState<string[]>([]);
    const [expandedTaskIds, setExpandedTaskIds] = useState<string[]>([]);

    const selectedDuration = selectedTasks.reduce((acc, selectedId) => {
        if (selectedId.includes(':sub:')) {
            const [taskId, subIndexStr] = selectedId.split(':sub:');
            const subIndex = parseInt(subIndexStr);
            const parentTask = availableTasksForBlock.find(t => t.id === taskId);
            if (parentTask?.subTasks?.[subIndex]) {
                return acc + (parseInt(parentTask.subTasks[subIndex].duration) || 15);
            }
            return acc;
        }
        const task = availableTasksForBlock.find(t => t.id === selectedId);
        return acc + (task?.estimatedDuration || 30);
    }, 0);

    const handleAddTasks = async () => {
        if (selectedTasks.length === 0) return;

        const tasksToAssign: any[] = [];
        selectedTasks.forEach(selectedId => {
            if (selectedId.includes(':sub:')) {
                // Individual Subtask
                const [taskId, subIndexStr] = selectedId.split(':sub:');
                const subIndex = parseInt(subIndexStr);
                const parentTask = availableTasksForBlock.find(t => t.id === taskId);
                if (parentTask && parentTask.subTasks && parentTask.subTasks[subIndex]) {
                    const sub = parentTask.subTasks[subIndex];
                    tasksToAssign.push({
                        ...parentTask,
                        id: `${parentTask.id}-sub-${subIndex}`,
                        title: `${sub.title} - ${parentTask.title}`,
                        estimatedDuration: parseInt(sub.duration) || 15,
                        isVirtual: true,
                        originalTaskId: parentTask.id,
                        subTaskIndex: subIndex,
                        subTasks: parentTask.subTasks
                    });
                }
            } else {
                // Main Task
                const task = availableTasksForBlock.find(t => t.id === selectedId);
                if (task) {
                    tasksToAssign.push(task);
                }
            }
        });

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
    const isPlatinumGlow = isFromTask && glowColor === '#27272a';
    
    // Special Style for Rest Block
    const isRestBlock = block.title === 'Descanso Tático';
    const activeGlowColor = isRestBlock ? '#10b981' : (isPlatinumGlow ? '#d4d4d8' : glowColor);

    const borderStyle = optimisticCompleted ? {
        borderTop: `2px solid ${activeGlowColor}`,
        borderBottom: `2px solid ${activeGlowColor}`,
        borderLeft: `2px solid ${activeGlowColor}`,
        borderRight: 'none',
        boxShadow: `inset 6px 0 0 0 ${activeGlowColor}, -2px 0 15px -2px ${activeGlowColor}, 0 -4px 15px -2px ${activeGlowColor}, 0 4px 15px -2px ${activeGlowColor}`,
    } : {
        boxShadow: `0 4px 20px -5px ${activeGlowColor}40`,
        ...(isRestBlock && {
            borderLeft: `3px solid ${activeGlowColor}`,
            background: 'linear-gradient(90deg, rgba(16,185,129,0.1) 0%, rgba(5,5,6,1) 100%)'
        })
    };

    const suggestedTask = getBestSuggestion(availableTasksForBlock, remainder, 'block', block.title);

    const Icon = BLOCK_ICONS.find(i => i.name === block.icon)?.icon || Zap;

    // Calculate preview time during drag
    const displayTime = isTimeDragging ? previewTime : block.startTime;
    const isTimeChanged = isTimeDragging && previewTime !== block.startTime;

    return (
        <>
        <div
            ref={(node) => {
                setDroppableRef(node);
            }}
            className={cn("relative w-full group mb-4 pl-9 sm:pl-12 pr-8 sm:pr-0 transition-opacity", isTimeDragging ? "opacity-50 z-50" : "z-10")}
        >
            {/* Drag Handle */}
            <div
                onPointerDown={handlePointerDown}
                className="absolute left-1 top-0 bottom-0 flex items-center justify-center w-8 cursor-ns-resize text-zinc-600 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity z-50 touch-none"
                title="Segure e arraste o mouse para cima/baixo para rolar o horário infinito"
            >
                <GripVertical className="w-4 h-4" />
            </div>

            {/* Time Marker */}
            <span className={cn(
                "text-xs font-mono absolute left-1 sm:left-2 top-0 mt-3 w-8 text-right pointer-events-none transition-all",
                isTimeChanged ? "text-amber-400 font-black scale-110 drop-shadow-[0_0_8px_rgba(251,191,36,0.8)]" : "text-zinc-600 font-medium"
            )}>
                {displayTime}
            </span>

            <div
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    "relative overflow-visible rounded-2xl transition-all duration-300 cursor-pointer mr-[2px] sm:mr-0", // overflow-visible for shadow
                    isRestBlock ? "" : (optimisticCompleted ? "bg-[#050506]" : "bg-[var(--block-color)]"),
                    isOver ? "scale-[1.02] ring-1 ring-white/20" : "hover:scale-[1.01]"
                )}
                style={{ ...containerStyle, ...borderStyle }}
            >
                {/* Cyberpunk Contamination Overlay & Badge */}
                {(conflictDuration || 0) > 0 && (
                    <>
                        <div 
                            className="cyber-contamination-zone rounded-t-2xl"
                            style={{ height: `${Math.min(100, ((conflictDuration || 0) / block.totalDuration) * 100)}%` }}
                        />
                        <div className="absolute -top-3 right-4 z-[60] pointer-events-none">
                            <div className="cyber-conflict-badge-mini text-[9px] font-black uppercase px-2 py-0.5 rounded flex items-center gap-1">
                                <AlertTriangle className="w-3 h-3" />
                                CONFLITO: {conflictDuration} M
                            </div>
                        </div>
                    </>
                )}
                {/* Current Time Line Indicator */}
                {currentTimeOffset !== undefined && (
                    <div
                        className="absolute left-0 w-full z-30 pointer-events-none flex items-center"
                        style={{ top: `${(currentTimeOffset / block.totalDuration) * 100}%` }}
                        id="current-time-line"
                    >
                        <div className="w-full h-[2px] bg-blue-500 shadow-[0_0_10px_2px_rgba(59,130,246,0.5)]"></div>
                        <div className="absolute -left-1.5 flex flex-col items-center">
                            <span className="text-[10px] font-black text-blue-400 absolute -top-4 whitespace-nowrap drop-shadow-[0_0_5px_rgba(96,165,250,0.8)]">
                                {minsToTime(currentMinutes || 0)}
                            </span>
                            <div className="w-3 h-3 bg-blue-500 rounded-full shadow-[0_0_10px_2px_rgba(59,130,246,0.5)]"></div>
                        </div>
                    </div>
                )}

                <div className="pl-[7px] pr-1 py-4 sm:p-4 flex gap-1 sm:gap-4 relative z-10 h-full">
                        {/* Column for Checkbox + Vertical Timeline */}
                        {!isRestBlock && (
                            <div className="flex flex-col items-center gap-1 shrink-0">
                                {/* Checkbox */}
                                <div
                                    onClick={handleToggle}
                                    className={cn(
                                        "h-6 w-6 sm:h-8 sm:w-8 shrink-0 rounded-[8px] border-2 flex items-center justify-center cursor-pointer transition-all duration-300 z-20",
                                        optimisticCompleted
                                            ? (isPlatinumGlow ? "bg-zinc-200 border-white shadow-[0_0_15px_rgba(212,212,216,0.8)]" : "bg-[#050506] border-[var(--block-color)] shadow-[0_0_15px_var(--block-color)]")
                                            : "bg-transparent border-white/30 hover:bg-white/10"
                                    )}
                                >
                                    {optimisticCompleted && <Check className={cn("h-4 w-4 sm:h-5 sm:w-5", isPlatinumGlow ? "text-zinc-900 drop-shadow-[0_0_8px_rgba(0,0,0,0.8)]" : "text-white")} strokeWidth={4} />}
                                </div>
                            </div>
                        )}

                        {/* Content Column */}
                        <div className="flex-1 min-w-0 flex flex-col h-full">

                            <div className="flex items-center gap-2 mb-1">
                                <Icon className={cn("w-5 h-5 transition-all duration-300", 
                                    isRestBlock ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]" : 
                                    (optimisticCompleted ? (isPlatinumGlow ? "text-zinc-200 drop-shadow-[0_0_15px_rgba(212,212,216,0.8)]" : "text-[var(--block-color)]") : "text-white")
                                )} />
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
                                        isRestBlock ? "text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]" :
                                        (optimisticCompleted ? (isPlatinumGlow ? "text-zinc-200 drop-shadow-[0_0_15px_rgba(212,212,216,0.8)] line-through" : "text-[var(--block-color)] line-through") : "text-white")
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
                                {!isRestBlock && (
                                    <div className="flex items-center gap-1 sm:gap-2 order-1 sm:order-2 min-w-0">
                                        {suggestedTask && (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-5 sm:h-6 text-[9px] sm:text-[10px] bg-white/10 hover:bg-white/20 text-white border border-white/5 py-0 px-1.5 sm:px-2 rounded-full shrink"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toast.promise(assignTasksToBlock(block.id, [suggestedTask as any]), {
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
                                )}

                                <div className={cn(
                                    "hidden sm:flex gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 sm:order-1",
                                    optimisticCompleted ? "text-[#3a3a3a]" : "text-white/60"
                                )}>
                                    <span>{block.totalDuration} MIN</span>
                                </div>
                            </div>

                            {/* Expanded Content: Subtasks List or Rest Description */}
                            {expanded && isRestBlock && (
                                <div className="space-y-0 pt-2 border-t border-emerald-500/20 mt-auto animate-in fade-in duration-300">
                                    <p className="text-xs text-emerald-500/80 italic py-2">
                                        {(block as any).description || "Pausa para descanso."}
                                    </p>
                                </div>
                            )}

                            {expanded && !isRestBlock && (
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
                                                                <div className="w-[24px] text-right pt-[1px]">
                                                                    <span className="text-[9px] font-mono text-white/30 truncate">{sub.gapBefore}m</span>
                                                                </div>
                                                                <div className="flex flex-col items-center h-full justify-center">
                                                                    <div
                                                                        className="w-[1px] bg-transparent border-l border-dashed border-white/20 ml-[0.5px]"
                                                                        style={{ height: `${Math.max(16, sub.gapBefore * 1.5)}px` }}
                                                                    />
                                                                </div>
                                                                <div className="text-[9px] text-white/30 flex-1 font-mono italic pl-2">
                                                                    Vazio: {minsToTime(sub.gapStartTime)} - {minsToTime(sub.gapStartTime + sub.gapBefore)}
                                                                </div>
                                                            </div>
                                                        )}

                                                        <div className={cn("flex items-start gap-1 sm:gap-2 md:gap-3 group/item relative", sub.isPastEnd && "opacity-60")}>
                                                            {sub.isPastEnd && (
                                                                <div className="absolute left-[-2px] bottom-0 w-[2px] h-full bg-red-500/50 rounded-full" title="Ultrapassa o horário final do bloco" />
                                                            )}

                                                            {/* MD-HIDDEN ARROWS (MOBILE LEFT COLUMN) */}
                                                            <div className="flex md:hidden flex-col gap-1 items-center shrink-0 pt-0.5">
                                                                <button onClick={(e) => { e.stopPropagation(); handleMove(i, -1); }} disabled={i === 0} className="p-0.5 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed">
                                                                    <ArrowUp className="w-2.5 h-2.5 text-white/50" />
                                                                </button>
                                                                <button onClick={(e) => { e.stopPropagation(); handleMove(i, 1); }} disabled={i === processedSubTasks.length - 1} className="p-0.5 hover:bg-white/10 rounded disabled:opacity-30 disabled:cursor-not-allowed">
                                                                    <ArrowDown className="w-2.5 h-2.5 text-white/50" />
                                                                </button>
                                                            </div>

                                                            {/* Duration Column */}
                                                            <div className="w-[24px] sm:w-[30px] text-right pt-[2px]">
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
                                                                                "text-sm font-medium leading-none truncate transition-colors flex items-center gap-1.5",
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
                                                                                <span className="truncate">{sub.title}</span>
                                                                                {sub.isFixed && <span title="Tarefa Recorrente Padrão" className="flex items-center"><Repeat className="w-3 h-3 text-white/30 shrink-0" /></span>}
                                                                            </span>

                                                                            {/* Actions - DESKTOP ONLY (Arrows + Pin + Trash) */}
                                                                            <div className="hidden md:flex gap-1 shrink-0 opacity-100 lg:opacity-50 lg:group-hover/item:opacity-100 transition-all -mt-1">
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
                                                                                    <button
                                                                                        onClick={(e) => {
                                                                                            e.stopPropagation();
                                                                                            const promise = unassignTaskFromBlock(block.id, i, sub);
                                                                                            toast.promise(promise, {
                                                                                                loading: 'Excluindo Tarefa Recorrente...',
                                                                                                success: 'Tarefa excluída!',
                                                                                                error: 'Erro ao excluir'
                                                                                            });
                                                                                        }}
                                                                                        className="p-0.5 hover:bg-white/10 rounded ml-1"
                                                                                        title="Excluir Tarefa Padrão"
                                                                                    >
                                                                                        <Trash2 className="w-3 h-3 text-red-400 hover:text-red-300" />
                                                                                    </button>
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

                                                                        {/* MOBILE ONLY ACTIONS (Below Title, starting from right) */}
                                                                        <div className="flex md:hidden justify-end gap-3 mt-1 mr-1">
                                                                            <button onClick={(e) => { e.stopPropagation(); handlePinToggle(i, sub); }} className="p-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 shadow-sm flex items-center gap-1.5" title={sub.pinnedTime ? "Desafixar horário" : "Cravar (Fixar horário)"}>
                                                                                {sub.pinnedTime ? <PinOff className="w-3 h-3 text-amber-500" /> : <Pin className="w-3 h-3 text-white/50" />}
                                                                            </button>
                                                                            {sub.isFixed ? (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const promise = unassignTaskFromBlock(block.id, i, sub);
                                                                                        toast.promise(promise, { loading: 'Excluindo...', success: 'Excluída!', error: 'Erro' });
                                                                                    }}
                                                                                    className="p-1 bg-white/5 hover:bg-red-500/20 rounded border border-white/5 shadow-sm"
                                                                                >
                                                                                    <Trash2 className="w-3 h-3 text-red-500/70" />
                                                                                </button>
                                                                            ) : (
                                                                                <button
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const promise = unassignTaskFromBlock(block.id, i, sub);
                                                                                        toast.promise(promise, { loading: 'Arquivando...', success: 'Arquivada!', error: 'Erro' });
                                                                                    }}
                                                                                    className="p-1 bg-white/5 hover:bg-white/10 rounded border border-white/5 shadow-sm"
                                                                                >
                                                                                    <Archive className="w-3 h-3 text-white/50" />
                                                                                </button>
                                                                            )}
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
                </div>
                {/* Duration Display for Mobile (Outside Block) */}
                <div className="sm:hidden absolute right-0 top-1/2 -translate-y-1/2 flex flex-col items-center leading-none text-white/40 font-black">
                    <span className="text-[14px]">{block.totalDuration}</span>
                    <span className="text-[8px] mt-0.5 tracking-widest uppercase">Min</span>
                </div>
            </div>

            {/* Dialogs... (keep existing) */}
            <Dialog open={addTasksDialogOpen} onOpenChange={setAddTasksDialogOpen}>
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
                    {/* Time Indicator */}
                    {(() => {
                        const x = subTaskTotalDuration;
                        const y = selectedDuration;
                        const total = block.totalDuration;
                        const isOverflow = (x + y) > total;
                        const xPct = Math.min((x / total) * 100, 100);
                        const yPct = Math.min((y / total) * 100, 100 - xPct);
                        const freePct = Math.max(100 - xPct - yPct, 0);
                        const selColor = isOverflow ? '#ef4444' : '#22c55e';
                        const textColor = isOverflow ? 'text-red-400' : 'text-white';

                        return (
                            <div className="px-1 pb-2">
                                <div className="flex justify-between items-center mb-1.5">
                                    <span className="text-[10px] text-white/50 uppercase tracking-wider">Tempo do bloco</span>
                                    <span className={cn("text-[11px] font-bold font-mono", textColor)}>
                                        {x + y} / {total} min{isOverflow ? ' ⚠' : ''}
                                    </span>
                                </div>
                                <div className="h-1.5 rounded-full overflow-hidden flex bg-white/10">
                                    {xPct > 0 && (
                                        <div style={{ width: `${xPct}%`, background: '#3b82f6' }} />
                                    )}
                                    {yPct > 0 && (
                                        <div style={{ width: `${yPct}%`, background: selColor, opacity: 0.85 }} />
                                    )}
                                </div>
                                <div className="flex gap-3 mt-1.5">
                                    <span className="text-[9px] text-blue-400">■ {x} min ocupado</span>
                                    {y > 0 && (
                                        <span className={cn("text-[9px]", isOverflow ? 'text-red-400' : 'text-emerald-400')}>
                                            ■ {y} min selecionado
                                        </span>
                                    )}
                                    {freePct > 0 && (
                                        <span className="text-[9px] text-white/30">□ {Math.max(total - x - y, 0)} min livre</span>
                                    )}
                                </div>
                            </div>
                        );
                    })()}
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

                            const hasSubTasks = task.subTasks && (task.subTasks as any[]).length > 0 && !task.isVirtual;
                            const isExpanded = expandedTaskIds.includes(task.id);

                            return (
                                <div key={task.id} className="flex flex-col border-b border-white/5 last:border-0">
                                    <div 
                                        className="flex items-center gap-2 p-2 hover:bg-white/10 rounded-lg cursor-pointer transition-colors group" 
                                        onClick={() => {
                                            setSelectedTasks(p => {
                                                const isSelecting = !p.includes(task.id);
                                                if (isSelecting) {
                                                    // Deselect all its subtasks if selecting main
                                                    const filtered = p.filter(id => !id.startsWith(`${task.id}:sub:`));
                                                    return [...filtered, task.id];
                                                } else {
                                                    return p.filter(x => x !== task.id);
                                                }
                                            });
                                        }}
                                    >
                                        {hasSubTasks ? (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setExpandedTaskIds(p => p.includes(task.id) ? p.filter(id => id !== task.id) : [...p, task.id]);
                                                }}
                                                className="p-1 hover:bg-white/10 rounded"
                                            >
                                                {isExpanded ? <ChevronDown className="w-4 h-4 text-white/50" /> : <ChevronRight className="w-4 h-4 text-white/50" />}
                                            </button>
                                        ) : (
                                            <div className="w-6" /> // spacer
                                        )}
                                        
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                            <Checkbox 
                                                checked={selectedTasks.includes(task.id)} 
                                                className="border-white/20 data-[state=checked]:bg-primary data-[state=checked]:border-primary" 
                                            />
                                            <span className={cn("text-sm truncate", selectedTasks.includes(task.id) && "text-primary font-medium")}>{task.title}</span>
                                        </div>

                                        <div className="flex items-center gap-2 shrink-0">
                                            <span className="text-[10px] font-mono text-white/40">{task.estimatedDuration}m</span>
                                            {DangerIcon}
                                            <div className={cn("w-2 h-2 rounded-full ring-1 ring-white/10 shadow-[0_0_8px_rgba(0,0,0,0.5)]", priorityColor)} title={`Prioridade: ${task.priority}`} />
                                        </div>
                                    </div>

                                    {/* Nested Subtasks */}
                                    {hasSubTasks && isExpanded && (
                                        <div className="flex flex-col pl-10 pr-2 pb-2 gap-1 animate-in slide-in-from-top-1 duration-200">
                                            {(task.subTasks as any[]).map((sub, idx) => {
                                                const subId = `${task.id}:sub:${idx}`;
                                                const isSubSelected = selectedTasks.includes(subId);
                                                return (
                                                    <div 
                                                        key={subId} 
                                                        className="flex items-center justify-between p-1.5 hover:bg-white/5 rounded-md cursor-pointer group/sub"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedTasks(p => {
                                                                const isSelecting = !p.includes(subId);
                                                                if (isSelecting) {
                                                                    // Deselect main task if selecting subtask
                                                                    const filtered = p.filter(id => id !== task.id);
                                                                    return [...filtered, subId];
                                                                } else {
                                                                    return p.filter(x => x !== subId);
                                                                }
                                                            });
                                                        }}
                                                    >
                                                        <div className="flex items-center gap-2 flex-1 min-w-0">
                                                            <Checkbox 
                                                                checked={isSubSelected} 
                                                                className="h-3.5 w-3.5 border-white/20 data-[state=checked]:bg-emerald-500 data-[state=checked]:border-emerald-500 scale-90" 
                                                            />
                                                            <span className={cn("text-xs truncate", isSubSelected ? "text-emerald-400 font-medium" : "text-white/60 group-hover/sub:text-white/80")}>
                                                                {sub.title}
                                                            </span>
                                                        </div>
                                                        <span className="text-[9px] font-mono text-white/30">{sub.duration}m</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
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
                            <Trash2 className="w-5 h-5" /> {isRecurring || block.id.includes("-virtual-") ? "Excluir Recorrência" : "Deletar esse bloco?"}
                        </DialogTitle>
                        <DialogDescription className="text-zinc-400">
                            {isRecurring || block.id.includes("-virtual-") ? "Este é um bloco recorrente. Como deseja prosseguir?" : "Esta ação deletará o bloco definitivamente."}
                        </DialogDescription>
                    </DialogHeader>

                    {isRecurring || (block.id.includes("-virtual-")) ? (
                        <div className="flex flex-col gap-3 pt-4">
                            <Button
                                variant="outline"
                                className="border-white/10 hover:bg-white/5 justify-start h-12 text-left font-bold"
                                onClick={() => handleDelete('single')}
                            >
                                <span className="flex flex-col items-start leading-none gap-1">
                                    <span>Deletar apenas este</span>
                                    <span className="text-[10px] text-zinc-500 font-normal uppercase">Cria uma exceção para hoje</span>
                                </span>
                            </Button>

                            {(block.recurrencePattern === 'custom' || block.recurrencePattern === 'monthly_on') && (
                                <Button
                                    variant="outline"
                                    className="border-white/10 hover:bg-white/5 justify-start h-12 text-left font-bold border-blue-500/30 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                    onClick={() => handleDelete('forward')}
                                >
                                    <span className="flex flex-col items-start leading-none gap-1">
                                        <span>Só esse na lógica</span>
                                        <span className="text-[10px] text-blue-500/50 font-normal uppercase">Desvincula este dia do padrão contínuo</span>
                                    </span>
                                </Button>
                            )}

                            <Button
                                variant="destructive"
                                className="justify-start h-12 text-left font-bold bg-red-500/10 text-red-500 hover:bg-red-500/20 border-red-500/20 border"
                                onClick={() => handleDelete('all')}
                            >
                                <span className="flex flex-col items-start leading-none gap-1">
                                    <span>Deletar {block.recurrencePattern === 'custom' ? 'dias configurados' : 'toda a lógica'}</span>
                                    <span className="text-[10px] text-red-300/50 font-normal uppercase">Remove da raiz, limpando todas as ocorrências</span>
                                </span>
                            </Button>

                            <Button variant="ghost" className="mt-2 text-zinc-500 hover:text-white" onClick={() => setDeleteDialogOpen(false)}>
                                Cancelar
                            </Button>
                        </div>
                    ) : (
                        <DialogFooter className="gap-2 sm:gap-0 mt-4">
                            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                            <Button variant="destructive" onClick={() => handleDelete('single')}>Deseja deletar esse bloco</Button>
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

