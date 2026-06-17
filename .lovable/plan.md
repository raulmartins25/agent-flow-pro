# Ajuste de comportamento — Jordana (objeção de preço)

## Problema
Hoje a Jordana trata QUALQUER pergunta sobre valor como gatilho automático para empurrar a avaliação. Isso aparece em 3 lugares do `agent_config` reforçando o mesmo padrão:

1. Regra 4 ("VALORES E DESCONTOS") — bloqueia preço e manda agendar.
2. `objection_handlers` "Tá caro" / "Quero saber o preço antes" — terminam **sempre** com "Posso agendar?".
3. "FRASE OBRIGATÓRIA — OBJEÇÃO DE VALOR/PREÇO" — script fixo de venda.

Resultado: leads como Pérola H., Manoel A. e Rose perguntam preço, recebem desvio robótico e abandonam.

## O que muda (apenas dados — sem código)
Update no `agent_config` da Jordana (`agent_id = 9d01e0ff-9bf3-4fe5-8979-cd10e692ec6e`). Nenhuma alteração em `compilePrompt.ts`, edge functions, UI ou outros agentes.

### 1. Reescrever a Regra 4 ("VALORES E DESCONTOS")
A IA precisa **acolher** antes de oferecer agendamento. **PROIBIDO citar qualquer valor, faixa, "a partir de", estimativa, "varia entre X e Y" ou número monetário.** Nova diretriz:

- Reconhecer a pergunta de forma direta ("ótima pergunta", "faz total sentido querer saber").
- Explicar **por que** não tem preço fechado: cada caso (quantidade de dentes, tipo de implante, material, complexidade) muda o orçamento — é técnico, não desculpa.
- **NUNCA** mencionar valor, faixa, mínimo, máximo, "a partir de", "geralmente custa", nem comparações de preço. Se o lead insistir ("me dá só uma ideia", "uma faixa", "mais ou menos"), manter a mesma linha: explicar de novo a variável técnica e reforçar que só o dentista, presencialmente, consegue dar o número certo.
- **SÓ depois** da explicação, oferecer a avaliação gratuita como caminho para o orçamento exato — **uma vez por turno**.
- Proibido responder pergunta de preço apenas com "vamos agendar?".

### 2. Reescrever os `objection_handlers` de preço
- **"Tá caro"** → validar ("entendo, investimento odontológico realmente pesa"), reforçar que existem caminhos de tratamento diferentes para cada caso, **sem citar valor nem parcelamento proativo**. Só então convidar para avaliação.
- **"Quero saber o preço antes"** → reconhecer a pergunta como legítima, explicar por que o orçamento é personalizado (variáveis técnicas), pedir mais detalhes da queixa para o dentista poder avaliar melhor. **Não dar número, não dar faixa.** Convidar para avaliação no fim.

### 3. Remover a "FRASE OBRIGATÓRIA"
Apagar a regra que força sempre "a boa notícia é que a avaliação é sem custo essa semana...". Ela é o principal motor do desvio robótico. A oferta com escassez na seção "ABORDAGEM DE OFERTA" continua existindo (e já tem critério próprio).

### 4. Reforçar regra anti-loop
Adicionar: "Se o lead repetir a pergunta de preço, NÃO repita o convite para agendar nem cite valor. Aprofunde a explicação técnica ou peça mais detalhes da queixa."

## Garantias de não-regressão
- Mudança escopada por `agent_id` — só Jordana. Outros agentes intactos.
- Fluxo de qualificação (4 perguntas), Ecuro/agendamento, transferência, anti-ban, regras de convênio/parcelamento permanecem **idênticos**.
- A oferta com gatilho de escassez ("vagas de avaliação sem custo") continua disponível — apenas deixa de ser resposta automática para preço.
- Validação após aplicar: rodar `simulate-chat` com 3 cenários — "quanto custa um implante?", "tá caro", "me dá uma faixa de preço" — confirmando que (a) a IA não cita nenhum valor, (b) acolhe e explica antes de convidar, (c) ainda agenda normalmente quando o lead pede.

## Fora de escopo
- Não altero código.
- Não mexo em outros agentes.
- Não cito valores em lugar nenhum do prompt.
