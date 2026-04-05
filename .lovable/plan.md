

# Mídia Condicional nas Perguntas de Qualificação (Step 4)

## Visão Geral
Adicionar suporte a upload de mídia em cada pergunta de qualificação, com mensagem de oferta, upload para Storage, e envio condicional via Evolution API quando a LLM emitir `SEND_MEDIA:{id}`.

---

## 1. Migração SQL — Bucket `agent-media`

```sql
INSERT INTO storage.buckets (id, name, public) VALUES ('agent-media', 'agent-media', true);

CREATE POLICY "Public read agent-media" ON storage.objects FOR SELECT USING (bucket_id = 'agent-media');
CREATE POLICY "Authenticated upload agent-media" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'agent-media');
CREATE POLICY "Authenticated delete agent-media" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'agent-media');
```

## 2. `src/stores/agentStore.ts` — Atualizar tipo

Substituir os campos `followup_media_url?` e `followup_media_type?` pela nova estrutura `media?`:

```typescript
qualification_questions: Array<{
  id: string;
  question: string;
  media?: {
    offer_message: string;
    file_url: string;
    file_name: string;
    file_type: 'image' | 'audio' | 'document' | 'video';
    send_condition: 'positive_response' | 'always' | 'explicit_yes';
  };
}>;
```

## 3. `src/components/wizard/WizardStep4.tsx` — UI completa

Cada pergunta ganha um botão colapsável "+ Anexar mídia" usando `Collapsible`. Ao expandir:

- **Textarea** "Mensagem de oferta" — placeholder: "Ex: Posso te enviar nosso portfólio para você ver como trabalhamos?"
- **Upload de arquivo** — aceita `.pdf,.mp4,.mp3,.ogg,.jpg,.png,.jpeg`. Faz upload via `supabase.storage.from('agent-media').upload(...)`. Mostra barra de progresso. Preview por tipo de arquivo (thumbnail, ícone PDF, ícone mic, ícone play). Botão X para remover.
- **Select** "Quando enviar?" — 3 opções: positive_response (default), always, explicit_yes.

Path no storage: `{question_id}/{filename}` (sem agent_id pois o agente ainda não existe no momento da criação).

## 4. `src/lib/compilePrompt.ts` — Instruções de mídia no prompt

Atualizar o tipo `AgentData.qualification_questions` para incluir `media?`. Na formatação das perguntas, para cada uma que tiver `media`:

```
Pergunta N: "pergunta"
  ↳ Após esta pergunta, se o lead [condição], faça a oferta: "offer_message"
  Se aceitar: inclua exatamente o texto SEND_MEDIA:{question_id} na sua resposta.
  Se recusar: continue normalmente. NUNCA envie mídia sem perguntar (exceto 'always').
```

Mapeamento de condição:
- `positive_response` → "demonstrar interesse ou responder positivamente"
- `always` → "(envie automaticamente, sem perguntar)"
- `explicit_yes` → "responder explicitamente com 'sim' ou 'pode'"

## 5. `supabase/functions/process-message/index.ts` — Detectar e enviar mídia

Após gerar `aiResponse`, antes de salvar/enviar:

1. Regex para encontrar `SEND_MEDIA:([a-f0-9-]+)` no texto
2. Para cada match: buscar a pergunta no `config.qualification_questions` pelo ID
3. Determinar endpoint Evolution por `file_type`:
   - `image` → `sendMedia` com `mediatype: "image"`
   - `audio` → `sendWhatsAppAudio` (PTT)
   - `document` → `sendMedia` com `mediatype: "document"`
   - `video` → `sendMedia` com `mediatype: "video"`
4. Enviar via Evolution API
5. Salvar mensagem de mídia em `messages` com `media_url` e `media_type`
6. Remover tokens `SEND_MEDIA:...` do texto antes de salvar/enviar o texto

---

## Arquivos impactados

| Arquivo | Ação |
|---|---|
| Migração SQL | Bucket `agent-media` + políticas |
| `src/stores/agentStore.ts` | Tipo `media?` nas questions |
| `src/components/wizard/WizardStep4.tsx` | UI upload + collapsible |
| `src/lib/compilePrompt.ts` | Instruções SEND_MEDIA no prompt |
| `supabase/functions/process-message/index.ts` | Detectar token + enviar mídia |

