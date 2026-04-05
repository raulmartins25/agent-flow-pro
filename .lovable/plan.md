

# Editor Rico para Template de Resumo — WizardStep6

## O que muda
Substituir o `<Textarea>` simples do template de resumo por um editor rico com:
1. **Barra de variáveis clicáveis** — chips que inserem `{{nome_contato}}`, `{{telefone}}`, `{{data}}`, `{{agente}}`, `{{perguntas_respostas}}` na posição do cursor
2. **Picker de emojis** — botão que abre um popover com emojis populares do WhatsApp organizados por categoria
3. **Variáveis de perguntas cadastradas** — para cada pergunta de qualificação existente, mostrar um chip com o texto da pergunta que insere `{{pergunta_N}}` e `{{resposta_N}}` no template
4. **Preview atualizado** — renderizar as variáveis de perguntas com exemplos realistas

## Arquivo impactado
| Arquivo | Mudança |
|---|---|
| `src/components/wizard/WizardStep6.tsx` | Editor rico com variáveis, emojis e perguntas |

## Detalhes técnicos

### Barra de variáveis (acima do textarea)
- Row de chips/badges clicáveis: `{{nome_contato}}`, `{{telefone}}`, `{{data}}`, `{{agente}}`, `{{perguntas_respostas}}`
- Ao clicar, insere o texto na posição atual do cursor no textarea (via `selectionStart` do ref)
- Visual: `Badge` com `variant="outline"` e `cursor-pointer hover:bg-primary/10`

### Picker de emojis
- Botão `😀` ao lado do textarea (ou na barra de variáveis)
- Abre `Popover` com grid de emojis comuns do WhatsApp: 👋 😊 ✅ 📋 👤 📱 📅 🎯 💰 🔥 ⭐ 📝 📞 💼 🏢 ❤️ 👍 🙏 etc.
- Ao clicar um emoji, insere na posição do cursor

### Variáveis de perguntas cadastradas
- Seção abaixo das variáveis padrão: "Perguntas cadastradas"
- Para cada `wizardData.qualification_questions`, mostrar:
  - Chip `📝 P1: {texto truncado}` → insere `{{pergunta_1}}`
  - Chip `💬 R1` → insere `{{resposta_1}}`
- Se não há perguntas cadastradas, mostrar texto: "Cadastre perguntas no Step 4"

### Preview melhorado
- Além das variáveis existentes, substituir `{{pergunta_N}}` e `{{resposta_N}}` com exemplos das perguntas reais cadastradas
- Ex: `{{pergunta_1}}` → texto real da pergunta, `{{resposta_1}}` → "Resposta do lead"

### Suporte no backend (process-message)
- No bloco de transferência, ao montar o `perguntasRespostas`, também substituir `{{pergunta_N}}` e `{{resposta_N}}` individualmente caso o template use essas variáveis em vez de `{{perguntas_respostas}}`

