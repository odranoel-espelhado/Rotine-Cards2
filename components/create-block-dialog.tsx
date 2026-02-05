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
        const res = await createMissionBlock({
            title: values.title,
            startTime: values.startTime,
            totalDuration: values.totalDuration,
            color: values.color,
            date: currentDate,
            subTasks: [], // Empty for now
        });

        if (res?.success) {
            setOpen(false);
            form.reset();
            toast.success("Missão criada com sucesso!");
        } else {
            toast.error(res?.error || "Erro ao criar bloco");
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="border-white/10 hover:bg-white/5 text-zinc-400">
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Bloco
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] bg-[#050506] border-white/10 text-white">
                <DialogHeader>
                    <DialogTitle>Nova Missão</DialogTitle>
                    <DialogDescription>
                        Crie um bloco tático para o dia {currentDate}.
                    </DialogDescription>
                </DialogHeader>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="title"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Nome da Missão</FormLabel>
                                    <FormControl>
                                        <Input placeholder="Ex: Foco Profundo" {...field} className="bg-white/5 border-white/10 text-white" />
                                    </FormControl>
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
                                        <FormLabel>Início (HH:mm)</FormLabel>
                                        <FormControl>
                                            <Input type="time" {...field} className="bg-white/5 border-white/10 text-white" />
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
                                        <FormLabel>Duração (min)</FormLabel>
                                        <FormControl>
                                            <Input type="number" {...field} className="bg-white/5 border-white/10 text-white" />
                                        </FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}
                            />
                        </div>

                        <FormField
                            control={form.control}
                            name="color"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Cor Tática</FormLabel>
                                    <div className="flex gap-2">
                                        {['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'].map(color => (
                                            <div
                                                key={color}
                                                className={`w-8 h-8 rounded-full cursor-pointer border-2 ${field.value === color ? 'border-white' : 'border-transparent'}`}
                                                style={{ backgroundColor: color }}
                                                onClick={() => field.onChange(color)}
                                            />
                                        ))}
                                    </div>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <DialogFooter>
                            <Button type="submit" className="bg-primary text-white hover:bg-primary/90">Confirmar Missão</Button>
                        </DialogFooter>
                    </form>
                </Form>
            </DialogContent>
        </Dialog>
    );
}
