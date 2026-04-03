
-- Create enums
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');
CREATE TYPE public.agent_type AS ENUM ('receptive', 'prospecting');
CREATE TYPE public.agent_status AS ENUM ('active', 'paused', 'inactive');
CREATE TYPE public.tone_type AS ENUM ('formal', 'semi-formal', 'casual');
CREATE TYPE public.llm_provider AS ENUM ('claude', 'openai', 'deepseek');
CREATE TYPE public.conversation_status AS ENUM ('active', 'paused', 'transferred', 'closed');
CREATE TYPE public.message_role AS ENUM ('user', 'assistant', 'system');
CREATE TYPE public.media_type AS ENUM ('image', 'audio', 'document', 'video');
CREATE TYPE public.campaign_status AS ENUM ('pending', 'running', 'paused', 'completed', 'error');
CREATE TYPE public.contact_status AS ENUM ('pending', 'sent', 'error', 'replied');
CREATE TYPE public.plan_type AS ENUM ('free', 'pro', 'enterprise');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT,
  email TEXT,
  avatar_url TEXT,
  plan public.plan_type NOT NULL DEFAULT 'free',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', ''), NEW.email);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Agents
CREATE TABLE public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type public.agent_type NOT NULL DEFAULT 'receptive',
  status public.agent_status NOT NULL DEFAULT 'inactive',
  evolution_instance TEXT,
  evolution_api_url TEXT,
  evolution_api_key TEXT,
  transfer_number TEXT,
  transfer_trigger TEXT,
  llm_provider public.llm_provider NOT NULL DEFAULT 'claude',
  llm_model TEXT DEFAULT 'claude-sonnet-4-20250514',
  llm_api_key TEXT,
  prompt_compiled TEXT,
  followup_start_message INT DEFAULT 3,
  followup_max INT DEFAULT 3,
  followup_interval_minutes INT DEFAULT 120,
  restrictions TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own agents" ON public.agents FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_agents_updated_at BEFORE UPDATE ON public.agents FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Agent config
CREATE TABLE public.agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  agent_persona_name TEXT,
  company_name TEXT,
  segment TEXT,
  tone public.tone_type NOT NULL DEFAULT 'semi-formal',
  product_service_description TEXT,
  welcome_message TEXT,
  first_prospecting_message TEXT,
  qualification_questions JSONB DEFAULT '[]'::jsonb,
  objection_handlers JSONB DEFAULT '[]'::jsonb,
  ai_restrictions TEXT,
  transfer_summary_template TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.agent_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own agent configs" ON public.agent_config FOR ALL
  USING (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_config.agent_id AND agents.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_config.agent_id AND agents.user_id = auth.uid()));
CREATE TRIGGER update_agent_config_updated_at BEFORE UPDATE ON public.agent_config FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Conversations
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  contact_number TEXT NOT NULL,
  contact_name TEXT,
  status public.conversation_status NOT NULL DEFAULT 'active',
  agent_paused BOOLEAN NOT NULL DEFAULT false,
  followup_count INT NOT NULL DEFAULT 0,
  last_message_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own conversations" ON public.conversations FOR ALL
  USING (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = conversations.agent_id AND agents.user_id = auth.uid()));

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role public.message_role NOT NULL,
  content TEXT,
  media_url TEXT,
  media_type public.media_type,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own messages" ON public.messages FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.agents a ON a.id = c.agent_id
    WHERE c.id = messages.conversation_id AND a.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.conversations c
    JOIN public.agents a ON a.id = c.agent_id
    WHERE c.id = messages.conversation_id AND a.user_id = auth.uid()
  ));

-- Blast campaigns
CREATE TABLE public.blast_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status public.campaign_status NOT NULL DEFAULT 'pending',
  total_contacts INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  error_count INT NOT NULL DEFAULT 0,
  batch_size INT NOT NULL DEFAULT 10,
  interval_seconds INT NOT NULL DEFAULT 45,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.blast_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own campaigns" ON public.blast_campaigns FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Blast contacts
CREATE TABLE public.blast_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.blast_campaigns(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  name TEXT,
  custom_vars JSONB,
  status public.contact_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE
);
ALTER TABLE public.blast_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own blast contacts" ON public.blast_contacts FOR ALL
  USING (EXISTS (SELECT 1 FROM public.blast_campaigns WHERE blast_campaigns.id = blast_contacts.campaign_id AND blast_campaigns.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.blast_campaigns WHERE blast_campaigns.id = blast_contacts.campaign_id AND blast_campaigns.user_id = auth.uid()));

-- Simulator shares
CREATE TABLE public.simulator_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
ALTER TABLE public.simulator_shares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own simulator shares" ON public.simulator_shares FOR ALL
  USING (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = simulator_shares.agent_id AND agents.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = simulator_shares.agent_id AND agents.user_id = auth.uid()));
-- Public read for shared simulators
CREATE POLICY "Anyone can read valid shares" ON public.simulator_shares FOR SELECT USING (expires_at > now());
