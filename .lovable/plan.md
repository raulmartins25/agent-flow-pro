

# AgentFlow — Plataforma SaaS de Agentes IA para WhatsApp

## Visão Geral
Plataforma completa para criação e gestão de agentes de IA no WhatsApp via Evolution API, com inbox, disparos em massa, simulador e motor de prompt inteligente.

---

## Fase 1 — Fundação
- Instalar dependências: Zustand, React Hook Form, Zod, date-fns, PapaParse, SheetJS, Framer Motion
- Configurar tema dark/light com cor primária verde WhatsApp (#25D366), fonte Inter
- Criar layout base com sidebar colapsável (navegação: Dashboard, Agentes, Inbox, Disparos, Settings)
- Configurar todas as rotas com React Router v6
- Implementar autenticação completa (email/senha + Google) com Supabase Auth
- Criar tabela `profiles` com trigger auto-create no signup
- Criar tabela `user_roles` para controle de acesso

## Fase 2 — Banco de Dados
- Migration: tabelas `agents`, `agent_config` com todos os campos especificados
- Migration: tabelas `conversations`, `messages`
- Migration: tabelas `blast_campaigns`, `blast_contacts`
- Migration: tabela `simulator_shares` (agent_id, token, expires_at)
- RLS policies em todas as tabelas (user_id scoped)

## Fase 3 — Criação de Agente (Wizard 6 etapas)
- Stepper visual com validação por etapa
- **Etapa 1**: Tipo (Receptivo/Prospecção) com cards visuais + conexão Evolution API com botão "Testar conexão"
- **Etapa 2**: Identidade — persona, empresa, segmento, tom de voz (cards), descrição, restrições
- **Etapa 3**: Mensagem inicial — textarea com variáveis + preview como bolha WhatsApp (condicional por tipo)
- **Etapa 4**: Perguntas de qualificação — lista dinâmica com drag-and-drop, toggle de mídia, upload de arquivo
- **Etapa 5**: Objeções (lista editável com exemplos), followup (config de intervalos e mensagens), proteção anti-ban (gatilhos editáveis)
- **Etapa 6**: Transferência (número destino, gatilho, template de resumo com preview) + seleção de LLM (cards comparativos)
- Ao salvar: compilar prompt e mostrar preview

## Fase 4 — Motor de Prompt
- Função `compileAgentPrompt()` que monta o prompt final com templates para Receptivo e Prospecção
- Inclui todas as variáveis: persona, tom, perguntas, objeções, followup, anti-ban, transferência
- Edge Function `/compile-prompt` para compilação server-side

## Fase 5 — Inbox
- Layout 2 colunas estilo WhatsApp Web
- Lista de conversas com busca, filtros (Ativas/Pausadas/Transferidas), badges
- Chat com bolhas WhatsApp, suporte a texto/imagem/áudio/documento
- Botão pausar/retomar agente por conversa
- Input desabilitado quando agente ativo, habilitado quando pausado

## Fase 6 — Edge Functions (Webhooks e IA)
- `/evolution-webhook` — recebe eventos da Evolution API (messages.upsert, connection.update)
- `/process-message` — processa mensagem com LLM configurado (Claude via Lovable AI, OpenAI, DeepSeek)
- `/send-message` e `/send-media` — enviam via Evolution API
- `/transfer-lead` — envia resumo de transferência

## Fase 7 — Disparos em Massa
- Listagem de campanhas com status visual
- Criação: seleção de agente, upload CSV/XLS com processamento automático de números BR
- Preview da lista importada com validação por linha
- Config de lotes (tamanho, intervalos, horário de funcionamento)
- Monitoramento: barra de progresso, cards de métricas, tabela de contatos, log em tempo real
- Edge Function `/blast-processor` com rate limiting e lógica anti-ban (variação de intervalos, parada se erro > 20%)
- Exportar relatório CSV

## Fase 8 — Simulador
- Interface de chat estilo WhatsApp com painel de controle
- Toggle Receptivo/Prospecção, botão reiniciar, ver prompt compilado
- Indicador de pergunta ativa e próxima ação esperada
- Delay simulado "digitando..." antes das respostas
- Indicador de transferência com preview do resumo
- Link de compartilhamento público (token UUID, sem auth necessário)

## Fase 9 — Settings e Dashboard
- Settings: Perfil (nome, email, avatar), Plano (uso, upgrade), LLM Global (chaves API padrão)
- Dashboard: cards com agentes ativos, conversas hoje, disparos rodando, métricas resumidas

## Design
- Dark mode padrão com toggle light/dark
- Cor primária: verde WhatsApp (#25D366)
- Sidebar colapsável com ícones Lucide
- Fonte Inter
- Transições com Framer Motion
- Toast notifications com Sonner
- Loading states e empty states ilustrados em todas as listas

