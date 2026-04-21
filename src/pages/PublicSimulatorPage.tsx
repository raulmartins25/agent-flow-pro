import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Send, Loader2, CheckCircle2, Bot } from 'lucide-react';
import { toast } from 'sonner';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function PublicSimulatorPage() {
  const { token } = useParams();
  const [agent, setAgent] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [transferred, setTransferred] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const { data, error } = await supabase.functions.invoke('public-simulator-agent', {
        body: { token },
      });
      if (error || !data?.agent) { setNotFound(true); return; }

      const ag = data.agent;
      const cfg = data.config;
      setAgent(ag);
      setConfig(cfg);

      const welcomeMsg = ag.type === 'receptive'
        ? (cfg?.welcome_message || 'Olá! Como posso ajudar?')
        : (cfg?.first_prospecting_message || 'Olá!');
      const formatted = welcomeMsg
        .replace('{{nome_contato}}', 'Visitante')
        .replace('{{nome_agente}}', cfg?.agent_persona_name || 'Agente')
        .replace('{{empresa}}', cfg?.company_name || 'Empresa');
      setMessages([{ role: 'assistant', content: formatted }]);
    };
    load();
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading || !agent) return;
    const userMsg: Msg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setTyping(true);

    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    setTyping(false);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('public-simulator-chat', {
        body: {
          token,
          messages: [...messages, userMsg],
        },
      });

      if (error) {
        const msg = (data as any)?.error || error.message || 'Erro desconhecido';
        toast.error(msg);
        setLoading(false);
        return;
      }
      if ((data as any)?.error) {
        toast.error((data as any).error);
        setLoading(false);
        return;
      }
      if (!data?.response) {
        toast.error('Resposta vazia do agente');
        setLoading(false);
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);

      if (config?.qualification_questions) {
        const qCount = (config.qualification_questions as any[]).length;
        const userCount = [...messages, userMsg].filter(m => m.role === 'user').length;
        if (qCount > 0 && userCount >= qCount) setTransferred(true);
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao processar');
    }
    setLoading(false);
  };

  if (notFound) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <div className="text-center">
          <p className="text-lg font-semibold">Link expirado ou inválido</p>
          <p className="text-muted-foreground text-sm">Este simulador não está mais disponível.</p>
        </div>
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <div className="h-14 border-b flex items-center px-4 gap-3 bg-background">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary">
          <Bot className="h-4 w-4 text-primary-foreground" />
        </div>
        <div>
          <p className="font-semibold text-sm">{config?.agent_persona_name || agent.name}</p>
          <p className="text-xs text-muted-foreground">{config?.company_name || ''}</p>
        </div>
      </div>

      {transferred && (
        <div className="bg-primary/20 text-primary px-4 py-2 text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />Lead qualificado!
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/30">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[70%] rounded-xl px-4 py-2 text-sm ${
              msg.role === 'user'
                ? 'bg-primary/20 text-foreground rounded-br-sm'
                : 'bg-card text-foreground rounded-bl-sm border'
            }`}>
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
          </div>
        ))}
        {typing && (
          <div className="flex justify-start">
            <div className="bg-card border rounded-xl px-4 py-2 text-sm text-muted-foreground">digitando...</div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t p-3 bg-background">
        <div className="flex gap-2 max-w-2xl mx-auto">
          <Input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder="Digite uma mensagem..."
            disabled={loading}
          />
          <Button size="icon" onClick={sendMessage} disabled={loading || !input.trim()}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-center text-xs text-muted-foreground mt-2">Desenvolvido com AgentFlow</p>
      </div>
    </div>
  );
}
