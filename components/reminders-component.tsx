"use client";

import { useState, useEffect } from "react";
import { Plus, Settings, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { ReminderType, createReminderAction, deleteReminderAction, getRemindersAction, getAllRemindersAction } from "@/lib/actions/reminders.actions";
import { ScrollArea } from "@/components/ui/scroll-area";

const reminderSchema = z.object({
    title: z.string().min(1, "O título é obrigatório."),
    color: z.string().min(1, "A cor é obrigatória."),
    targetDate: z.string().min(1, "A data é obrigatória."),
    description: z.string().optional(),
    repeatPattern: z.enum(['none', 'daily', 'weekly', 'monthly', 'yearly', 'workdays', 'monthly_on', 'custom']).default('none'),
});

const DEFAULT_COLORS = [
    { label: 'Azul', value: '#3b82f6' },
    { label: 'Verde', value: '#10b981' },
    { label: 'Vermelho', value: '#ef4444' },
    { label: 'Amarelo', value: '#eab308' },
    { label: 'Roxo', value: '#a855f7' },
    { label: 'Cinza', value: '#52525b' },
];

export function RemindersComponent({ currentDate }: { currentDate: string }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [reminders, setReminders] = useState<ReminderType[]>([]);
    const [allReminders, setAllReminders] = useState<ReminderType[]>([]);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isSettingsOpen, setIsSettingsOpen] = useState(false);

    const loadReminders = async () => {
        const todayReminders = await getRemindersAction(currentDate);
        setReminders(todayReminders);
    };

    const loadAllReminders = async () => {
        const all = await getAllRemindersAction();
        setAllReminders(all);
    };

    useEffect(() => {
        loadReminders();
        loadAllReminders();
    }, [currentDate]);

    const form = useForm<z.infer<typeof reminderSchema>>({
        resolver: zodResolver(reminderSchema) as any,
        defaultValues: {
            title: "",
            color: "#3b82f6",
            description: "",
            targetDate: currentDate,
            repeatPattern: "none",
        },
    });

    const onSubmit = async (values: z.infer<typeof reminderSchema> | any) => {
        const res = await createReminderAction({
            ...values,
            description: values.description || "",
        });

        if (res.success) {
            toast.success("Lembrete criado com sucesso!");
            form.reset();
            setIsCreateOpen(false);
            loadReminders();
            loadAllReminders();
        } else {
            toast.error("Erro ao criar lembrete.");
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("Deletar este lembrete?")) {
            await deleteReminderAction(id);
            toast.success("Lembrete removido!");
            loadReminders();
            loadAllReminders();
        }
    };

    return (
        <div className="flex flex-col border-b border-white/5 bg-[#050506]">
            {/* Header Lembretes */}
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
                <div
                    className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                    onClick={() => setIsExpanded(!isExpanded)}
                >
                    {isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-zinc-500" />
                    ) : (
                        <ChevronRight className="w-4 h-4 text-zinc-500" />
                    )}
                    <h2 className="text-sm font-bold text-zinc-400 uppercase tracking-wider select-none">Lembretes</h2>
                    {reminders.length > 0 && (
                        <Badge variant="outline" className="text-zinc-500 border-white/10">{reminders.length}</Badge>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    {/* Botão + Novo Lembrete */}
                    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                        <DialogTrigger asChild>
                            <div className="bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black uppercase text-xs h-8 px-4 w-fit flex items-center justify-center rounded-lg shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:scale-105 active:scale-95 cursor-pointer">
                                <Plus className="w-3 h-3 mr-1" /> Novo Lembrete
                            </div>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[400px] bg-[#050506] border border-white/10 text-white gap-0 rounded-[2rem] p-6">
                            <DialogTitle className="text-xl font-black uppercase text-white italic text-center mb-6">
                                Novo Lembrete
                            </DialogTitle>

                            <Form {...form}>
                                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                                    <FormField
                                        control={form.control}
                                        name="title"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Título</FormLabel>
                                                <FormControl>
                                                    <Input {...field} className="bg-white/5 border-white/10 h-10 rounded-xl text-sm" placeholder="Ex: Beber água" />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <FormField
                                        control={form.control}
                                        name="description"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Descrição</FormLabel>
                                                <FormControl>
                                                    <Textarea {...field} className="bg-white/5 border-white/10 rounded-xl text-xs resize-none" placeholder="Detalhes (opcional)..." rows={2} />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="flex gap-4">
                                        <FormField
                                            control={form.control}
                                            name="color"
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1 block mb-2">Cor de Fundo</FormLabel>
                                                    <div className="flex flex-wrap gap-2">
                                                        {DEFAULT_COLORS.map(c => (
                                                            <div
                                                                key={c.value}
                                                                onClick={() => field.onChange(c.value)}
                                                                style={{ backgroundColor: c.value }}
                                                                className={cn(
                                                                    "w-6 h-6 rounded-full cursor-pointer transition-all border-2",
                                                                    field.value === c.value ? "border-white scale-110 shadow-lg" : "border-transparent opacity-50 hover:opacity-100"
                                                                )}
                                                                title={c.label}
                                                            />
                                                        ))}
                                                    </div>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />

                                        <FormField
                                            control={form.control}
                                            name="targetDate"
                                            render={({ field }) => (
                                                <FormItem className="flex-1">
                                                    <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Data</FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="date"
                                                            {...field}
                                                            className="bg-white/5 border-white/10 h-10 rounded-xl text-xs uppercase"
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </div>

                                    <FormField
                                        control={form.control}
                                        name="repeatPattern"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel className="text-[10px] font-black text-zinc-500 uppercase ml-1">Repetir</FormLabel>
                                                <Select onValueChange={field.onChange} defaultValue={field.value}>
                                                    <FormControl>
                                                        <SelectTrigger className="bg-white/5 border-white/10 h-10 rounded-xl text-xs w-full">
                                                            <SelectValue placeholder="Selecione..." />
                                                        </SelectTrigger>
                                                    </FormControl>
                                                    <SelectContent className="bg-[#050506] border-white/10 text-white">
                                                        <SelectItem value="none">Sem repetição</SelectItem>
                                                        <SelectItem value="daily">Todo dia</SelectItem>
                                                        <SelectItem value="weekly">Toda semana</SelectItem>
                                                        <SelectItem value="monthly">Todo mês</SelectItem>
                                                        <SelectItem value="yearly">Todo ano</SelectItem>
                                                        <SelectItem value="workdays" disabled>Dias úteis selecionados (em breve)</SelectItem>
                                                        <SelectItem value="monthly_on" disabled>Mensal no(a) (em breve)</SelectItem>
                                                        <SelectItem value="custom" disabled>Personalizado (em breve)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    <div className="pt-4 flex flex-col gap-2">
                                        <Button type="submit" className="w-full h-11 bg-[#10b981] hover:bg-[#10b981]/90 text-black font-black tracking-widest text-sm rounded-xl uppercase">
                                            Salvar Lembrete
                                        </Button>
                                        <Button type="button" onClick={() => setIsCreateOpen(false)} variant="ghost" className="w-full h-8 text-zinc-500 hover:text-white text-[10px] uppercase">
                                            Cancelar
                                        </Button>
                                    </div>
                                </form>
                            </Form>
                        </DialogContent>
                    </Dialog>

                    {/* Botão Engrenagem (Configurações / Lembretes Gerais) */}
                    <Dialog open={isSettingsOpen} onOpenChange={(open) => {
                        setIsSettingsOpen(open);
                        if (open) loadAllReminders();
                    }}>
                        <DialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg">
                                <Settings className="w-4 h-4" />
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[450px] bg-[#050506] border border-white/10 text-white gap-0 rounded-[2rem] p-6">
                            <DialogTitle className="text-xl font-black uppercase text-white italic text-center mb-6">
                                Configurações de Lembretes
                            </DialogTitle>

                            <ScrollArea className="max-h-[300px] w-full pr-4 custom-scrollbar">
                                {allReminders.length === 0 && (
                                    <div className="text-center py-8 text-zinc-600 text-xs">
                                        Nenhum lembrete configurado no geral.
                                    </div>
                                )}
                                <div className="space-y-3">
                                    {allReminders.map(rem => (
                                        <div key={rem.id} className="p-3 rounded-xl border border-white/10 bg-white/5 flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: rem.color }} />
                                                    <span className="font-bold text-sm text-zinc-200">{rem.title}</span>
                                                </div>
                                                <div className="text-xs text-zinc-500 mt-1 pl-4">
                                                    Alvo: <span className="text-zinc-400">{rem.targetDate}</span> | Repetição: <span className="text-zinc-400">{rem.repeatPattern}</span>
                                                </div>
                                            </div>
                                            <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-500 hover:text-red-500 hover:bg-white/5 rounded-lg shrink-0" onClick={() => handleDelete(rem.id)}>
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </ScrollArea>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Corpo / Lista de Lembretes do Relatório */}
            <div className={cn("transition-all duration-300 overflow-hidden", isExpanded ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
                <div className="p-4 flex gap-3 overflow-x-auto custom-scrollbar">
                    {reminders.length === 0 ? (
                        <div className="text-center py-4 w-full text-zinc-600 text-[11px] uppercase tracking-widest font-bold opacity-50">
                            Nenhum lembrete para hoje
                        </div>
                    ) : (
                        reminders.map(rem => (
                            <div
                                key={rem.id}
                                style={{ backgroundColor: rem.color + '20', borderColor: rem.color + '40' }}
                                className="shrink-0 w-[200px] min-h-[4.5rem] p-3 rounded-2xl border flex flex-col justify-center relative overflow-hidden group"
                            >
                                <div className="absolute top-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <Trash2 className="w-3 h-3 text-white/50 hover:text-red-400 cursor-pointer" onClick={() => handleDelete(rem.id)} />
                                </div>
                                <div className="flex items-center gap-2 mb-1">
                                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: rem.color, boxShadow: `0 0 8px ${rem.color}` }} />
                                    <span className="font-black text-sm text-white/90 truncate pr-4">{rem.title}</span>
                                </div>
                                {rem.description && (
                                    <p className="text-[10px] text-white/60 line-clamp-2 leading-relaxed ml-3.5">
                                        {rem.description}
                                    </p>
                                )}
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
