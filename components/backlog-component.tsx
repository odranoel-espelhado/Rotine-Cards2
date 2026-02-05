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

export function BacklogComponent({ initialTasks }: { initialTasks: BacklogTask[] }) {
    const [newTask, setNewTask] = useState("");
    const [isAdding, setIsAdding] = useState(false);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTask.trim()) return;

        setIsAdding(true);
        const res = await createBacklogTask(newTask);
        setIsAdding(false);

        if (res?.success) {
            setNewTask("");
            toast.success("Tarefa adicionada ao Backlog");
        } else {
            toast.error("Erro ao adicionar tarefa");
        }
    };

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

            {/* Input Area */}
            <div className="p-4">
                <form onSubmit={handleAdd} className="flex gap-2">
                    <Input
                        placeholder="Nova tarefa..."
                        value={newTask}
                        onChange={(e) => setNewTask(e.target.value)}
                        className="bg-white/5 border-white/10 text-xs h-9 focus-visible:ring-primary/50"
                        disabled={isAdding}
                    />
                    <Button size="sm" type="submit" disabled={isAdding || !newTask.trim()} className="h-9 px-3">
                        <Plus className="h-4 w-4" />
                    </Button>
                </form>
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
