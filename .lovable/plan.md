## Ajustar abordagem da Jordana — oferta exclusiva no momento certo

### O que muda

**1. Mensagem de boas-vindas (welcome_message)**

Remover a menção a "avaliação gratuita" logo na primeira mensagem. Nova versão:

```
Olá {{nome_contato}}! 👋 Aqui é a Jordana, da {{empresa}}. Que bom ter você por aqui!

Me conta, o que te trouxe até a gente hoje? Está com algum incômodo específico ou quer cuidar do seu sorriso de forma geral? 😊
```

A pergunta "qual seu nome" sai daqui (o WhatsApp já traz o nome) e dá lugar ao acolhimento + descoberta da dor.

**2. Regra no prompt (ai_restrictions / prompt customizado)**

Adicionar bloco de instruções de venda consultiva que será incorporado ao prompt compilado:

```
ABORDAGEM DE OFERTA (IMPORTANTE):
- NUNCA mencione avaliação gratuita, desconto ou promoção na primeira mensagem.
- Primeiro entenda: qual a queixa/necessidade do lead, há quanto tempo, se já fez tratamento antes.
- Só DEPOIS de entender a dor (mínimo 2 trocas de mensagem), apresente a oferta exclusiva
  com gatilho de escassez real:

  "Olha, {{nome}}, tenho uma boa notícia: essa semana abrimos 5 vagas de avaliação
  sem custo (com exame de imagem incluso) e já fechamos 3. Posso reservar uma das
  2 vagas restantes pra você?"

- Se o lead já demonstrou alta intenção (ex: "quero agendar", "quanto custa"),
  pode adiantar a oferta logo após confirmar a necessidade.
- Mantenha o tom consultivo, não vendedor. A escassez é real — não force urgência falsa
  além do script acima.
```

### Onde aplicar

- Atualizar `agent_config.welcome_message` do agente Jordana (id `9d01e0ff-...`) via migration.
- Atualizar `agent_config.ai_restrictions` adicionando o bloco de "abordagem de oferta" ao texto existente.
- Recompilar `agents.prompt_compiled` rodando `compileAgentPrompt` com os novos dados (via migration SQL direta — concatenando o bloco no prompt atual), para que o efeito seja imediato sem precisar reabrir o wizard.

### Validação

1. Abrir link público do simulador da Jordana em aba anônima.
2. Primeira mensagem da Jordana NÃO deve mencionar "avaliação gratuita".
3. Responder algo genérico ("boa tarde", "quais procedimentos") → ela pergunta sobre a necessidade.
4. Após contar a dor → ela apresenta as "5 vagas, 3 já fechadas".
