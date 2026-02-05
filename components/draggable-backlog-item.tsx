"use client";

import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { BacklogTask } from "@/lib/actions/backlog.actions";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DraggableBacklogItem({ task, onDelete }: { task: BacklogTask, onDelete: (id: string) => void }) {
    const { attributes, listeners, setNodeRef, transform } = useDraggable({
        id: task.id,
        data: { type: 'backlog-task', task }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            className="group bg-white/5 hover:bg-white/10 border border-white/5 hover:border-primary/30 rounded-lg p-3 transition-all flex items-center justify-between cursor-grab active:cursor-grabbing hover:shadow-lg hover:shadow-primary/5 active:scale-95"
        >
            <div className="flex items-center gap-3 overflow-hidden">
                <div className={`w-1.5 h-1.5 rounded-full ${task.priority === 'alta' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' :
                        task.priority === 'media' ? 'bg-amber-500' : 'bg-emerald-500'
                    }`} />
                <span className="text-sm text-zinc-300 truncate">{task.title}</span>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                    size="icon"
                    variant="ghost"
                    onClick={(e) => { e.stopPropagation(); onDelete(task.id); }}
                    onPointerDown={(e) => e.stopPropagation()} // Prevent drag on delete click
                    className="h-6 w-6 text-zinc-500 hover:text-red-400"
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        </div>
    );
}
