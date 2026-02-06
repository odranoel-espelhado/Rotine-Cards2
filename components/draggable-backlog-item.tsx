"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { BacklogTask } from "@/lib/actions/backlog.actions";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { Pencil, Clock, Trash2 } from "lucide-react";

export function DraggableBacklogItem({ task, onDelete, onEdit }: { task: BacklogTask, onDelete: (id: string) => void, onEdit: (task: BacklogTask) => void }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: task.id,
        data: { type: 'backlog-task', task }
    });

    const [expanded, setExpanded] = useState(false);

    const style = {
        transform: CSS.Translate.toString(transform),
        backgroundColor: task.color && task.color !== '#27272a' ? task.color : '#050506', // Use color if set, else dark
        borderColor: task.color && task.color !== '#27272a' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.05)',
    };

    // Helper to determine text contrast (simple heuristics)
    // Actually, let's just use white text and adding a dark overlay if needed or simple shadow.
    // Implementing a reliable contrast checker without libraries is verbose.
    // I'll assume users pick decent colors or I'll add a subtle dark gradient.

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={() => setExpanded(!expanded)}
            className="group relative border rounded-xl overflow-hidden transition-all cursor-grab active:cursor-grabbing hover:scale-[1.01] active:scale-95 shadow-lg"
        >
            {/* Dark overlay for readability if color is bright */}
            <div className="absolute inset-0 bg-black/40 pointer-events-none" />

            <div className="relative p-3 z-10 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <div className={`w-2 h-2 shrink-0 rounded-full shadow-sm ${task.priority === 'alta' ? 'bg-red-500 shadow-red-500/50' :
                            task.priority === 'media' ? 'bg-amber-500 shadow-amber-500/50' : 'bg-emerald-500 shadow-emerald-500/50'
                            }`} />
                        <span className="text-sm font-bold text-white truncate shadow-black drop-shadow-md">{task.title}</span>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); onEdit(task); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="h-6 w-6 text-white/70 hover:text-white hover:bg-white/10"
                        >
                            <Pencil className="h-3 w-3" />
                        </Button>
                        <Button
                            size="icon"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                            onPointerDown={(e) => e.stopPropagation()}
                            className="h-6 w-6 text-white/70 hover:text-red-400 hover:bg-black/20"
                        >
                            <Trash2 className="h-3 w-3" />
                        </Button>
                    </div>
                </div>

                {/* Expanded Details */}
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
                                    <div key={i} className="flex justify-between items-center text-xs text-white/90 bg-black/20 p-1.5 rounded">
                                        <span>{st.title}</span>
                                        <span className="font-mono text-[10px] opacity-70">{st.duration}m</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
