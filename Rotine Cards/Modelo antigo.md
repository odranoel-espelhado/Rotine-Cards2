
<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Rotine Cards - Precision OS</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0/css/all.min.css" rel="stylesheet">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        
        body { 
            font-family: 'Inter', sans-serif; 
            background-color: #020203;
            color: #f1f5f9;
            overflow-x: hidden;
            user-select: none;
            -webkit-tap-highlight-color: transparent;
        }

        .custom-scrollbar::-webkit-scrollbar { width: 4px; height: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 10px; }
        
        .timeline-container { display: flex; flex-direction: column; padding-bottom: 300px; position: relative; }
        .time-marker { font-family: monospace; font-size: 10px; color: #475569; display: flex; align-items: center; gap: 10px; margin: 12px 0; z-index: 5; position: relative; }
        .time-marker::after { content: ""; flex-grow: 1; height: 1px; background: linear-gradient(to right, rgba(255,255,255,0.05), transparent); }

        .task-block { 
            margin-left: 40px; 
            border-radius: 1.5rem; 
            border: 1px solid rgba(255,255,255,0.1);
            padding: 20px; 
            position: relative; 
            transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
            z-index: 10;
        }

        /* Check: Neon apenas na borda esquerda */
        .task-finished { 
            opacity: 1;
            background-color: #000 !important;
            background-image: none !important;
        }
        .task-finished h4 { text-decoration: line-through; opacity: 0.6; }
        
        .task-finished.neon-border-check {
            box-shadow: -12px 0 25px -8px currentColor;
            border-left: 8px solid currentColor !important;
        }

        /* Zona de Conflito Reforçada (7px) */
        .conflict-alert {
            border-top: 7px solid #ef4444 !important;
            box-shadow: 0 -15px 30px rgba(239, 68, 68, 0.25);
            z-index: 40 !important;
        }
        .conflict-tag {
            position: absolute; top: -14px; right: 25px;
            background: #ef4444; color: white; font-size: 8px;
            padding: 2px 10px; border-radius: 4px; font-weight: 900;
            text-transform: uppercase; box-shadow: 0 4px 12px rgba(0,0,0,0.5);
        }

        #daySelector {
            display: flex; gap: 12px; padding: 15px 10px;
            overflow-x: auto; cursor: grab; scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch; scrollbar-width: none;
        }
        #daySelector::-webkit-scrollbar { display: none; }
        #daySelector:active { cursor: grabbing; }

        .day-card {
            min-width: 85px; height: 100px;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            border-radius: 1.2rem; background: rgba(255,255,255,0.02);
            border: 1px solid rgba(255,255,255,0.05); transition: all 0.3s; flex-shrink: 0;
        }
        .day-card.active { background: white; color: black; transform: scale(1.05) translateY(-5px); box-shadow: 0 15px 30px rgba(0,0,0,0.6); }
        .day-card.today { border: 2px solid #6366f1; position: relative; }
        .day-card.today::after { content: "HOJE"; position: absolute; bottom: -8px; font-size: 7px; background: #6366f1; color: white; padding: 2px 6px; border-radius: 4px; font-weight: 900; }

        .btn-action { opacity: 0.4; transition: all 0.2s; color: white; }
        .btn-action:hover { opacity: 1; transform: scale(1.1); }
        .btn-delete-red:hover { color: #ef4444; }

        .subtask-pill {
            background: rgba(255,255,255,0.05);
            border: 1px solid rgba(255,255,255,0.1);
            padding: 4px 8px;
            border-radius: 8px;
            font-size: 9px;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 6px;
        }
        .subtask-done { opacity: 0.5; text-decoration: line-through; border-color: rgba(16, 185, 129, 0.3); color: #10b981; }

        input[type="time"]::-webkit-calendar-picker-indicator { filter: invert(1); }
    </style>
</head>
<body class="p-4 md:p-8">

<div class="max-w-7xl mx-auto">
    <header class="mb-10 flex flex-col md:flex-row justify-between items-center gap-6 border-b border-white/5 pb-10">
        <div>
            <h1 class="text-4xl font-black tracking-tighter bg-gradient-to-br from-cyan-400 via-emerald-500 to-indigo-600 bg-clip-text text-transparent uppercase italic">Rotine Cards</h1>
            <p class="text-[10px] font-bold text-slate-700 tracking-[0.4em] uppercase mt-2 italic">Intelligence Protocol V.8</p>
        </div>
        
        <div class="flex gap-4">
            <div class="flex bg-slate-900 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                <button onclick="window.exportarBackup()" class="px-5 py-3 hover:bg-indigo-600/20 text-indigo-400 border-r border-white/5 transition-all"><i class="fas fa-download text-xs"></i></button>
                <label class="px-5 py-3 hover:bg-emerald-600/20 text-emerald-400 transition-all cursor-pointer"><i class="fas fa-upload text-xs"></i><input type="file" class="hidden" onchange="window.importarBackup(event)"></label>
            </div>
        </div>
    </header>

    <main class="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <section class="lg:col-span-8 space-y-6">
            <div id="daySelector" class="custom-scrollbar"></div>
            
            <div class="bg-[#08090b] rounded-[2.5rem] border border-white/10 shadow-2xl relative overflow-hidden flex flex-col h-[820px]">
                <div class="p-8 border-b border-white/5 flex justify-between items-center bg-[#08090b]/95 backdrop-blur-md z-50">
                    <h2 id="currentDayTitle" class="text-3xl font-black uppercase italic text-white">...</h2>
                    <button onclick="window.openTaskModal('timeline')" class="px-8 py-4 bg-emerald-500 text-black rounded-2xl font-black text-[11px] uppercase shadow-lg hover:scale-105 transition-transform">+ Agendar</button>
                </div>
                <div id="timelineScrollContainer" class="flex-grow overflow-y-auto custom-scrollbar p-8">
                    <div id="dynamicTimeline" class="timeline-container"></div>
                </div>
            </div>
        </section>

        <section class="lg:col-span-4 space-y-8">
            <!-- Em Espera com Subtarefas -->
            <div class="space-y-6">
                <div class="flex justify-between items-center px-2">
                    <h2 class="text-xl font-black uppercase italic text-slate-600">Em Espera</h2>
                    <button onclick="window.openTaskModal('backlog')" class="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-emerald-400 hover:bg-emerald-500/10"><i class="fas fa-plus"></i></button>
                </div>
                <div id="backlogList" class="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2"></div>
            </div>

            <div class="space-y-6">
                <div class="flex justify-between items-center px-2">
                    <h2 class="text-xl font-black uppercase italic text-slate-600">Deck Tático</h2>
                    <button onclick="document.getElementById('cardModal').style.display='flex'" class="w-10 h-10 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-indigo-400 hover:bg-white/10"><i class="fas fa-plus"></i></button>
                </div>
                <div id="cardDeck" class="grid grid-cols-1 gap-4"></div>
            </div>

            <div class="bg-slate-900/10 p-6 rounded-[2rem] border border-white/5">
                <div class="flex justify-between items-center mb-4">
                    <h2 class="text-[10px] font-black uppercase text-slate-600 tracking-widest">Logs de Poder</h2>
                    <button onclick="window.clearLogs()" class="text-[9px] font-black text-red-500/40 hover:text-red-500">Limpar</button>
                </div>
                <div id="sacrificeLogs" class="space-y-3 max-h-[180px] overflow-y-auto custom-scrollbar pr-2"></div>
            </div>
        </section>
    </main>
</div>

<!-- Modal Tarefa Reestruturado -->
<div id="taskModal" class="fixed inset-0 bg-black/95 hidden items-center justify-center z-[100] p-6 backdrop-blur-md">
    <div class="bg-[#0b0c11] w-full max-w-md p-10 rounded-[3rem] border border-white/10 shadow-2xl overflow-y-auto max-h-[90vh] custom-scrollbar">
        <h2 id="taskModalTitle" class="text-2xl font-black mb-8 uppercase italic text-emerald-500 text-center">Registro</h2>
        <input id="taskOrigin" type="hidden"><input id="taskId" type="hidden">
        
        <div class="mb-6">
            <label class="text-[10px] font-black text-slate-500 uppercase block mb-2 ml-1">Nome da Tarefa</label>
            <input id="taskText" type="text" placeholder="..." class="w-full bg-white/5 border border-white/10 p-5 rounded-xl text-white outline-none font-bold">
        </div>

        <div id="modalTheme" class="mb-6">
            <label class="text-[10px] font-black text-slate-500 uppercase block mb-3 ml-1">Cor do Card</label>
            <div id="taskColorPicker" class="flex gap-2"></div>
        </div>

        <div id="modalSchedule" class="grid grid-cols-2 gap-4 mb-6">
            <div>
                <label class="text-[10px] font-black text-slate-500 uppercase block mb-2 ml-1">Início</label>
                <input id="taskTime" type="time" class="w-full bg-white/5 border border-white/10 p-5 rounded-xl text-white outline-none font-mono">
            </div>
            <div>
                <label class="text-[10px] font-black text-slate-500 uppercase block mb-2 ml-1">Duração (Min)</label>
                <input id="taskDurationTimeline" type="number" placeholder="30" class="w-full bg-white/5 border border-white/10 p-5 rounded-xl text-white outline-none font-mono">
            </div>
        </div>

        <div class="mb-6">
            <label class="text-[10px] font-black text-slate-500 uppercase block mb-2 ml-1">Subtarefas</label>
            <textarea id="taskSubs" placeholder="Uma por linha..." class="w-full bg-white/5 border border-white/10 p-5 rounded-xl text-white h-24 outline-none resize-none"></textarea>
        </div>

        <div id="backlogDurationField" class="mb-6">
            <label class="text-[10px] font-black text-slate-500 uppercase block mb-2 ml-1">Duração Estimada (Minutos)</label>
            <input id="taskDurationBacklog" type="number" placeholder="30" class="w-full bg-white/5 border border-white/10 p-5 rounded-xl text-white outline-none font-mono">
        </div>

        <div id="modalType" class="flex gap-4 mb-6">
            <label class="flex-1 flex items-center justify-center gap-2 p-4 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
                <input type="radio" name="taskType" value="unique" checked class="accent-red-500"><span class="text-[10px] font-black uppercase">Única</span>
            </label>
            <label class="flex-1 flex items-center justify-center gap-2 p-4 bg-white/5 rounded-xl border border-white/5 cursor-pointer">
                <input type="radio" name="taskType" value="persistent" class="accent-emerald-500"><span class="text-[10px] font-black uppercase">Fixa</span>
            </label>
        </div>
        
        <label id="modalRepeat" class="flex items-center gap-3 mb-8 cursor-pointer"><input type="checkbox" id="repeatAllDays" class="w-5 h-5 rounded accent-indigo-500"><span class="text-[11px] font-black uppercase text-slate-500">Replicar (Seg-Sex)</span></label>
        
        <button id="btnSaveTask" class="w-full bg-emerald-600 py-6 rounded-2xl font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl mb-3">Salvar</button>
        <button onclick="window.closeTaskModal()" class="w-full text-[10px] font-black uppercase text-slate-700">Cancelar</button>
    </div>
</div>

<!-- Modal Card -->
<div id="cardModal" class="fixed inset-0 bg-black/98 hidden items-center justify-center z-[100] p-6 backdrop-blur-xl">
    <div class="bg-[#0b0c11] w-full max-w-md p-10 rounded-[3rem] border border-white/10 shadow-2xl">
        <h2 class="text-2xl font-black mb-8 uppercase italic text-indigo-500 text-center">Forjar Card</h2>
        <input id="cardName" type="text" placeholder="NOME DO PODER..." class="w-full bg-white/5 border border-white/10 p-5 rounded-xl mb-6 text-white outline-none font-bold">
        
        <label class="text-[10px] font-black text-slate-500 uppercase block mb-3 ml-1">Cor do Card</label>
        <div id="cardColorPicker" class="flex gap-3 mb-6"></div>

        <label class="text-[10px] font-black text-slate-500 uppercase block mb-3 ml-1">Ícone</label>
        <div id="cardIconPicker" class="grid grid-cols-4 gap-2 mb-8"></div>

        <input id="cardLimit" type="number" placeholder="CARGAS" class="w-full bg-white/5 border border-white/10 p-5 rounded-xl mb-4 text-white font-mono">
        <textarea id="cardEffect" placeholder="POSITIVO..." class="w-full bg-white/5 border border-white/10 p-5 rounded-xl h-16 text-white outline-none mb-4 resize-none"></textarea>
        <textarea id="cardPenalty" placeholder="CUSTO..." class="w-full bg-red-950/20 border border-red-900/30 p-5 rounded-xl h-16 text-red-200 outline-none mb-8 resize-none"></textarea>
        
        <button id="btnSaveCard" class="w-full bg-indigo-600 py-6 rounded-2xl font-black uppercase shadow-xl hover:bg-indigo-500 transition-all">Forjar Poder</button>
        <button onclick="document.getElementById('cardModal').style.display='none'" class="w-full mt-4 text-slate-700 font-bold uppercase text-[10px]">Fechar</button>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', () => {
    const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const APP_DAYS_FULL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const PALETTE = [
        {id:'cyan', bg:'bg-cyan-600', hex: '#0891b2'}, {id:'rose', bg:'bg-rose-600', hex: '#e11d48'}, 
        {id:'amber', bg:'bg-amber-600', hex: '#d97706'}, {id:'violet', bg:'bg-violet-700', hex: '#6d28d9'}, 
        {id:'emerald', bg:'bg-emerald-600', hex: '#059669'}
    ];
    const ICONS = ['fa-bolt', 'fa-moon', 'fa-fire', 'fa-dumbbell', 'fa-brain', 'fa-coffee', 'fa-skull', 'fa-gear'];

    let today = new Date();
    let selectedDateKey = today.toISOString().split('T')[0];
    let selectedTaskColor = 'cyan', selectedCardColor = 'violet', selectedCardIcon = 'fa-bolt';
    
    let tasksByDate = JSON.parse(localStorage.getItem('rc_v28_tasks')) || {};
    let recurringTasks = JSON.parse(localStorage.getItem('rc_v28_recurring')) || { 1:[], 2:[], 3:[], 4:[], 5:[], 6:[], 0:[] };
    let backlogTasks = JSON.parse(localStorage.getItem('rc_v28_backlog')) || [];
    let cards = JSON.parse(localStorage.getItem('rc_v28_cards')) || [];
    let sacrificeLogs = JSON.parse(localStorage.getItem('rc_v28_logs')) || [];
    let lastReset = localStorage.getItem('rc_v28_reset');

    // Drag-to-Scroll
    const daySelector = document.getElementById('daySelector');
    let isDown = false, startX, scrollLeft;
    daySelector.addEventListener('mousedown', (e) => { isDown = true; startX = e.pageX - daySelector.offsetLeft; scrollLeft = daySelector.scrollLeft; });
    daySelector.addEventListener('mouseleave', () => { isDown = false; });
    daySelector.addEventListener('mouseup', () => { isDown = false; });
    daySelector.addEventListener('mousemove', (e) => { if(!isDown) return; e.preventDefault(); const x = e.pageX - daySelector.offsetLeft; const walk = (x - startX) * 2; daySelector.scrollLeft = scrollLeft - walk; });

    const setupPickers = () => {
        document.getElementById('taskColorPicker').innerHTML = PALETTE.map(c => `<div onclick="window.selectTaskColor('${c.id}')" class="w-10 h-10 rounded-xl cursor-pointer ${c.bg} border-2 border-transparent transition-all" id="task-col-${c.id}"></div>`).join('');
        document.getElementById('cardColorPicker').innerHTML = PALETTE.map(c => `<div onclick="window.selectCardColor('${c.id}')" class="w-8 h-8 rounded-full cursor-pointer ${c.bg}" id="card-col-picker-${c.id}"></div>`).join('');
        document.getElementById('cardIconPicker').innerHTML = ICONS.map(i => `<div onclick="window.selectCardIcon('${i}')" class="p-4 bg-white/5 rounded-xl cursor-pointer text-center border-2 border-transparent" id="card-ico-picker-${i}"><i class="fas ${i}"></i></div>`).join('');
    };

    window.selectTaskColor = (id) => { selectedTaskColor = id; PALETTE.forEach(c => document.getElementById(`task-col-${c.id}`).style.borderColor = (c.id === id ? 'white' : 'transparent')); };
    window.selectCardColor = (id) => { selectedCardColor = id; PALETTE.forEach(c => { const el = document.getElementById(`card-col-picker-${c.id}`); if(el) el.style.outline = (c.id === id ? '2px solid white' : 'none') }); };
    window.selectCardIcon = (icon) => { selectedCardIcon = icon; ICONS.forEach(i => { const el = document.getElementById(`card-ico-picker-${i}`); if(el) el.classList.toggle('bg-indigo-600/30', i === icon) }); };

    const manageCycle = () => {
        const d = new Date();
        const getNextReset = (from) => {
            let res = new Date(from);
            res.setDate(res.getDate() + ((1 + 7 - res.getDay()) % 7));
            res.setHours(2, 0, 0, 0);
            if (res <= from) res.setDate(res.getDate() + 7);
            return res.getTime();
        };
        if (!lastReset || d.getTime() >= getNextReset(new Date(parseInt(lastReset)))) {
            cards.forEach(c => c.used = 0);
            localStorage.setItem('rc_v28_reset', d.getTime().toString());
            lastReset = d.getTime().toString();
        }
    };

    const renderDaySelector = () => {
        const selector = document.getElementById('daySelector'); selector.innerHTML = '';
        let baseDate = new Date(); baseDate.setDate(baseDate.getDate() - 5);
        for(let i=0; i < 30; i++) {
            let d = new Date(baseDate); d.setDate(d.getDate() + i);
            let key = d.toISOString().split('T')[0];
            let isToday = key === today.toISOString().split('T')[0];
            let isActive = key === selectedDateKey;
            selector.innerHTML += `<div onclick="window.setDate('${key}')" class="day-card ${isActive ? 'active' : ''} ${isToday ? 'today' : ''}"><span class="text-[9px] font-black uppercase opacity-60">${WEEKDAYS[d.getDay()]}</span><span class="text-xl font-black">${d.getDate().toString().padStart(2, '0')}</span></div>`;
        }
    };

    const render = () => {
        manageCycle(); renderDaySelector();
        const dateObj = new Date(selectedDateKey + "T12:00:00");
        const dayOfWeek = dateObj.getDay();
        document.getElementById('currentDayTitle').innerText = `${APP_DAYS_FULL[dayOfWeek]} ${dateObj.getDate()}`;

        const dayUnique = tasksByDate[selectedDateKey] || [];
        const dayRecurring = recurringTasks[dayOfWeek] || [];
        const sorted = [...dayUnique, ...dayRecurring].sort((a,b) => a.time.localeCompare(b.time));

        const timeline = document.getElementById('dynamicTimeline'); timeline.innerHTML = '';
        sorted.forEach((t, i) => {
            const start = timeToMinutes(t.time);
            let mTop = 0, conflictTime = 0;
            if (i > 0) {
                const prev = sorted[i-1];
                const prevEnd = timeToMinutes(prev.time) + parseInt(prev.duration);
                const gap = start - prevEnd;
                if (gap < 0) { conflictTime = Math.abs(gap); mTop = -(conflictTime * 2.5); }
                else if (gap >= 5) { timeline.innerHTML += `<div class="time-gap">GAP: ${Math.floor(gap/60)}H ${gap%60}M</div>`; }
            } else { timeline.innerHTML += `<div class="time-marker">${t.time}</div>`; }

            const col = PALETTE.find(p => p.id === (t.color || 'cyan'));
            const isFinished = t.completed;
            const isRecurring = t.type === 'persistent';

            timeline.innerHTML += `
                <div class="task-block ${conflictTime > 0 ? 'conflict-alert' : ''} ${isFinished ? 'task-finished neon-border-check' : col.bg}" 
                     style="min-height: ${Math.max(90, t.duration * 2.5)}px; margin-top: ${mTop}px; z-index: ${10 + i}; color: ${isFinished ? col.hex : 'white'}">
                    ${conflictTime > 0 ? `<div class="conflict-tag">CONFLITO: ${conflictTime} MIN</div>` : ''}
                    <div class="flex items-start gap-4">
                        <button onclick="window.toggleTask('${t.id}', '${selectedDateKey}', ${isRecurring})" class="shrink-0 w-12 h-12 rounded-2xl border-2 border-white/30 flex items-center justify-center bg-black/20 text-white font-black hover:scale-110 transition-transform">
                            ${isFinished ? '<i class="fas fa-check"></i>' : ''}
                        </button>
                        <div class="flex-grow min-w-0">
                            <div class="flex items-center gap-2">
                                <h4 class="font-black text-sm uppercase truncate drop-shadow-md">${t.text}</h4>
                                ${isRecurring ? '<i class="fas fa-redo text-[8px] opacity-40"></i>' : ''}
                            </div>
                            <p class="text-[9px] font-black opacity-60 mt-1 uppercase text-white">${t.time} • ${t.duration} MINUTOS</p>
                            ${t.subtasks && t.subtasks.length > 0 ? `<div class="mt-4 flex flex-wrap gap-2">${t.subtasks.map(s => `<div class="subtask-pill ${s.done ? 'subtask-done' : ''}"><i class="fas ${s.done ? 'fa-check-circle' : 'fa-circle'}"></i> ${s.text}</div>`).join('')}</div>` : ''}
                        </div>
                        <div class="flex gap-2">
                            <button onclick="window.openEdit('${t.id}', ${isRecurring})" class="btn-action"><i class="fas fa-pen text-xs"></i></button>
                            <button onclick="window.deleteTask('${t.id}', '${selectedDateKey}', ${isRecurring})" class="btn-action btn-delete-red"><i class="fas fa-trash text-xs"></i></button>
                        </div>
                    </div>
                </div><div class="time-marker">${addMinutes(t.time, t.duration)}</div>`;
        });

        document.getElementById('backlogList').innerHTML = backlogTasks.map((t, idx) => `
            <div class="bg-white/5 p-4 rounded-2xl border border-white/5 group">
                <div class="flex justify-between items-center mb-3">
                    <div><h4 class="text-xs font-black uppercase text-slate-300">${t.text}</h4><p class="text-[8px] font-bold text-slate-600 mt-1">${t.duration} MINUTOS</p></div>
                    <div class="flex gap-2">
                        <button onclick="window.openEditBacklog(${idx})" class="opacity-0 group-hover:opacity-100 btn-action"><i class="fas fa-pen text-xs"></i></button>
                        <button onclick="window.deleteBacklog(${idx})" class="opacity-0 group-hover:opacity-100 btn-action btn-delete-red"><i class="fas fa-times"></i></button>
                    </div>
                </div>
                ${t.subtasks && t.subtasks.length > 0 ? `<div class="flex flex-wrap gap-2">${t.subtasks.map(s => `<div class="subtask-pill opacity-60 text-[8px]"><i class="fas fa-circle text-[6px]"></i> ${s.text}</div>`).join('')}</div>` : ''}
            </div>`).join('') || '<p class="text-[9px] text-slate-800 text-center py-4 font-black uppercase tracking-widest">Inativo</p>';

        document.getElementById('cardDeck').innerHTML = cards.map((c, i) => {
            const col = PALETTE.find(p => p.id === c.color) || PALETTE[0];
            return `
            <div class="card-item p-6 rounded-[2.2rem] ${c.used >= c.total ? 'card-depleted' : col.bg} border border-white/10 relative cursor-pointer shadow-xl hover:-translate-y-1" onclick="window.useCard(${i})">
                <div class="flex justify-between mb-3"><div class="w-12 h-12 bg-black/20 rounded-2xl flex items-center justify-center text-xl"><i class="fas ${c.icon}"></i></div><span class="text-2xl font-black italic opacity-30">${c.total - c.used}</span></div>
                <h3 class="font-black text-xs uppercase mb-1">${c.name}</h3>
                <p class="text-[9px] font-bold opacity-90 leading-snug mb-3">${c.effect}</p>
                <div class="bg-black/20 p-2 rounded-xl text-[8px] font-black uppercase text-red-200 italic">Custo: ${c.penalty || 'N/A'}</div>
                <button class="absolute top-4 right-4 btn-action btn-delete-red" onclick="event.stopPropagation(); window.deleteCard(${i})"><i class="fas fa-trash-alt"></i></button>
            </div>`;
        }).join('');

        document.getElementById('sacrificeLogs').innerHTML = sacrificeLogs.map(log => {
            const col = PALETTE.find(p => p.id === log.color) || PALETTE[0];
            return `<div class="p-4 bg-white/5 rounded-xl mb-3 text-[10px] border-l-[6px]" style="border-left-color: ${col.hex}"><div class="flex justify-between font-black uppercase mb-1" style="color: ${col.hex}"><span>${log.card}</span><span class="text-slate-600 text-[8px]">${log.day}</span></div><p class="text-white/70 italic">"${log.reason}"</p></div>`
        }).join('') || '<p class="text-[9px] text-slate-800 text-center py-2 font-black uppercase tracking-widest">Vazio</p>';

        localStorage.setItem('rc_v28_tasks', JSON.stringify(tasksByDate));
        localStorage.setItem('rc_v28_recurring', JSON.stringify(recurringTasks));
        localStorage.setItem('rc_v28_backlog', JSON.stringify(backlogTasks));
        localStorage.setItem('rc_v28_cards', JSON.stringify(cards));
        localStorage.setItem('rc_v28_logs', JSON.stringify(sacrificeLogs));
    };

    function timeToMinutes(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
    function addMinutes(t, m) { let total = timeToMinutes(t) + parseInt(m); return `${Math.floor(total/60).toString().padStart(2, '0')}:${(total%60).toString().padStart(2, '0')}`; }

    window.setDate = (key) => { selectedDateKey = key; render(); };
    window.toggleTask = (tid, dk, rec) => { let t = rec ? recurringTasks[new Date(dk+"T12:00:00").getDay()].find(x => x.id === tid) : tasksByDate[dk].find(x => x.id === tid); if(t) { t.completed = !t.completed; render(); } };
    window.deleteTask = (tid, dk, rec) => { if(!confirm("Remover?")) return; if(rec) recurringTasks[new Date(dk+"T12:00:00").getDay()] = recurringTasks[new Date(dk+"T12:00:00").getDay()].filter(x => x.id !== tid); else tasksByDate[dk] = tasksByDate[dk].filter(x => x.id !== tid); render(); };
    window.deleteBacklog = (i) => { if(confirm("Remover?")) { backlogTasks.splice(i, 1); render(); } };
    window.deleteCard = (i) => { if(confirm("Apagar card?")) { cards.splice(i, 1); render(); } };
    window.clearLogs = () => { if(confirm("Limpar logs?")) { sacrificeLogs = []; render(); } };
    window.closeTaskModal = () => document.getElementById('taskModal').style.display = 'none';

    window.openTaskModal = (origin) => {
        document.getElementById('taskOrigin').value = origin; document.getElementById('taskId').value = "";
        const isT = origin === 'timeline';
        document.getElementById('modalSchedule').style.display = isT ? 'grid' : 'none';
        document.getElementById('modalTheme').style.display = isT ? 'block' : 'none';
        document.getElementById('modalType').style.display = isT ? 'flex' : 'none';
        document.getElementById('modalRepeat').style.display = isT ? 'flex' : 'none';
        document.getElementById('backlogDurationField').style.display = isT ? 'none' : 'block';
        document.getElementById('taskModal').style.display = 'flex';
    };

    window.openEdit = (tid, rec) => {
        const d = new Date(selectedDateKey + "T12:00:00").getDay();
        const t = rec ? recurringTasks[d].find(x => x.id === tid) : tasksByDate[selectedDateKey].find(x => x.id === tid);
        document.getElementById('taskOrigin').value = 'timeline'; document.getElementById('taskId').value = tid;
        document.getElementById('taskText').value = t.text; document.getElementById('taskTime').value = t.time;
        document.getElementById('taskDurationTimeline').value = t.duration;
        document.getElementById('taskSubs').value = (t.subtasks || []).map(s => s.text).join('\n');
        document.getElementById('modalSchedule').style.display = 'grid'; document.getElementById('modalTheme').style.display = 'block';
        document.getElementById('modalType').style.display = 'flex'; document.getElementById('modalRepeat').style.display = 'none';
        document.getElementById('backlogDurationField').style.display = 'none'; document.getElementById('taskModal').style.display = 'flex';
    };

    window.openEditBacklog = (i) => {
        const t = backlogTasks[i];
        document.getElementById('taskOrigin').value = 'backlog'; document.getElementById('taskId').value = i;
        document.getElementById('taskText').value = t.text; document.getElementById('taskDurationBacklog').value = t.duration;
        document.getElementById('taskSubs').value = (t.subtasks || []).map(s => s.text).join('\n');
        document.getElementById('modalSchedule').style.display = 'none'; document.getElementById('modalTheme').style.display = 'none';
        document.getElementById('modalType').style.display = 'none'; document.getElementById('modalRepeat').style.display = 'none';
        document.getElementById('backlogDurationField').style.display = 'block'; document.getElementById('taskModal').style.display = 'flex';
    };

    document.getElementById('btnSaveTask').onclick = () => {
        const origin = document.getElementById('taskOrigin').value;
        const id = document.getElementById('taskId').value;
        const type = document.querySelector('input[name="taskType"]:checked').value;
        const repeat = document.getElementById('repeatAllDays').checked;
        
        const data = {
            id: id || Date.now().toString(),
            text: document.getElementById('taskText').value || "Nova Missão",
            subtasks: document.getElementById('taskSubs').value.split('\n').filter(s => s.trim()).map(s => ({ text: s, done: false })),
            completed: false, type: type
        };

        if (origin === 'timeline') {
            data.duration = document.getElementById('taskDurationTimeline').value || 30;
            data.time = document.getElementById('taskTime').value || "08:00";
            data.color = selectedTaskColor;
            
            if (repeat) {
                // Replicar Seg a Sex (1 a 5 no JS getDay)
                if (type === 'persistent') {
                    for(let j=1; j<=5; j++) recurringTasks[j].push({...data, id: Date.now().toString() + j});
                } else {
                    let start = new Date(selectedDateKey + "T12:00:00");
                    start.setDate(start.getDate() - (start.getDay() === 0 ? 6 : start.getDay() - 1));
                    for(let j=0; j<5; j++) {
                        let d = new Date(start); d.setDate(d.getDate() + j);
                        let k = d.toISOString().split('T')[0];
                        if(!tasksByDate[k]) tasksByDate[k] = [];
                        tasksByDate[k].push({...data, id: Date.now().toString() + j});
                    }
                }
            } else {
                if (type === 'persistent') {
                    const d = new Date(selectedDateKey + "T12:00:00").getDay();
                    recurringTasks[d].push(data);
                } else {
                    if(!tasksByDate[selectedDateKey]) tasksByDate[selectedDateKey] = [];
                    tasksByDate[selectedDateKey].push(data);
                }
            }
        } else {
            data.duration = document.getElementById('taskDurationBacklog').value || 30;
            if(id === "") backlogTasks.push(data); else backlogTasks[id] = {...backlogTasks[id], ...data};
        }
        document.getElementById('taskModal').style.display = 'none'; render();
    };

    window.useCard = (i) => {
        const c = cards[i]; if(c.used >= c.total) return;
        const r = prompt(`Motivo do sacrifício:`);
        if(r) { c.used++; sacrificeLogs.unshift({ card: c.name, reason: r, day: selectedDateKey, color: c.color }); render(); }
    };

    document.getElementById('btnSaveCard').onclick = () => {
        const name = document.getElementById('cardName').value;
        if(!name) return;
        cards.push({ 
            name: name, total: document.getElementById('cardLimit').value || 1, used: 0, 
            effect: document.getElementById('cardEffect').value, penalty: document.getElementById('cardPenalty').value,
            color: selectedCardColor, icon: selectedCardIcon 
        });
        document.getElementById('cardModal').style.display = 'none'; render();
    };

    window.exportarBackup = () => {
        const b = new Blob([JSON.stringify({ tasks: tasksByDate, recurring: recurringTasks, backlog: backlogTasks, cards: cards, logs: sacrificeLogs })], { type: "application/json" });
        const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `RotineCards_V8.json`; a.click();
    };

    window.importarBackup = (e) => {
        const r = new FileReader(); r.onload = (ev) => {
            const d = JSON.parse(ev.target.result); tasksByDate = d.tasks; recurringTasks = d.recurring || {1:[],2:[],3:[],4:[],5:[],6:[],0:[]}; backlogTasks = d.backlog || []; cards = d.cards; sacrificeLogs = d.logs; render();
        }; r.readAsText(e.target.files[0]);
    };

    setupPickers(); window.selectTaskColor('cyan'); window.selectCardColor('violet'); window.selectCardIcon('fa-bolt'); render();
});
</script>
</body>
</html>
