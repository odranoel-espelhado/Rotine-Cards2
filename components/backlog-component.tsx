"use client";

import { useState } from "react";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BacklogTask, createBacklogTask, deleteBacklogTask } from "@/lib/actions/backlog.actions";
import { toast } from "sonner";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { DraggableBacklogItem } from "./draggable-backlog-item";

import { CreateTaskDialog } from "./create-task-dialog";

export function BacklogComponent({ initialTasks, availableBlockTypes = [] }: { initialTasks: BacklogTask[], availableBlockTypes?: { label: string, color: string }[] }) {

    // ... delete handler ...
    const handleDelete = async (id: string) => {
        const res = await deleteBacklogTask(id);
        if (res?.success) {
            toast.message("Tarefa removida");
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#030304] border-l border-white/5 w-full">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider">Backlog</h2>
                <Badge variant="outline" className="text-zinc-500 border-white/10">{initialTasks.length}</Badge>
            </div>

            {/* Input Area replaced by Dialog Trigger */}
            <div className="p-4">
                <CreateTaskDialog availableBlockTypes={availableBlockTypes} />
            </div>

            {/* Task List */}
            <ScrollArea className="flex-1">
                <div className="p-4 space-y-2">
                    {initialTasks.length === 0 && (
                        <div className="text-center py-8 text-zinc-600 text-xs">
                            Sem tarefas pendentes forasteiro.
                        </div>
                    )}

                    {initialTasks.map((task) => (
                        <DraggableBacklogItem key={task.id} task={task} onDelete={handleDelete} />
                    ))}
                </div>
            </ScrollArea>
        </div>
    );
}
