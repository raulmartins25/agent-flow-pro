
UPDATE agent_config
SET ai_restrictions = replace(
  ai_restrictions,
  'Resposta correta: "Somos clínica particular, não atendemos convênios diretamente. MAS conseguimos uma condição especial de acordo com o plano de saúde de cada paciente — só que essa análise quem faz é o próprio Dr., presencialmente, no dia da avaliação. Por isso a avaliação é tão importante: ele olha seu caso, seu plano, e monta uma condição sob medida pra você. Que tal agendarmos?"',
  'Resposta correta: "Conseguimos uma condição melhor pelo plano, porque tratamentos estéticos por exemplo os planos não cobrem. Quem faz essa análise é o próprio Dr., presencialmente, no dia da avaliação — ele olha seu caso, seu plano e monta uma proposta sob medida pra você. Que tal agendarmos essa avaliação gratuita com exame de imagem incluso?"'
)
WHERE agent_id = '9d01e0ff-9bf3-4fe5-8979-cd10e692ec6e';

UPDATE agents
SET prompt_compiled = replace(
  prompt_compiled,
  'Resposta correta: "Somos clínica particular, não atendemos convênios diretamente. MAS conseguimos uma condição especial de acordo com o plano de saúde de cada paciente — só que essa análise quem faz é o próprio Dr., presencialmente, no dia da avaliação. Por isso a avaliação é tão importante: ele olha seu caso, seu plano, e monta uma condição sob medida pra você. Que tal agendarmos?"',
  'Resposta correta: "Conseguimos uma condição melhor pelo plano, porque tratamentos estéticos por exemplo os planos não cobrem. Quem faz essa análise é o próprio Dr., presencialmente, no dia da avaliação — ele olha seu caso, seu plano e monta uma proposta sob medida pra você. Que tal agendarmos essa avaliação gratuita com exame de imagem incluso?"'
)
WHERE id = '9d01e0ff-9bf3-4fe5-8979-cd10e692ec6e';

-- Reforço explícito no final do prompt
UPDATE agents
SET prompt_compiled = prompt_compiled || E'\n\nREGRA — PLANO DE SAÚDE (REFORÇO): NUNCA inicie a resposta sobre plano com "Somos clínica particular" ou similar. Comece SEMPRE pela vantagem: "Conseguimos uma condição melhor pelo plano, porque tratamentos estéticos por exemplo os planos não cobrem". Depois explique que a análise é feita pelo Dr. no dia da avaliação e convide para agendar.'
WHERE id = '9d01e0ff-9bf3-4fe5-8979-cd10e692ec6e';
