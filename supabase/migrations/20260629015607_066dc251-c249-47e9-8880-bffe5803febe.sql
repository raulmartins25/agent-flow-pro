
CREATE TABLE public.clinic_units (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  brand TEXT,
  name TEXT NOT NULL,
  city TEXT,
  state TEXT,
  neighborhoods TEXT[] NOT NULL DEFAULT '{}',
  phone TEXT,
  maps_link TEXT,
  schedules_via_ecuro BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.clinic_units TO authenticated;
GRANT ALL ON public.clinic_units TO service_role;

ALTER TABLE public.clinic_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read clinic units"
ON public.clinic_units FOR SELECT
TO authenticated
USING (true);

CREATE TRIGGER update_clinic_units_updated_at
BEFORE UPDATE ON public.clinic_units
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_clinic_units_neighborhoods ON public.clinic_units USING GIN (neighborhoods);
CREATE INDEX idx_clinic_units_city ON public.clinic_units (lower(city));
CREATE INDEX idx_clinic_units_name ON public.clinic_units (lower(name));

INSERT INTO public.clinic_units (brand, name, city, state, neighborhoods, phone, maps_link, schedules_via_ecuro, notes) VALUES
('Sorria Goiás','Goiânia 1 - Araguaia','Goiânia','GO',ARRAY['St. Leste Universitário','St. Oeste','St. Central','St. Sul'],'(62) 3996-2588','https://maps.app.goo.gl/U7qgDfqDkKrYc2uH7',false,NULL),
('Sorria Goiás','Goiânia 2 - Anhanguera','Goiânia','GO',ARRAY['St. Leste Universitário','St. Oeste','St. Central','St. Sul'],'(62) 98634-2399','https://maps.app.goo.gl/3492iHr1hnud8xYy5',false,NULL),
('Sorria Goiás','Goiânia 3 - Campinas','Goiânia','GO',ARRAY['Vila Santa Helena','St Rodoviário','St Aeroporto'],'(62) 99619-8603','https://maps.app.goo.gl/756DdPzDTaFZsDu1A',false,NULL),
('Sorria Goiás','Garavelo','Aparecida de Goiânia','GO',ARRAY['Garavelo','Jardim Buriti Sereno','Setor Faiçalville'],'(62) 3578-6861','https://maps.app.goo.gl/MaDzGUCkH6KVitCm7',false,NULL),
('Sorria Goiás','Vila Brasília','Aparecida de Goiânia','GO',ARRAY['Nova Brasília','Aparecida de Goiânia','Parque Amazônia'],'(62) 3539-3022','https://maps.app.goo.gl/rozDEQMjk4BCUGRZA',false,NULL),
('Sorria Goiás','Trindade Maysa','Trindade','GO',ARRAY['Trindade','Parque dos Buriti','Jardim Ipanema'],'(62) 3093-3239','https://maps.app.goo.gl/rs3TbGQgFMZkR8PF9',false,NULL),
('Sorria Goiás','Trindade Centro','Trindade','GO',ARRAY['Trindade','Vila Maria','Jardim Imperial'],'(62) 3991-9525','https://maps.app.goo.gl/xjUFsyA9YBsUwF1U6',false,NULL),
('Sorria Goiás','Castelo Branco','Goiânia','GO',ARRAY['Setor Coimbra','Setor Oeste','Setor Bueno'],'(62) 3093-3239','https://maps.app.goo.gl/kGfpNmvduNHbVbYz6',false,NULL),
('Sorria Goiás','Senador Canedo','Senador Canedo','GO',ARRAY['Senador Canedo','Caldazinha','Jardim Veneza'],'(62) 99964-3921','https://maps.app.goo.gl/xkuY34jMEETDGYQd8',false,NULL),
('Sorria Goiás','Mangalô','Goiânia','GO',ARRAY['Vila Finsocial','Parque Tremendão','Setor Noroeste'],'(62) 3093-1819','https://maps.app.goo.gl/cACnCp3H6amnzYy16',false,NULL),
('Sorria Goiás','Santa Rita','Goiânia','GO',ARRAY['Parque Santa Rita','Residencial Granville','Abadia de Goiás'],'(62) 3291-9665','https://maps.app.goo.gl/vw1qdno8D8Ly8NVx9',false,NULL),
('Sorria Goiás','Independência','Aparecida de Goiânia','GO',ARRAY['Av. Independência','Cidade Livre','Setor Marista Sul','Aparecida de Goiânia'],'(62) 99640-6552','https://maps.app.goo.gl/RDNGAvYVinf9Adw56',false,NULL),
('Sorria Goiás','Madre Germana','Aparecida de Goiânia','GO',ARRAY['Vila Isaura','Conj. Hab. Madre Germana','Jardim Bosco'],'(62) 99495-4554','https://maps.app.goo.gl/9wogzXihXxrnLDqD9',false,NULL),
('Sorria Goiás','Vila Nova','Goiânia','GO',ARRAY['Setor Leste Vila Nova','Vila Santa Isabel','Vila Viana'],'(62) 99976-9409',NULL,false,'Inaugura 10/09'),
('Sorria Goiás','Goianira','Goianira','GO',ARRAY['Linda Vista','Parque Solimões','Setor Padre Pelágio'],'(62) 3142-6382','https://maps.app.goo.gl/dPiABxvnGeG4GkKx5',false,NULL),
('Sorria Goiás','Inhumas','Inhumas','GO',ARRAY['Av. Bernardo Sayão','Parque Santa Marta','St Saleiro'],'(62) 3514-5029','https://maps.app.goo.gl/hwSKoQxfQVyXKf4y6',false,NULL),
('Sorria Goiás','Vila Concórdia','Goiânia','GO',ARRAY['Vila Concórdia','Parque Alvorada','Jardim das Aroeiras'],'(62) 3636-6716','https://maps.app.goo.gl/MZfnwryYShZ7gBVU6',false,NULL),
('Sorria Goiás','Parque Anhanguera','Goiânia','GO',ARRAY['Parque Anhanguera','Parque Amazônia','Jardim América'],'(62) 3539-6740','https://maps.app.goo.gl/P29uaSE51RGRqC8SA',true,'Única unidade que agenda via Ecuro'),
('Oral Gold','Studio Oral Gold - Bueno','Goiânia','GO',ARRAY[]::TEXT[],'(62) 99925-6958','https://maps.app.goo.gl/8Bp68KDK4gyY23ei8',false,NULL),
('Sorria Goiás','Santo Hilário','Goiânia','GO',ARRAY[]::TEXT[],NULL,NULL,false,'Dados a completar'),
('Sorria Goiás','Quirinópolis','Quirinópolis','GO',ARRAY['Sol Nascente','Centro','São Francisco'],'(64) 3514-9418','https://maps.app.goo.gl/njcFJ2s6EZUsC6PT7',false,NULL),
('Sorria Goiás','Rio Verde 03','Rio Verde','GO',ARRAY['Jardim Margarida','St Morada do Sol','St Central'],'(64) 99610-3426','https://maps.app.goo.gl/JrUu1e8zqSjpp5aP7',false,NULL),
('Sorria Goiás','Jataí','Jataí','GO',ARRAY['Vila Santa Maria','Santa Lúcia','Vila Olavo'],'(64) 3052-0148','https://maps.app.goo.gl/igDETLt5vtkua1Nc6',false,NULL),
('Oral Gold','Catalão (Oral Gold)','Catalão','GO',ARRAY['Catalão','Goiandira','Ouvidor'],'(64) 3411-3721','https://maps.app.goo.gl/PuBZ5CEYo9mr5ayw6',false,NULL),
('Sorria Goiás','Anápolis 1 - Centro','Anápolis','GO',ARRAY['Anápolis','Jundaí','Munir Calixto'],'(62) 99113-4449','https://maps.app.goo.gl/gU5zDHYZQqNqC4Fp9',false,NULL),
('Sorria Goiás','Anápolis 2 - Vila Jaiara','Anápolis','GO',ARRAY['Jaciara','Anápolis','Miranápolis'],'(62) 3314-2399','https://maps.app.goo.gl/GEnAmWqpsWvHYLVZA',false,NULL),
('Sorria Goiás','Itumbiara','Itumbiara','GO',ARRAY['Itumbiara','Arapoã','Sarandi'],'(64) 3559-1551','https://maps.app.goo.gl/V9j1eFEs8UA4vUWk8',false,NULL),
('Sorria Goiás','Morrinhos','Morrinhos','GO',ARRAY['Morrinhos','Goiatuba','Jardim da Luz'],'(64) 99946-5882','https://maps.app.goo.gl/JJ1Cx1NZuxFjfNp88',false,NULL),
('Meu Sorriso','Canaã (Meu Sorriso)','Goiânia','GO',ARRAY['Cidade Jardim','Vila União','Vila Adélia'],'(62) 99819-4554','https://maps.app.goo.gl/6KmZWWQQoNbvMbVq7',false,NULL),
('Sorria Goiás','Formosa','Formosa','GO',ARRAY[]::TEXT[],'(62) 98487-9341','https://maps.app.goo.gl/46ZmcpcqomYoEuRn9',false,NULL),
('Sorria Goiás','Novo Gama','Novo Gama','GO',ARRAY[]::TEXT[],'(61) 3020-9392','https://maps.app.goo.gl/joQhW8qauCQS4Lsd6',false,NULL),
('Vamos Sorrir','Luziânia (Vamos Sorrir)','Luziânia','GO',ARRAY[]::TEXT[],'(61) 99425-7447','https://maps.app.goo.gl/VfuziLeew8b7bTqt5',false,NULL),
('Vamos Sorrir','Jardim Ingá (Vamos Sorrir)','Luziânia','GO',ARRAY[]::TEXT[],'(61) 98115-6045','https://maps.app.goo.gl/h61m91jvspUHWgS38',false,NULL),
('Vamos Sorrir','Águas Lindas (Vamos Sorrir)','Águas Lindas de Goiás','GO',ARRAY[]::TEXT[],'(61) 99233-8989','https://maps.app.goo.gl/X8Ujm1hBLUHEJLBN7',false,NULL),
('Vamos Sorrir','Santo Antônio (Vamos Sorrir)','Santo Antônio do Descoberto','GO',ARRAY['Santo Antônio do Descoberto'],'(61) 99448-1212','https://maps.app.goo.gl/EcLcQjh2PAzp1PhQ6',false,NULL),
('Vamos Sorrir','Planaltina (Vamos Sorrir)','Planaltina','DF',ARRAY[]::TEXT[],'(61) 99952-4814','https://maps.app.goo.gl/BAVQmDoFdUapnwug6',false,NULL),
('Vamos Sorrir','Paranoá (Vamos Sorrir)','Paranoá','DF',ARRAY[]::TEXT[],'(61) 3554-7710','https://maps.app.goo.gl/5tcA37SbWNXPQHhFA',false,NULL),
('Oral Gold','Plano Piloto (Oral Gold)','Brasília','DF',ARRAY[]::TEXT[],'(61) 3039-7655','https://maps.app.goo.gl/hwPadZsKWUEPxerr9',false,NULL),
('Oral Gold','Ceilândia (Oral Gold)','Ceilândia','DF',ARRAY[]::TEXT[],'(61) 3965-4145','https://maps.app.goo.gl/XDGhE5rEbauJbGZp9',false,NULL),
('Vamos Sorrir','Taguatinga (Vamos Sorrir)','Taguatinga','DF',ARRAY[]::TEXT[],'(61) 99317-5187','https://maps.app.goo.gl/hcnR4bfsTV87pxFF7',false,NULL),
('Vamos Sorrir','Núcleo Bandeirantes (Vamos Sorrir)','Núcleo Bandeirantes','DF',ARRAY[]::TEXT[],'(61) 99377-7007','https://maps.app.goo.gl/fZvuXJGMTYv4QFVz9',false,NULL),
('Sorria Goiás','Porto Velho','Porto Velho','RO',ARRAY[]::TEXT[],'(69) 99259-6194','https://maps.app.goo.gl/FPHLZnyB8crMXUMe6',false,NULL),
('Sorria Minas','Paracatu (Sorria Minas)','Paracatu','MG',ARRAY[]::TEXT[],'(038) 3672-3389','https://maps.app.goo.gl/V1d3Z795yLM8aTGb7',false,NULL),
('Vamos Sorrir','Jaciara (Vamos Sorrir)','Jaciara','MT',ARRAY[]::TEXT[],'(66) 3191-0761','https://maps.app.goo.gl/M75vcJgFsYgbP1Sq7',false,NULL),
('Vamos Sorrir','Rondonópolis (Vamos Sorrir)','Rondonópolis','MT',ARRAY[]::TEXT[],'(66) 3421-6790','https://maps.app.goo.gl/BdSEFA7nbzsmtTEn8',false,NULL),
('Sorria Pernambuco','Sorria Pernambuco (Goiana)','Goiana','PE',ARRAY[]::TEXT[],'(081) 3626-2677','https://maps.app.goo.gl/RYCYrRtnzNGV7N3X6',false,NULL),
('Sorria Pernambuco','Sorria Pernambuco Vitória (Santo Antão)','Vitória de Santo Antão','PE',ARRAY[]::TEXT[],'(083) 3523-4200','https://maps.app.goo.gl/k7ygqbJoiuS5MFLPA',false,NULL),
('Vamos Sorrir','Vamos Sorrir (Campina Grande)','Campina Grande','PB',ARRAY[]::TEXT[],'(083) 3201-9600','https://maps.app.goo.gl/upM7q9zeoD3YYwcX6',false,NULL),
('Sorria João Pessoa','Sorria João Pessoa','João Pessoa','PB',ARRAY[]::TEXT[],'(083) 98675-5542','https://maps.app.goo.gl/HJHYMCd85eb97Dm89',false,NULL);
