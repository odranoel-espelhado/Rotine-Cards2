📄 PRD – Rotine Cards
1. O QUE É?
Uma plataforma de gestão tática de tempo baseada em Blocos de Missão, onde a produtividade é gerado em meio a sugestão de tarefas dentro e fora dos blocos, assim como o uso de cards para aliviar a culpa de não estar fazendo algo, dando um senso estrategico para realizar essa "sabotagem" de forma consciente e controlada com limites de uso e efeitos variados.
O sistema utiliza autenticação robusta, persistência em nuvem e uma hierarquia rígida de Blocos > Sub-tarefas.

2. OBJETIVOS
Migrar de armazenamento local para banco de dados em nuvem.

Implementar o conceito de Time-Blocking rigoroso.

Otimizar "Gaps" (espaços vazios) através de um motor de sugestão inteligente de tarefas pendentes.

3. FUNCIONALIDADES DETALHADAS
🔐 1. Autenticação e Perfil (Clerk)
Login Social: Integração nativa com Google via Clerk.

Middleware de Proteção: Acesso ao Dashboard restrito a usuários autenticados.

Perfil do Operador: Dados básicos e configurações de usuário vinculados ao user_id do Clerk.

🧱 2. Agendamento de Blocos
Entidade "Bloco": O usuário não agenda mais tarefas soltas, mas blocos de tempo (Ex: "Foco Profundo", "Saúde", "Estudos").

Sub-tarefas Fixas: Dentro de cada bloco, o usuário define sub-tarefas com tempo de duração individual que serão realizadas repetidamente no dia da semana que o bloco for criado.

Ex: Bloco "Treino" (60min) -> Sub 1: Cardio (20min) + Sub 2: Musculação (40min).

Vínculo Dinâmico: Capacidade de associar tarefas existentes da lista de espera diretamente a um bloco durante a criação caso caiba no tempo total do bloco.

📥 3. Tarefas em Espera (Backlog Inteligente)
Espaço único para todas as tarefas. Separando apenas por cores de bloco jogando as tarefas de mais prioridade para cima.

Categorização: Cada tarefa pode ser "Sem Bloco" ou "Vinculada a Bloco X".

Herança Visual: Tarefas vinculadas herdam a cor/estilo do bloco pai.

Níveis de Prioridade: Tags visuais para Baixa, Média e Alta prioridade, influenciando o motor de sugestão.

🧠 4. Motor de Sugestão de Lógica
Preenchimento de Gaps: O sistema identifica espaços vazios na timeline e sugere tarefas "Sem Bloco" que caibam naquele tempo (baseado na prioridade).

Sugestão de Contexto: Ao abrir um bloco no dashboard, o sistema destaca dentro do  bloco  as tarefas da lista de espera vinculadas àquele bloco específico. Dando prioridade para prioridade alta, media e baixa.

🃏 5. Sistema de Cards Evolutivo
Fábrica de Cards: Interface para seleção de modelos de Cards.

Card "Prime" (Customizável): O modelo base atual (nome, ícone, cor, cargas, efeitos) permanece como o padrão, mas a arquitetura agora permite a adição de novos tipos (Cards de Buff, Cards de Penalidade, etc). Novos cards serão adicionados com o tempo.

6. Sistema de Historico dos cards
Sempre que um card for ultilizado ele deve aparecer uma mensagem perguntando o motivo do uso do card, após o motivo ser informado o card deve ser adicionado ao historico de cards com o nome do card, a data e o motivo do uso.
 
☁️ 6. Persistência de Dados (Supabase/Prisma recomendado)
 

Sincronização: Dados sincronizados em tempo real entre dispositivos.

4. ESTRUTURA DE DADOS (REFERÊNCIA)
JSON

{
  "bloco": {
    "id": "uuid",
    "titulo": "Foco Profundo",
    "cor": "#ff0000",
    "horario_inicio": "08:00",
    "duracao_total": 120,
    "sub_tarefas": [
      { "item": "Codar API", "duracao": 90, "status": "pending" },
      { "item": "Review", "duracao": 30, "status": "pending" }
    ]
  }
}

