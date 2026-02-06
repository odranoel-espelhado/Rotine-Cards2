"use client";

import { useDroppable } from "@dnd-kit/core";
import { MissionBlock, toggleMissionBlock } from "@/lib/actions/mission.actions";
import { Zap, Trash2, Pencil, Check, Repeat, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
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

interface MissionBlockProps {
    block: MissionBlock;
    onDelete: (id: string) => void;
    onEdit?: (block: MissionBlock) => void; // Add optional onEdit
}

export function DroppableMissionBlock({ block, onDelete, onEdit }: MissionBlockProps) {
    const { isOver, setNodeRef } = useDroppable({
        id: block.id,
        data: { type: 'mission-block', block }
    });

    const [loading, setLoading] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

    // Determines current visual state
    const isCompleted = block.status === 'completed';
    const glowColor = block.color || '#3b82f6';
    const isRecurring = block.type === 'recurring' || block.recurrencePattern === 'weekdays';

    const handleToggle = async () => {
        if (loading) return;
        setLoading(true);
        try {
            const newStatus = isCompleted ? 'pending' : 'completed';
            await toggleMissionBlock(block.id, newStatus);
            // Optimistic update handled by server revalidate usually, but for instant feedback we might rely on props update
        } catch (error) {
            toast.error("Erro ao atualizar status do bloco");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = () => {
        setDeleteDialogOpen(false);
        onDelete(block.id);
    };

    // Subtask timeline calculation
    const totalDuration = block.totalDuration;
    const subTasks = (block.subTasks as any[]) || [];

    // Calculate non-subtask time (remainder)
    const subTaskTotalDuration = subTasks.reduce((acc, curr) => acc + (parseInt(curr.duration) || 0), 0);
    const remainder = Math.max(0, totalDuration - subTaskTotalDuration);

    return (
        <>
            <div ref={setNodeRef} className="relative w-full group mb-4 pl-12">
                {/* Time Marker */}
                <span className="text-[10px] text-zinc-600 font-mono absolute left-2 top-8 -rotate-90 origin-center w-8 text-center">{block.startTime}</span>

                <div
                    className={cn(
                        "relative overflow-hidden rounded-2xl transition-all duration-300",
                        isCompleted ? "bg-[#050506]" : "bg-[var(--block-color)]",
                        isOver ? "scale-[1.02] ring-1 ring-white/20" : "hover:scale-[1.01]"
                    )}
                    style={{
                        '--block-color': glowColor,
                        boxShadow: isCompleted ? 'none' : `0 4px 20px -5px ${glowColor}40`,
                    } as React.CSSProperties}
                >
                    {/* Left Neon Border for Completed State */}
                    {isCompleted && (
                        <div
                            className="absolute left-0 top-0 bottom-0 w-1 shadow-[0_0_10px_rgba(0,0,0,1)]"
                            style={{
                                backgroundColor: glowColor,
                                boxShadow: `0 0 15px 2px ${glowColor}`
                            }}
                        />
                    )}

                    <div className="p-4 flex items-center gap-4 relative z-10">
                        {/* Checkbox */}
                        <div
                            onClick={handleToggle}
                            className={cn(
                                "h-8 w-8 shrink-0 rounded-[8px] border-2 flex items-center justify-center cursor-pointer transition-all duration-300",
                                isCompleted
                                    ? "bg-[#050506] border-zinc-800"
                                    : "bg-transparent border-white/30 hover:bg-white/10"
                            )}
                        >
                            {isCompleted && <Check className="h-5 w-5 text-white" strokeWidth={3} />}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                                <h3 className={cn(
                                    "text-lg font-black uppercase tracking-wider truncate transition-colors duration-300",
                                    isCompleted ? "text-[#3a3a3a] line-through" : "text-white"
                                )}>
                                    {block.title}
                                </h3>
                                {isRecurring && (
                                    <Repeat className={cn("h-3 w-3", isCompleted ? "text-[#3a3a3a]" : "text-white/60")} />
                                )}
                            </div>

                            <div className={cn(
                                "flex gap-2 text-[10px] font-bold uppercase tracking-widest transition-colors duration-300",
                                isCompleted ? "text-[#3a3a3a]" : "text-white/60"
                            )}>
                                <span>{block.totalDuration} MIN</span>
                                <span>•</span>
                                <span>{block.startTime} - {addMinutes(block.startTime, block.totalDuration)}</span>
                            </div>
                        </div>

                        {/* Actions (Slide in on hover) */}
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity translate-x-4 group-hover:translate-x-0 duration-300">
                            {onEdit && (
                                <button
                                    onClick={() => onEdit(block)}
                                    className="p-2 hover:bg-white/20 rounded-lg text-white/80 hover:text-white transition-colors"
                                >
                                    <Pencil className="h-4 w-4" />
                                </button>
                            )}
                            <button
                                onClick={() => setDeleteDialogOpen(true)}
                                className="p-2 hover:bg-red-500/20 rounded-lg text-white/80 hover:text-red-500 transition-colors"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {/* Internal Timeline / Subtasks */}
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
                                            width: `${widthPct}%`,
                                            backgroundColor: isCompleted ? '#3a3a3a' : 'rgba(255,255,255,0.2)'
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
                                    style={{ width: `${(remainder / totalDuration) * 100}%` }}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

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
