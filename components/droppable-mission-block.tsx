"use client";

import { useDroppable } from "@dnd-kit/core";
import { MissionBlock, toggleMissionBlock, assignTasksToBlock } from "@/lib/actions/mission.actions";
import { Zap, Trash2, Pencil, Check, Repeat, X, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
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

// ... imports

interface MissionBlockProps {
    block: MissionBlock;
    onDelete: (id: string) => void;
    onEdit?: (block: MissionBlock) => void;
    pendingBacklogTasks?: BacklogTask[];
    height?: number; // Visual height
}

export function DroppableMissionBlock({ block, onDelete, onEdit, pendingBacklogTasks = [], height }: MissionBlockProps) {
    const { isOver, setNodeRef } = useDroppable({
        id: block.id,
        data: { type: 'mission-block', block }
    });

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [addTasksDialogOpen, setAddTasksDialogOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const [optimisticCompleted, setOptimisticCompleted] = useState(block.status === 'completed');

    useEffect(() => {
        setOptimisticCompleted(block.status === 'completed');
    }, [block.status]);

    const glowColor = block.color || '#3b82f6';
    const isRecurring = block.type === 'recurring' || block.recurrencePattern === 'weekdays';

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

    const handleDelete = () => {
        setDeleteDialogOpen(false);
        onDelete(block.id);
    };

    const totalDuration = block.totalDuration;
    const subTasks = (block.subTasks as any[]) || [];

    // Calculate subtask vertical segments
    // We want the line to take up some vertical space.
    // If the card height is proportional, we can aim for the line to match the visual duration?
    // User said "3 pixels below the check showing the time space of internal tasks".
    // I will make a fixed height line or proportional max height.
    // Let's make it proportional to the list of subtasks.

    const availableTasksForBlock = pendingBacklogTasks.filter(t => t.linkedBlockType === block.title && t.status === 'pending');
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

    // Style for Neon Border (Top, Bottom, Left)
    const containerStyle: React.CSSProperties = {
        '--block-color': glowColor,
        minHeight: height ? `${height}px` : 'auto',
    } as React.CSSProperties;

    // Custom Border Logic
    // If completed: border-color + boxShadow. borders on T, B, L.
    const borderStyle = optimisticCompleted ? {
        borderTop: `2px solid ${glowColor}`,
        borderBottom: `2px solid ${glowColor}`,
        borderLeft: `2px solid ${glowColor}`,
        borderRight: 'none',
        boxShadow: `-2px 0 15px -2px ${glowColor}, 0 -4px 15px -2px ${glowColor}, 0 4px 15px -2px ${glowColor}`,
    } : {
        boxShadow: `0 4px 20px -5px ${glowColor}40`,
    };

    return (
        <>
            <div ref={setNodeRef} className="relative w-full group mb-4 pl-12">
                {/* Time Marker */}
                <span className="text-[10px] text-zinc-600 font-mono absolute left-2 top-0 mt-3 w-8 text-right">{block.startTime}</span>

                <div
                    onClick={() => setExpanded(!expanded)}
                    className={cn(
                        "relative overflow-visible rounded-2xl transition-all duration-300 cursor-pointer", // overflow-visible for shadow
                        optimisticCompleted ? "bg-[#050506]" : "bg-[var(--block-color)]",
                        isOver ? "scale-[1.02] ring-1 ring-white/20" : "hover:scale-[1.01]"
                    )}
                    style={{ ...containerStyle, ...borderStyle }}
                >
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

                            {/* Vertical Timeline (Visible when expanded) */}
                            {expanded && subTasks.length > 0 && (
                                <div className="mt-[3px] w-1 flex-1 flex flex-col items-center gap-[2px] animate-in slide-in-from-top-2">
                                    {subTasks.map((sub: any, i: number) => {
                                        // Simple visual representation: proportional height?
                                        // Just equal flex for now creates a stack.
                                        // To be strict: height based on duration ratio.
                                        const hPct = Math.max(10, (parseInt(sub.duration) / totalDuration) * 100);
                                        return (
                                            <div
                                                key={i}
                                                className="w-full rounded-full bg-white/20"
                                                style={{ height: `${parseInt(sub.duration) * 2}px`, minHeight: '4px' }}
                                                title={`${sub.title} (${sub.duration}m)`}
                                            />
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Content Column */}
                        <div className="flex-1 min-w-0 flex flex-col h-full">

                            <div className="flex items-center gap-2 mb-1">
                                <h3 className={cn(
                                    "text-lg font-black uppercase tracking-wider truncate transition-colors duration-300",
                                    optimisticCompleted ? "text-[#3a3a3a] line-through" : "text-white"
                                )}>
                                    {block.title}
                                </h3>
                                {isRecurring && (
                                    <Repeat className={cn("h-3 w-3", optimisticCompleted ? "text-[#3a3a3a]" : "text-white/60")} />
                                )}
                            </div>

                            <div className={cn(
                                "flex gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300 mb-2",
                                optimisticCompleted ? "text-[#3a3a3a]" : "text-white/60"
                            )}>
                                <span>{block.totalDuration} MIN</span>
                            </div>

                            {/* Expanded Content: Subtasks List */}
                            {expanded && (
                                <div className="space-y-2 pt-2 border-t border-white/10 mt-auto animate-in fade-in duration-300">
                                    {subTasks.length === 0 ? (
                                        <p className="text-xs text-white/40 italic">Nenhuma tarefa.</p>
                                    ) : (
                                        subTasks.map((sub: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2 text-sm text-white/90">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                                                <span className={optimisticCompleted ? "line-through opacity-50" : ""}>{sub.title}</span>
                                                <span className="text-xs text-white/40 font-mono ml-auto">{sub.duration}m</span>
                                            </div>
                                        ))
                                    )}
                                    {/* Add Task Button */}
                                    <div
                                        onClick={(e) => { e.stopPropagation(); setAddTasksDialogOpen(true); }}
                                        className="flex items-center gap-2 text-xs font-bold uppercase text-white/50 hover:text-white cursor-pointer bg-black/10 hover:bg-black/20 p-2 rounded-lg transition-colors w-fit"
                                    >
                                        <Plus className="w-4 h-4" />
                                        Add Tarefa
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Actions (Slide in on hover) */}
                        <div className="flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity absolute right-4 top-4 z-20">
                            {onEdit && (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onEdit(block); }}
                                    className="p-1 hover:bg-white/20 rounded text-white/80 hover:text-white transition-colors"
                                >
                                    <Pencil className="h-3 w-3" />
                                </button>
                            )}
                            <button
                                onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
                                className="p-1 hover:bg-red-500/20 rounded text-white/80 hover:text-red-500 transition-colors"
                            >
                                <Trash2 className="h-3 w-3" />
                            </button>
                        </div>
                    </div>
                    {/* No horizontal timeline */}
                </div>
            </div>

            {/* Dialogs... (keep existing) */}
            <Dialog open={addTasksDialogOpen} onOpenChange={setAddTasksDialogOpen}>
                <DialogContent className="bg-[#050506] border-white/10 text-white sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Adicionar Tarefas</DialogTitle>
                        <DialogDescription>Tarefas do backlog para {block.title}</DialogDescription>
                    </DialogHeader>
                    <ScrollArea className="h-[250px] bg-white/5 rounded-xl p-2">
                        {availableTasksForBlock.map(task => (
                            <div key={task.id} className="flex gap-2 p-2 hover:bg-white/10 rounded cursor-pointer" onClick={() => setSelectedTasks(p => p.includes(task.id) ? p.filter(x => x !== task.id) : [...p, task.id])}>
                                <Checkbox checked={selectedTasks.includes(task.id)} />
                                <span className="text-sm">{task.title}</span>
                            </div>
                        ))}
                        {availableTasksForBlock.length === 0 && <p className="text-xs text-zinc-500 text-center py-4">Sem tarefas disponíveis.</p>}
                    </ScrollArea>
                    <DialogFooter>
                        <Button onClick={handleAddTasks}>Confirmar</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Excluir?</DialogTitle></DialogHeader>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDelete}>Excluir</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
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

