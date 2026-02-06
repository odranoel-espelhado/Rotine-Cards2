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

    // Default to Gray if no specific block color or if it's the default "none" color
    const bgColor = task.color && task.color !== '#27272a' ? task.color : '#27272a';

    const style = {
        transform: CSS.Translate.toString(transform),
        backgroundColor: bgColor,
        borderColor: bgColor !== '#27272a' ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)',
    };

    const getPriorityLabel = (p: string) => {
        switch (p) {
            case 'high': return { label: 'Alta', color: 'bg-red-500/20 text-red-200 border-red-500/30' };
            case 'medium': return { label: 'Média', color: 'bg-amber-500/20 text-amber-200 border-amber-500/30' };
            case 'low': return { label: 'Baixa', color: 'bg-emerald-500/20 text-emerald-200 border-emerald-500/30' };
            default: return { label: '', color: '' };
        }
    };

    const priorityInfo = getPriorityLabel(task.priority || 'medium');

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={() => setExpanded(!expanded)}
            className="group relative border rounded-xl overflow-hidden transition-all cursor-grab active:cursor-grabbing hover:scale-[1.01] active:scale-95 shadow-lg"
        >
            {/* Dark overlay for readability */}
            <div className="absolute inset-0 bg-black/40 pointer-events-none" />

            <div className="relative p-3 z-10 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                    {/* Title */}
                    <span className="text-sm font-bold text-white leading-tight shadow-black drop-shadow-md break-words flex-1">
                        {task.title}
                    </span>

                    {/* Right Side: Priority & Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Priority Badge */}
                        <div className={`px-2 py-0.5 rounded text-[9px] uppercase font-black tracking-wide border ${priorityInfo.color}`}>
                            {priorityInfo.label}
                        </div>

                        {/* Actions (Hover) */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity absolute right-2 -top-1 bg-black/50 backdrop-blur-sm rounded-lg p-0.5 border border-white/10 shadow-xl translate-y-2">
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
                </div>

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
                                    <div key={i} className="flex justify-between items-center text-xs text-white/90 bg-black/20 p-1.5 rounded">
                                        <span>{st.title}</span>
                                        <span className="font-mono text-[10px] opacity-70">{st.duration}m</span>
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
