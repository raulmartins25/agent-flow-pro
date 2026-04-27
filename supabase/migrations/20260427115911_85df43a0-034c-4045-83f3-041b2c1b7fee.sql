
UPDATE agents
SET prompt_compiled = prompt_compiled || E'\n\nREGRA — OBJEÇÃO DE PREÇO (REFORÇO): ao explicar que o valor depende de exame presencial, SEMPRE use a frase "a boa notícia é que a avaliação é sem custo essa semana e inclui o exame de imagem". NUNCA escreva "avaliação é gratuita" nesse contexto — use "sem custo essa semana" para manter o gatilho de escassez.'
WHERE id = '9d01e0ff-9bf3-4fe5-8979-cd10e692ec6e';

UPDATE agent_config
SET ai_restrictions = ai_restrictions || E'\n\nFRASE OBRIGATÓRIA — OBJEÇÃO DE VALOR/PREÇO: ao responder dúvidas sobre valor de tratamento, use SEMPRE "a boa notícia é que a avaliação é sem custo essa semana e inclui o exame de imagem" (nunca "é gratuita" nesse contexto).'
WHERE agent_id = '9d01e0ff-9bf3-4fe5-8979-cd10e692ec6e';
