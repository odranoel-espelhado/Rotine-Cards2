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

interface MissionBlockProps {
    block: MissionBlock;
    onDelete: (id: string) => void;
    onEdit?: (block: MissionBlock) => void;
    pendingBacklogTasks?: BacklogTask[]; // Add pendingBacklogTasks prop
}

export function DroppableMissionBlock({ block, onDelete, onEdit, pendingBacklogTasks = [] }: MissionBlockProps) {
    const { isOver, setNodeRef } = useDroppable({
        id: block.id,
        data: { type: 'mission-block', block }
    });

    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [addTasksDialogOpen, setAddTasksDialogOpen] = useState(false); // State for the new dialog
    const [expanded, setExpanded] = useState(false); // State for block expansion

    // Optimistic Checkbox state
    const [optimisticCompleted, setOptimisticCompleted] = useState(block.status === 'completed');

    // Sync optimistic state with prop changes (e.g., after server revalidation)
    useEffect(() => {
        setOptimisticCompleted(block.status === 'completed');
    }, [block.status]);

    const glowColor = block.color || '#3b82f6';
    const isRecurring = block.type === 'recurring' || block.recurrencePattern === 'weekdays';

    const handleToggle = async (e?: React.MouseEvent) => {
        e?.stopPropagation(); // Prevent block expansion when clicking checkbox
        const newState = !optimisticCompleted;
        setOptimisticCompleted(newState); // Optimistic update

        try {
            await toggleMissionBlock(block.id, newState ? 'completed' : 'pending');
            // Server revalidation will eventually sync the block.status prop
        } catch (error) {
            setOptimisticCompleted(!newState); // Revert on error
            toast.error("Erro ao atualizar status do bloco");
        }
    };

    const handleDelete = () => {
        setDeleteDialogOpen(false);
        onDelete(block.id);
    };

    // Subtask timeline calculation
    const totalDuration = block.totalDuration;
    // subTasks are now the source of truth for "Pontos com nome"
    const subTasks = (block.subTasks as any[]) || [];

    // Calculate non-subtask time (remainder)
    const subTaskTotalDuration = subTasks.reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
    const remainder = Math.max(0, totalDuration - subTaskTotalDuration);

    // Filter pending backlog tasks relevant to this block
    const availableTasksForBlock = pendingBacklogTasks.filter(t => t.linkedBlockType === block.title && t.status === 'pending');
    const [selectedTasks, setSelectedTasks] = useState<string[]>([]);

    const handleAddTasks = async () => {
        if (selectedTasks.length === 0) return;

        const tasksToAssign = availableTasksForBlock.filter(t => selectedTasks.includes(t.id));
        try {
            const res = await assignTasksToBlock(block.id, tasksToAssign);
            if (res?.success) {
                toast.success("Tarefas adicionadas com sucesso!");
                setAddTasksDialogOpen(false);
                setSelectedTasks([]);
                // Parent component should re-fetch or update block data to reflect changes
            } else {
                toast.error(res?.error || "Erro ao adicionar tarefas.");
            }
        } catch (error) {
            toast.error("Erro ao adicionar tarefas.");
        }
    };

    return (
        <>
            <div ref={setNodeRef} className="relative w-full group mb-4 pl-12">
                {/* Time Marker */}
                <span className="text-[10px] text-zinc-600 font-mono absolute left-2 top-8 -rotate-90 origin-center w-8 text-center">{block.startTime}</span>

                <div
                    onClick={() => setExpanded(!expanded)} // Toggle expansion on click
                    className={cn(
                        "relative overflow-hidden rounded-2xl transition-all duration-300 cursor-pointer",
                        optimisticCompleted ? "bg-[#050506]" : "bg-[var(--block-color)]",
                        isOver ? "scale-[1.02] ring-1 ring-white/20" : "hover:scale-[1.01]"
                    )}
                    style={{
                        '--block-color': glowColor,
                        boxShadow: optimisticCompleted ? 'none' : `0 4px 20px -5px ${glowColor}40`,
                    } as React.CSSProperties}
                >
                    {/* Left Neon Border for Completed State */}
                    {optimisticCompleted && (
                        <div
                            className="absolute left-0 top-0 bottom-0 w-1 shadow-[0_0_10px_rgba(0,0,0,1)]"
                            style={{
                                backgroundColor: glowColor,
                                boxShadow: `0 0 15px 2px ${glowColor}`
                            }}
                        />
                    )}

                    <div className="p-4 flex flex-col gap-4 relative z-10">
                        <div className="flex items-center gap-4">
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

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
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
                                    "flex gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300",
                                    optimisticCompleted ? "text-[#3a3a3a]" : "text-white/60"
                                )}>
                                    <span>{block.totalDuration} MIN</span>
                                    <span>•</span>
                                    <span>{block.startTime} - {addMinutes(block.startTime, block.totalDuration)}</span>
                                </div>
                            </div>

                            {/* Actions (Slide in on hover) */}
                            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300 z-20">
                                {onEdit && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); onEdit(block); }}
                                        className="p-2 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors"
                                    >
                                        <Pencil className="h-4 w-4" />
                                    </button>
                                )}
                                <button
                                    onClick={(e) => { e.stopPropagation(); setDeleteDialogOpen(true); }}
                                    className="p-2 hover:bg-red-500/20 rounded-lg text-white/80 hover:text-red-500 transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>

                        {/* Expanded Content: Subtasks List and Add Task Button */}
                        {expanded && (
                            <div className="animate-in slide-in-from-top-2 duration-300 space-y-2 pt-2 border-t border-white/10">
                                <div className="space-y-1">
                                    {subTasks.length === 0 ? (
                                        <p className="text-xs text-white/40 italic pl-2">Nenhuma tarefa alocada.</p>
                                    ) : (
                                        subTasks.map((sub: any, i: number) => (
                                            <div key={i} className="flex items-center gap-2 pl-2 text-sm text-white/90">
                                                <div className="w-1.5 h-1.5 rounded-full bg-white/50" />
                                                <span>{sub.title}</span>
                                                <span className="text-xs text-white/40 font-mono ml-auto">{sub.duration}m</span>
                                            </div>
                                        ))
                                    )}
                                </div>

                                {/* Add Task Button */}
                                <div
                                    onClick={(e) => { e.stopPropagation(); setAddTasksDialogOpen(true); }}
                                    className="flex items-center gap-2 text-xs font-bold uppercase text-white/50 hover:text-white cursor-pointer bg-black/10 hover:bg-black/20 p-2 rounded-lg transition-colors mt-2"
                                >
                                    <Plus className="w-4 h-4" />
                                    Adicionar Tarefa
                                </div>
                            </div>
                        )}

                        {/* Collapsed Subtask Indicators */}
                        {!expanded && subTasks.length > 0 && (
                            <div className="flex gap-1 pl-1">
                                {subTasks.slice(0, 3).map((_: any, i: number) => (
                                    <div key={i} className="w-1 h-1 rounded-full bg-white/40" />
                                ))}
                                {subTasks.length > 3 && <span className="text-[8px] text-white/40">+{subTasks.length - 3}</span>}
                            </div>
                        )}
                    </div>

                    {/* Internal Timeline / Subtasks (Original timeline, now only for visual duration) */}
                    {subTasks.length > 0 && (
                        <div className="h-2 w-full flex mt-1 bg-black/20 overflow-hidden relative">
                            {/* Render subtask segments */}
                            {subTasks.map((sub: any, i: number) => {
                                const widthPct = (parseInt(sub.duration || '0') / totalDuration) * 100;
                                return (
                                    <div
                                        key={i}
                                        className="h-full border-r border-black/10 relative group/sub"
                                        style={{
                                            width: `${widthPct}% `,
                                            backgroundColor: optimisticCompleted ? '#3a3a3a' : 'rgba(255,255,255,0.2)'
                                        }}
                                    >
                                        <div className="absolute bottom-full mb-1 left-0 bg-black text-white text-[9px] px-1 rounded opacity-0 group-hover/sub:opacity-100 whitespace-nowrap z-20 pointer-events-none">
                                            {sub.title} ({sub.duration}m)
                                        </div>
                                    </div>
                                )
                            })}
                            {/* Remainder space */}
                            {remainder > 0 && (
                                <div
                                    className="h-full opacity-10"
                                    style={{ width: `${(remainder / totalDuration) * 100}% ` }}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Add Tasks Dialog */}
            <Dialog open={addTasksDialogOpen} onOpenChange={setAddTasksDialogOpen}>
                <DialogContent className="bg-[#050506] border-white/10 text-white sm:max-w-[400px]">
                    <DialogHeader>
                        <DialogTitle>Adicionar Tarefas</DialogTitle>
                        <DialogDescription>
                            Selecione tarefas do backlog para alocar neste bloco.
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="h-[300px] border border-white/5 rounded-xl bg-white/5 p-2">
                        {availableTasksForBlock.length === 0 ? (
                            <div className="flex items-center justify-center h-full text-zinc-500 text-xs">
                                Nenhuma tarefa encontrada para "{block.title}".
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {availableTasksForBlock.map(task => (
                                    <div key={task.id} className="flex items-start gap-3 p-3 rounded-lg bg-black/20 hover:bg-black/40 cursor-pointer" onClick={() => {
                                        setSelectedTasks(prev => prev.includes(task.id) ? prev.filter(id => id !== task.id) : [...prev, task.id])
                                    }}>
                                        <Checkbox
                                            checked={selectedTasks.includes(task.id)}
                                            onCheckedChange={(checked) => {
                                                // This is handled by the parent div's onClick for better UX
                                            }}
                                            className="mt-1 border-white/30 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                        />
                                        <div className="flex-1">
                                            <p className="text-sm font-bold text-white">{task.title}</p>
                                            <div className="flex gap-2 mt-1">
                                                <Badge variant="outline" className={cn("text-[9px] border-0 px-1.5 h-4",
                                                    task.priority === 'alta' ? 'bg-red-500/20 text-red-400' :
                                                        task.priority === 'media' ? 'bg-amber-500/20 text-amber-400' :
                                                            'bg-emerald-500/20 text-emerald-400'
                                                )}>
                                                    {task.priority || 'media'}
                                                </Badge>
                                                <span className="text-[10px] text-zinc-500 font-mono">{task.estimatedDuration} min</span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>

                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setAddTasksDialogOpen(false)}>Cancelar</Button>
                        <Button onClick={handleAddTasks} disabled={selectedTasks.length === 0} className="bg-emerald-600 hover:bg-emerald-500 font-bold">
                            Adicionar
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remover Bloco?</DialogTitle>
                        <DialogDescription>
                            Você tem certeza que deseja remover este bloco? Esta ação não pode ser desfeita.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="flex gap-2 justify-end">
                        <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>Cancelar</Button>
                        <Button variant="destructive" onClick={handleDelete}>OK</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}

// Helper for time calc
function addMinutes(time: string, mins: number) {
    const [h, m] = time.split(':').map(Number);
    const date = new Date();
    date.setHours(h, m + mins);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

