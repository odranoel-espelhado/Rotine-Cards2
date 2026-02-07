"use client";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BacklogTask } from "@/lib/actions/backlog.actions";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

interface TaskPickerDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    tasks: BacklogTask[];
    onSelect: (task: BacklogTask) => void;
}

export function TaskPickerDialog({ open, onOpenChange, tasks, onSelect }: TaskPickerDialogProps) {
    const [search, setSearch] = useState("");
    const filtered = tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase()) && t.status === 'pending');

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="bg-[#050506] border-white/10 text-white sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle>Selecionar Tarefa</DialogTitle>
                </DialogHeader>
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <Input
                        placeholder="Buscar tarefa..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="pl-9 bg-white/5 border-white/10"
                    />
                </div>
                <ScrollArea className="h-[300px] mt-2 pr-4">
                    <div className="space-y-1">
                        {filtered.length === 0 ? (
                            <p className="text-zinc-500 text-center py-4 text-sm">Nenhuma tarefa encontrada.</p>
                        ) : (
                            filtered.map(task => (
                                <div
                                    key={task.id}
                                    onClick={() => { onSelect(task); }}
                                    className="p-3 hover:bg-white/10 rounded-lg cursor-pointer flex justify-between items-center group transition-colors"
                                >
                                    <span className="text-sm font-medium text-zinc-200 group-hover:text-white">{task.title}</span>
                                    <span className="text-[10px] bg-white/5 px-2 py-1 rounded text-zinc-500 group-hover:text-zinc-300 transition-colors border border-white/5">
                                        {task.estimatedDuration}m
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
