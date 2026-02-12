"use client";

import { BacklogTask, toggleBacklogSubTask } from "@/lib/actions/backlog.actions";
import { Button } from "@/components/ui/button";
import { Pencil, Clock, Trash2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { toast } from "sonner";

interface BacklogItemCardProps extends React.HTMLAttributes<HTMLDivElement> {
    task: BacklogTask;
    isDragging?: boolean;
    expanded?: boolean;
    onToggleExpand?: () => void;
    onEdit?: (task: BacklogTask) => void;
    onDelete?: (id: string) => void;
}

export const BacklogItemCard = forwardRef<HTMLDivElement, BacklogItemCardProps>(
    ({ task, isDragging, expanded, onToggleExpand, onEdit, onDelete, className, style, ...props }, ref) => {
        // Default to Gray if no specific block color or if it's the default "none" color
        const bgColor = task.color && task.color !== '#27272a' ? task.color : '#27272a';

        const getPriorityColor = (p: string) => {
            switch (p) {
                case 'high': return 'bg-red-500';
                case 'medium': return 'bg-amber-500';
                case 'low': return 'bg-emerald-500';
                default: return 'bg-amber-500'; // Default medium
            }
        };

        const priorityColor = getPriorityColor(task.priority || 'medium');

        return (
            <div
                ref={ref}
                style={{
                    backgroundColor: bgColor,
                    borderColor: bgColor !== '#27272a' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
                    ...style
                }}
                onClick={onToggleExpand}
                className={cn(
                    "group relative border rounded-xl overflow-hidden transition-all shadow-lg",
                    isDragging ? "cursor-grabbing scale-105 rotate-2 z-[9999] opacity-90 ring-2 ring-primary" : "cursor-grab hover:scale-[1.01] active:scale-95",
                    className
                )}
                {...props}
            >
                {/* Dark overlay for readability */}
                <div className="absolute inset-0 bg-black/40 pointer-events-none" />

                <div className="relative p-3 z-10 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                        {/* Title */}
                        <div className="flex-1 min-w-0">
                            <span className="text-sm font-bold text-white leading-tight shadow-black drop-shadow-md break-words block">
                                {task.title}
                            </span>
                            {/* Duration Badge always visible or only in expanded? Design choice. Let's keep minimal. */}
                        </div>

                        {/* Right Side: Empty for now, actions are absolute/hover */}
                        <div className="flex items-center gap-2 shrink-0">
                        </div>
                    </div>

                    {/* Actions (Hover) - visible if NOT dragging */}
                    {!isDragging && (
                        <div className="flex items-center gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity absolute right-2 top-2 bg-black/50 backdrop-blur-sm rounded-lg p-0.5 border border-white/10 shadow-xl pl-2">
                            {/* Priority Dot */}
                            <div className={cn("w-2 h-2 rounded-full mr-1", priorityColor)} title={`Prioridade ${task.priority}`} />

                            {onEdit && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                                    className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
                                >
                                    <Pencil className="h-3 w-3" />
                                </Button>
                            )}
                            {onDelete && (
                                <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                                    className="h-6 w-6 text-white/70 hover:text-red-400 hover:bg-black/20"
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            )}
                        </div>
                    )}

                    {/* Subtasks Preview or Expanded View */}
                    {expanded && (
                        <div className="pt-2 border-t border-white/10 mt-1 space-y-2 animate-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center gap-2 text-[10px] text-white/80 font-mono">
                                <Clock className="w-3 h-3" />
                                <span>{task.estimatedDuration} min</span>
                            </div>

                            {(task.subTasks as any[])?.length > 0 && (
                                <div className="space-y-1">
                                    <p className="text-[10px] uppercase font-bold text-white/50">Subtarefas</p>
                                    {(task.subTasks as any[]).map((st: any, i: number) => (
                                        <div key={i} className="flex gap-2 items-center text-xs text-white/90 bg-black/20 p-1.5 rounded group/sub">
                                            {/* Checkbox */}
                                            <div
                                                className={cn(
                                                    "w-3 h-3 rounded-[3px] border border-white/30 flex items-center justify-center cursor-pointer transition-colors hover:border-white/60 shrink-0",
                                                    st.done ? "bg-emerald-500 border-emerald-500" : "bg-transparent"
                                                )}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    const promise = toggleBacklogSubTask(task.id, i, !!st.done);
                                                    toast.promise(promise, {
                                                        loading: 'Atualizando...',
                                                        success: 'Atualizado!',
                                                        error: 'Erro'
                                                    });
                                                }}
                                            >
                                                {st.done && <Check className="w-2.5 h-2.5 text-black" strokeWidth={4} />}
                                            </div>

                                            <div className="flex-1 min-w-0 flex justify-between items-center">
                                                <span className={cn("truncate", st.done && "line-through text-white/50")}>{st.title}</span>
                                                <span className="font-mono text-[10px] opacity-70 shrink-0 ml-2">{st.duration}m</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {(task.subTasks as any[])?.length === 0 && (
                                <p className="text-[10px] italic text-white/40">Sem subtarefas</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
    }
);

BacklogItemCard.displayName = "BacklogItemCard";
