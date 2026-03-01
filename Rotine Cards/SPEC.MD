STACK TECNOLÓGICA
Importante: O sistema deve ter campos em portugues do brasil.

Frontend
Framework: Next.js 14 (App Router)

UI: Tailwind CSS + Shadcn/UI (Tema Dark/Cyberpunk)

State & Data: TanStack Query + React Hook Form (Zod)

Timeline Engine: Framer Motion (para transições suaves entre dias e blocos)

Ícones: Lucide React + Font Awesome 6

Autenticação & Backend
Auth: Clerk (Google Login)

Database: PostgreSQL (Supabase)

ORM: Drizzle ORM

API: Next.js Server Actions

🏗️ SCHEMA DO BANCO DE DADOS (Relacional)
Tabela: users
TypeScript

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  clerkUserId: text('clerk_user_id').unique().notNull(),
  email: text('email').notNull(),
  operatorName: text('operator_name'), // Nome tático do usuário
  avatarUrl: text('avatar_url'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
Tabela: mission_blocks (Os Blocos de Tempo)
TypeScript

export const missionBlocks = sqliteTable('mission_blocks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  startTime: text('start_time').notNull(), // HH:mm
  date: text('date').notNull(), // YYYY-MM-DD
  color: text('color').default('#3b82f6'),
  isRecurring: integer('is_recurring', { mode: 'boolean' }).default(false),
  
  // JSON contendo [{title: string, duration: number, completed: boolean}]
  subTasks: text('sub_tasks').notNull(), 
  
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
});
Tabela: backlog_tasks (Tarefas em Espera)
TypeScript

export const backlogTasks = sqliteTable('backlog_tasks', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  title: text('title').notNull(),
  priority: text('priority').default('media'), // baixa, media, alta
  estimatedDuration: integer('estimated_duration').default(30),
  linkedBlockId: text('linked_block_id'), // Opcional: vincula a um tipo de bloco
  status: text('status').default('pending'), // pending, completed
});
Tabela: tactical_cards (Deck de Poder)
TypeScript

export const tacticalCards = sqliteTable('tactical_cards', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id),
  name: text('name').notNull(),
  icon: text('icon').notNull(),
  color: text('color').notNull(),
  totalCharges: integer('total_charges').default(3),
  usedCharges: integer('used_charges').default(0),
  effect: text('effect'),
  penalty: text('penalty'),
});
🧠 LÓGICA DE NEGÓCIO MODULAR
1. O Motor de Timeline (O Coração)
Navegação: Gerar array de datas [current - 10 ... current + 20].

Renderização Dinâmica: Os blocos são posicionados absolutamente ou via Grid, onde a altura é calculada por (soma_duracao_subtarefas * multiplicador_pixel).

Detecção de Conflito: Função checkOverlap(blockA, blockB) que dispara um alerta visual se blockA.end > blockB.start.

2. Sistema de Sugestão Contextual
No Bloco: Ao clicar em um Bloco de Foco, o componente filtra backlogTasks onde linkedBlockId === currentBlock.id.

No Gap: Função que identifica espaços vazios entre missionBlocks e sugere tarefas do backlog onde estimatedDuration <= gapDuration.

3. Fluxo de Sub-tarefas Cronometradas
O usuário não define o fim do bloco manualmente. Ele adiciona sub-tarefas com tempos fixos.

Cálculo: Block.totalDuration = subTasks.reduce((acc, task) => acc + task.duration, 0).

🎨 DESIGN SYSTEM (CYBER-PRECISION)
Fundo: #020203 (Deep Black)

Bordas: border-white/10

Cards: Backdrop Blur (bg-white/5 backdrop-blur-md)

Status de Prioridade:

Alta: text-red-500 + Glow Neon

Média: text-amber-500

Baixa: text-emerald-500

🚀 SERVER ACTIONS PRINCIPAIS
TypeScript

// lib/actions/mission.ts

export async function createMissionBlock(data: NewBlock) {
  const { userId } = auth();
  if (!userId) throw new Error("Unauthorized");

  // Lógica para salvar bloco e suas sub-tarefas fixas
  await db.insert(missionBlocks).values({
    id: crypto.randomUUID(),
    userId,
    ...data,
    subTasks: JSON.stringify(data.subTasks)
  });

  revalidatePath('/dashboard');
}

export async function useTacticalCard(cardId: string, reason: string) {
  // 1. Decrementar carga do card
  // 2. Criar log na tabela de 'sacrifice_logs'
  // 3. RevalidatePath
}
Próximo Passo para o Desenvolvedor:
Setup do Clerk para garantir o userId em todas as tabelas.

Implementação do Carrossel de 30 dias (Horizontal Scroll).
10 dias para tras e 20 dias para frente.
