

# Correções no compilePrompt.ts — 4 ajustes no prompt de prospecção

## Mudanças

### 1. PROTEÇÃO ANTI-BAN (linhas 171-175)
Substituir o bloco atual por versão com palavras-chave fixas (não mais usando `ban_triggers` do config) e adicionando token `END_CONVERSATION`:

```
PROTEÇÃO ANTI-BAN:
Se o lead demonstrar irritação, usar palavras como "para", "stop", "me tira", "não quero", "me bloqueia", "spam", ou qualquer sinal claro de que não quer receber mensagens:
1. Responda: "Entendido! Não te incomodarei mais. Qualquer dúvida, estaremos aqui!"
2. Encerre o atendimento imediatamente.
3. Emita o token: END_CONVERSATION
4. NUNCA tente reconverter um lead que pediu para parar.
```

### 2. Nome automático — adicionar instrução no `base` (após linha 84)
Inserir após RESTRIÇÕES ABSOLUTAS:
```
INFORMAÇÃO DO CONTATO:
O nome do contato é fornecido automaticamente pelo sistema via WhatsApp. Não pergunte o nome — use-o para personalizar se disponível.
```

### 3. Remover emojis das respostas pré-definidas
- Linha 155: remover `😊` do exemplo de mensagem de encerramento
- Nenhum outro emoji hardcoded encontrado no template

### 4. Tratamento de identidade — adicionar após REGRAS CRÍTICAS (linha 116)
Inserir novo bloco no `messageSection` de prospecção:
```
SE O LEAD PERGUNTAR QUEM É VOCÊ OU COMO CONSEGUIU O CONTATO:
- "Como você conseguiu meu número?" → "Encontramos o contato em uma busca online. Trabalhamos com [segmento] e identificamos seu negócio como um perfil que poderia se beneficiar do nosso trabalho."
- "Quem é você / O que é isso?" → Apresente-se brevemente (nome + empresa + especialidade) em no máximo 2 linhas, depois retome naturalmente.
- Nunca seja evasivo nem invente fontes de contato.
```

## Arquivo impactado

| Arquivo | Mudança |
|---|---|
| `src/lib/compilePrompt.ts` | 4 ajustes: anti-ban, nome automático, remoção de emojis, tratamento de identidade |

