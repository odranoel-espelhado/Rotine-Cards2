"use client";

import { Dialog, DialogContent, DialogTrigger, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Settings, Trash2 } from "lucide-react";
import { deleteAllUserData } from "@/lib/actions/mission.actions";
import { toast } from "sonner";
import { useState } from "react";

export function SettingsDialog() {
    const [open, setOpen] = useState(false);

    const handleClearAll = async () => {
        if (confirm("Tem certeza? Isso apagará TODOS os seus blocos e tarefas permanentemente.")) {
            const res = await deleteAllUserData();
            if (res.success) {
                toast.success("Dados limpos com sucesso!");
                setOpen(false);
            } else {
                toast.error("Erro ao limpar dados.");
            }
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                <Button variant="ghost" size="icon" className="text-zinc-500 hover:text-white hover:bg-white/10">
                    <Settings className="w-5 h-5" />
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[400px] bg-[#050506] border border-white/10 text-white rounded-3xl p-6">
                <DialogTitle className="text-xl font-bold uppercase mb-4 text-center">Configurações</DialogTitle>

                <div className="space-y-4">
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center justify-between">
                        <div>
                            <h3 className="text-sm font-bold text-red-500 uppercase">Zona de Perigo</h3>
                            <p className="text-[10px] text-zinc-400">Apagar todos os dados da conta.</p>
                        </div>
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleClearAll}
                            className="bg-red-500 hover:bg-red-600 text-white font-bold text-xs uppercase"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Limpar Tudo
                        </Button>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
