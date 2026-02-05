"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { createMissionBlock } from "@/lib/actions/mission.actions";
import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

// Zod Schema
const formSchema = z.object({
    title: z.string().min(2, {
        message: "Título deve ter pelo menos 2 caracteres.",
    }),
    startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, {
        message: "Formato de hora inválido (HH:mm).",
    }),
    totalDuration: z.coerce.number().min(5, {
        message: "Duração mínima de 5 minutos."
    }),
    color: z.string().default("#3b82f6"),
});

export function CreateBlockDialog({ currentDate }: { currentDate: string }) {
    const [open, setOpen] = useState(false);
    const [subtasksText, setSubtasksText] = useState("");
    const [isRecurring, setIsRecurring] = useState(false);

    const form = useForm<z.infer<typeof formSchema>>({
        resolver: zodResolver(formSchema) as any,
        defaultValues: {
            title: "",
            startTime: "08:00",
            totalDuration: 60,
            color: "#3b82f6",
        },
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        // Parse subtasks
        const subTasks = subtasksText.split('\n').filter(line => line.trim() !== '').map(line => ({
            title: line.trim(),
            done: false,
            duration: 0
        }));

        const res = await createMissionBlock({
            title: values.title,
            startTime: values.startTime,
            totalDuration: values.totalDuration,
            color: values.color,
            date: currentDate,
            subTasks: subTasks,
        });

        if (res?.success) {
            setOpen(false);
            form.reset();
            setSubtasksText("");
            toast.success("Missão criada com sucesso!");
        } else {
            toast.error(res?.error || "Erro ao criar bloco");
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button className="bg-[#10b981] hover:bg-[#10b981]/90 text-black font-bold rounded-full px-6">
                    + AGENDAR
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] bg-[#09090b] border border-white/10 text-white p-6 rounded-2xl">
                <DialogHeader className="mb-4">
                    <DialogTitle className="text-xl font-bold tracking-tight sr-only">Nova Missão</DialogTitle>
                </DialogHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Nome da Tarefa</FormLabel>
                                    <FormControl>
                                        <Input placeholder="..." {...field} className="bg-[#18181b] border-transparent h-12 rounded-xl text-white placeholder:text-zinc-600 focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="color"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Cor do Card</FormLabel>
                                    <div className="flex gap-3">
                                        {['#0ea5e9', '#ef4444', '#f59e0b', '#8b5cf6', '#10b981'].map(color => (
                                            <div
                                                key={color}
                                                className={`w-10 h-10 rounded-xl cursor-pointer transition-all ${field.value === color ? 'ring-2 ring-white scale-110' : 'hover:scale-105 opacity-80 hover:opacity-100'}`}
                                                style={{ backgroundColor: color }}
                                                onClick={() => field.onChange(color)}
                                            />
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <div className="grid grid-cols-2 gap-4">
                            <FormField
                                control={form.control}
                                name="startTime"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Início</FormLabel>
                                        <FormControl>
                                            <div className="relative">
                                                <Input type="time" {...field} className="bg-[#18181b] border-transparent h-12 rounded-xl text-white focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary" />
                                            </div>
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="totalDuration"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Duração (min)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="bg-[#18181b] border-transparent h-12 rounded-xl text-white focus-visible:ring-offset-0 focus-visible:ring-1 focus-visible:ring-primary" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormItem>
                            <FormLabel className="text-xs font-bold text-zinc-500 uppercase tracking-wider">Subtarefas</FormLabel>
                            <FormControl>
                                <textarea
                                    className="w-full min-h-[100px] bg-[#18181b] border-transparent rounded-xl text-white p-3 text-sm placeholder:text-zinc-600 focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                                    placeholder="Uma por linha..."
                                    value={subtasksText}
                                    onChange={(e) => setSubtasksText(e.target.value)}
                                />
                            </FormControl>
                        </FormItem>

                        <div className="flex gap-4">
                            <div
                                className={`flex-1 h-12 rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-white/5 transition-all ${!isRecurring ? 'bg-[#18181b] border-primary/50 text-white' : 'bg-transparent text-zinc-500 hover:bg-white/5'}`}
                                onClick={() => setIsRecurring(false)}
                            >
                                <div className={`w-3 h-3 rounded-full ${!isRecurring ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : 'bg-zinc-700'}`}></div>
                                <span className="text-sm font-bold">ÚNICA</span>
                            </div>
                            <div
                                className={`flex-1 h-12 rounded-xl flex items-center justify-center gap-2 cursor-pointer border border-white/5 transition-all ${isRecurring ? 'bg-[#18181b] border-primary/50 text-white' : 'bg-transparent text-zinc-500 hover:bg-white/5'}`}
                                onClick={() => setIsRecurring(true)}
                            >
                                <div className={`w-3 h-3 rounded-full ${isRecurring ? 'bg-white' : 'bg-zinc-700'}`}></div>
                                <span className="text-sm font-bold">FIXA</span>
                            </div>
                        </div>

                        <Button type="submit" className="w-full h-14 bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black tracking-wide text-lg rounded-xl uppercase shadow-[0_0_20px_-5px_rgba(16,185,129,0.4)] transition-all hover:scale-[1.02]">
                            SALVAR
                        </Button>

                        <div className="flex justify-center">
                            <span className="text-xs font-bold text-zinc-600 cursor-pointer hover:text-zinc-400" onClick={() => setOpen(false)}>CANCELAR</span>
                        </div>

                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
