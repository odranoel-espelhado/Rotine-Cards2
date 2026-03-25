import { pgTable, text, timestamp, integer, uuid, jsonb, boolean } from 'drizzle-orm/pg-core';

// 1. TABELA DE UTILIZADORES (Sincronizada via Clerk)
// O ID aqui é TEXT para aceitar o formato "user_..." do Clerk
export const users = pgTable('users', {
    id: text('id').primaryKey(),
    email: text('email').notNull(),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    settings: jsonb('settings').default({}),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 2. TABELA DE BLOCOS DE MISSÃO (Timeline)
export const missionBlocks = pgTable('mission_blocks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    date: text('date').notNull(), // Formato: YYYY-MM-DD
    startTime: text('start_time').notNull(), // Formato: HH:mm
    color: text('color').default('#3b82f6'),

    // Sub-tarefas guardadas como JSON estruturado
    subTasks: jsonb('sub_tasks').notNull().default([]),
    description: text('description'),
    priority: text('priority'),
    linkedBlockType: text('linked_block_type'),
    deadline: text('deadline'),

    totalDuration: integer('total_duration').notNull(),
    type: text('type').default('unique'), // 'unique' | 'recurring'
    recurrencePattern: text('recurrence_pattern'), // 'weekdays'
    status: text('status').default('pending'), // 'pending' | 'completed'
    icon: text('icon').default('zap'),
    exceptions: jsonb('exceptions').default([]), // List of YYYY-MM-DD strings to skip
    masterBlockId: text('master_block_id'), // Referência ao bloco recorrente original caso seja uma exceção
    completedDates: jsonb('completed_dates').default([]), // List of YYYY-MM-DD strings for recurring block completions
    notifications: integer('notifications').array(), // Minutes before to notify/remind
    
    // Novas colunas para sistema unificado de repetição (Similares aos Reminders)
    occurrencesLimit: integer('occurrences_limit'),
    usedOccurrences: integer('used_occurrences').default(0),
    weekdays: jsonb('weekdays').default([]),
    monthlyDays: jsonb('monthly_days').default([]),
    monthlyNth: jsonb('monthly_nth'),
    repeatIntervalValue: integer('repeat_interval_value'),
    repeatIntervalUnit: text('repeat_interval_unit'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 3. TABELA DE BACKLOG (Tarefas em Espera)
export const backlogTasks = pgTable('backlog_tasks', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    priority: text('priority').default('media'), // 'baixa' | 'media' | 'alta'
    estimatedDuration: integer('estimated_duration').default(30),
    linkedBlockType: text('linked_block_type'),
    status: text('status').default('pending'),
    subTasks: jsonb('sub_tasks').default([]),
    color: text('color').default('#27272a'), // Default gray like zinc-800
    description: text('description'), // Descrição detalhada (opcional)
    dummy: text('dummy'), // Temporary field to force migration
    deadline: text('deadline'), // Prazo (dd/mm/yyyy or YYYY-MM-DD)
    notifications: integer('notifications').array(), // Minutos antes para notificar
    suggestible: boolean('suggestible').default(true), // Se aparece nas sugestões
    isHidden: boolean('is_hidden').default(false), // Se a tarefa está oculta no backlog
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 4. TABELA DE CARDS TÁTICOS (Efeitos de Performance)
export const tacticalCards = pgTable('tactical_cards', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    icon: text('icon').notNull(),
    color: text('color').notNull(),
    totalCharges: integer('total_charges').default(3),
    usedCharges: integer('used_charges').default(0),
    effect: text('effect'),
    penalty: text('penalty'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 5. TABELA DE LEMBRETES (Reminders)
export const reminders = pgTable('reminders', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description'),
    color: text('color').default('#3b82f6').notNull(),
    targetDate: text('target_date').notNull(), // yyyy-mm-dd
    repeatPattern: text('repeat_pattern').default('none').notNull(),
    occurrencesLimit: integer('occurrences_limit'),
    usedOccurrences: integer('used_occurrences').default(0),
    charges: integer('charges'),
    weekdays: jsonb('weekdays').default([]), // For 'workdays' pattern: array of numbers 0-6
    monthlyDays: jsonb('monthly_days').default([]), // For 'monthly_on' pattern (1-31 days): array of numbers 1-31
    monthlyNth: jsonb('monthly_nth'), // For 'monthly_on' pattern (nth weekday): { nth: 1|2|3|4|-1, weekday: 0-6 }
    time: text('time').default('09:00'), // e.g. "14:30"
    notifications: integer('notifications').array().default([]), // array of minutes before time
    intervalHours: integer('interval_hours'),
    intervalType: text('interval_type'), // 'until_end_of_day' | 'always' | 'occurrences'
    intervalOccurrences: integer('interval_occurrences'),
    repeatIntervalValue: integer('repeat_interval_value'),
    repeatIntervalUnit: text('repeat_interval_unit'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 6. TABELA DE INSCRIÇÕES PUSH (Web Push Notifications)
export const pushSubscriptions = pgTable('push_subscriptions', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// 7. TABELA DE HISTÓRICO DE CARDS (Card Usage History)
export const cardHistory = pgTable('card_history', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: text('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    cardId: uuid('card_id')
        .references(() => tacticalCards.id, { onDelete: 'set null' }),
    cardName: text('card_name').notNull(),
    reason: text('reason'),
    metadata: jsonb('metadata'), // { duration, affectedBlocks, startTime, etc. }
    date: text('date').notNull(), // YYYY-MM-DD
    time: text('time').notNull(), // HH:mm
    createdAt: timestamp('created_at').defaultNow().notNull(),
});