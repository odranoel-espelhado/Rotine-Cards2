import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Clock, ShieldCheck, Zap } from "lucide-react";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#020203] text-white overflow-hidden relative selection:bg-primary/30">

      {/* Background Ambience */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] left-[20%] w-[500px] h-[500px] bg-primary/20 rounded-full blur-[128px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[20%] w-[400px] h-[400px] bg-destructive/10 rounded-full blur-[128px]"></div>
      </div>

      <div className="z-10 container mx-auto px-4 flex flex-col items-center text-center space-y-8">

        {/* Badge */}
        <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-primary backdrop-blur-md">
          <span className="flex h-2 w-2 rounded-full bg-primary mr-2 animate-pulse"></span>
          System Online v2.0
        </div>

        {/* Hero Title */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter bg-clip-text text-transparent bg-gradient-to-b from-white to-white/60">
          Gestão Tática de <br />
          <span className="text-primary glow-text">Tempo & Foco</span>
        </h1>

        <p className="max-w-[600px] text-zinc-400 text-lg md:text-xl leading-relaxed">
          Domine sua rotina com precisão militar. Elimine a procrastinação usando blocos de missão e cards estratégicos.
        </p>

        {/* CTA */}
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Link href="/dashboard">
            <Button size="lg" className="bg-primary hover:bg-primary/90 text-white font-semibold px-8 py-6 text-lg rounded-xl shadow-[0_0_30px_-5px_var(--primary)] transition-all hover:scale-105 hover:shadow-[0_0_50px_-10px_var(--primary)]">
              AJEITAR ROTINA
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>

          <Link href="https://github.com" target="_blank">
            <Button variant="outline" size="lg" className="bg-transparent border-white/10 hover:bg-white/5 text-zinc-300 hover:text-white px-8 py-6 text-lg rounded-xl transition-all">
              Documentação
            </Button>
          </Link>
        </div>

        {/* Features Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-20 w-full max-w-4xl">
          <div className="glass p-6 rounded-2xl flex flex-col items-center gap-4 hover:border-primary/50 transition-colors group">
            <div className="p-3 rounded-full bg-white/5 group-hover:bg-primary/20 transition-colors">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <h3 className="text-xl font-semibold">Time Blocking</h3>
            <p className="text-zinc-500 text-sm">Estruture seu dia em blocos de missão inegociáveis.</p>
          </div>

          <div className="glass p-6 rounded-2xl flex flex-col items-center gap-4 hover:border-destructive/50 transition-colors group">
            <div className="p-3 rounded-full bg-white/5 group-hover:bg-destructive/20 transition-colors">
              <Zap className="h-6 w-6 text-destructive" />
            </div>
            <h3 className="text-xl font-semibold">Gamificação Tática</h3>
            <p className="text-zinc-500 text-sm">Use cards de efeito para manipular sua produtividade.</p>
          </div>

          <div className="glass p-6 rounded-2xl flex flex-col items-center gap-4 hover:border-emerald-500/50 transition-colors group">
            <div className="p-3 rounded-full bg-white/5 group-hover:bg-emerald-500/20 transition-colors">
              <ShieldCheck className="h-6 w-6 text-emerald-500" />
            </div>
            <h3 className="text-xl font-semibold">Dados de Performance</h3>
            <p className="text-zinc-500 text-sm">Analise métricas reais do seu desempenho diário.</p>
          </div>
        </div>

        <div className="absolute bottom-10 text-xs text-zinc-700 font-mono">
          OPERATIONAL_ID: 928-AX-22 // SECURE_CONNECTION
        </div>

      </div>
    </main>
  );
}
