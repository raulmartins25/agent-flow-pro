import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Send, RotateCcw, FileText, Share2, CheckCircle2, Loader2, Pencil, Calendar, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { compileAgentPrompt } from '@/lib/compilePrompt';

type Msg = { role: 'user' | 'assistant'; content: string };

export default function SimulatorPage() {
  const { id } = useParams();
  const [agent, setAgent] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [typing, setTyping] = useState(false);
  const [transferred, setTransferred] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [editPromptOpen, setEditPromptOpen] = useState(false);
  const [editedPrompt, setEditedPrompt] = useState('');
  const [savingPrompt, setSavingPrompt] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    const fetch = async () => {
      const { data: ag } = await supabase.from('agents').select('*').eq('id', id).single();
      const { data: cfg } = await supabase.from('agent_config').select('*').eq('agent_id', id).single();
      setAgent(ag);
      setConfig(cfg);

      // Send initial message
      if (ag && cfg) {
        const welcomeMsg = ag.type === 'receptive'
          ? (cfg.welcome_message || 'Olá! Como posso ajudar?')
          : (cfg.first_prospecting_message || 'Olá! Tudo bem?');
        const formatted = welcomeMsg
          .replace('{{nome_contato}}', 'Visitante')
          .replace('{{nome_agente}}', cfg.agent_persona_name || 'Agente')
          .replace('{{empresa}}', cfg.company_name || 'Empresa');
        setMessages([{ role: 'assistant', content: formatted }]);
      }
    };
    fetch();
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading || !agent) return;
    const userMsg: Msg = { role: 'user', content: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setTyping(true);

    // Simulate typing delay
    await new Promise(r => setTimeout(r, 1000 + Math.random() * 2000));
    setTyping(false);
    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('simulate-chat', {
        body: {
          messages: [...messages, userMsg],
          prompt: agent.prompt_compiled || compileAgentPrompt({ ...config, ...agent }),
          llm_provider: agent.llm_provider,
          llm_model: agent.llm_model,
          llm_api_key: agent.llm_api_key,
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
      const aiResponse = data?.response;
      if (!aiResponse) {
        toast.error('Resposta vazia do agente');
        setLoading(false);
        return;
      }
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);

      // Check for transfer trigger
      if (config?.qualification_questions) {
        const qCount = (config.qualification_questions as any[]).length;
        const userMsgCount = [...messages, userMsg].filter(m => m.role === 'user').length;
        if (qCount > 0 && userMsgCount >= qCount) {
          setTransferred(true);
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao processar mensagem');
    }
    setLoading(false);
  };

  const resetChat = () => {
    setMessages([]);
    setTransferred(false);
    if (config) {
      const welcomeMsg = agent?.type === 'receptive'
        ? (config.welcome_message || 'Olá!')
        : (config.first_prospecting_message || 'Olá!');
      const formatted = welcomeMsg
        .replace('{{nome_contato}}', 'Visitante')
        .replace('{{nome_agente}}', config.agent_persona_name || 'Agente')
        .replace('{{empresa}}', config.company_name || 'Empresa');
      setMessages([{ role: 'assistant', content: formatted }]);
    }
  };

  const generateShareLink = async () => {
    if (!id) return;
    const { data, error } = await supabase.from('simulator_shares').insert({
      agent_id: id,
    }).select().single();
    if (error) { toast.error(error.message); return; }
    const token = data.token;
    setShareToken(token);
    const url = `${window.location.origin}/simulator/share/${token}`;
    await navigator.clipboard.writeText(url);
  };

  const savePrompt = async () => {
    if (!id) return;
    setSavingPrompt(true);
    const { error } = await supabase
      .from('agents')
      .update({ prompt_compiled: editedPrompt, custom_prompt_enabled: true })
      .eq('id', id);
    setSavingPrompt(false);
    if (error) { toast.error(error.message); return; }
    setAgent({ ...agent, prompt_compiled: editedPrompt, custom_prompt_enabled: true });
    toast.success('Prompt salvo. Será usado na próxima mensagem.');
    setEditPromptOpen(false);
  };

  if (!agent) {
    return (
      <div className="flex justify-center py-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  const compiledPrompt = agent.prompt_compiled || (config ? compileAgentPrompt({ ...config, ...agent }) : '');

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6 gap-0">
      {/* Sidebar */}
      <div className="w-72 border-r p-4 space-y-4 overflow-y-auto bg-background">
        <div>
          <h2 className="font-bold text-lg">{agent.name}</h2>
          <Badge variant="outline">{agent.type === 'receptive' ? 'Receptivo' : 'Prospecção'}</Badge>
        </div>

        <div className="space-y-2">
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={resetChat}>
            <RotateCcw className="mr-2 h-4 w-4" />Reiniciar
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setShowPrompt(!showPrompt)}>
            <FileText className="mr-2 h-4 w-4" />{showPrompt ? 'Ocultar prompt' : 'Ver prompt'}
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => { setEditedPrompt(compiledPrompt); setEditPromptOpen(true); }}>
            <Pencil className="mr-2 h-4 w-4" />Editar prompt (avançado)
          </Button>
          <Button variant="outline" size="sm" className="w-full justify-start" onClick={generateShareLink}>
            <Share2 className="mr-2 h-4 w-4" />Compartilhar
          </Button>
        </div>

        {shareToken && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground break-all">
                {window.location.origin}/simulator/share/{shareToken}
              </p>
            </CardContent>
          </Card>
        )}

        {config?.qualification_questions && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">Perguntas ({(config.qualification_questions as any[]).length})</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {(config.qualification_questions as any[]).map((q: any, i: number) => (
                <p key={i} className="text-xs text-muted-foreground py-1 border-b last:border-0">
                  {i + 1}. {q.question}
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        {showPrompt && (
          <Card>
            <CardContent className="p-3">
              <pre className="text-xs whitespace-pre-wrap max-h-60 overflow-y-auto">{compiledPrompt}</pre>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col bg-muted/30">
        {transferred && (
          <div className="bg-primary/20 text-primary px-4 py-3 text-sm font-medium flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Lead qualificado! Resumo seria enviado para {agent.transfer_number || '+55...'}
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
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
              <div className="bg-card border rounded-xl px-4 py-2 text-sm text-muted-foreground">
                digitando...
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t p-3 bg-background">
          <div className="flex gap-2">
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
        </div>
      </div>

      <Dialog open={editPromptOpen} onOpenChange={setEditPromptOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Editar prompt do agente</DialogTitle>
            <DialogDescription>
              Recurso avançado. Salvar marca o agente como "prompt customizado" — futuras edições nos campos do wizard não regeneram este texto.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editedPrompt}
            onChange={(e) => setEditedPrompt(e.target.value)}
            rows={20}
            className="font-mono text-xs"
          />
          <p className="text-xs text-muted-foreground">{editedPrompt.length} caracteres</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditPromptOpen(false)}>Cancelar</Button>
            <Button onClick={savePrompt} disabled={savingPrompt || !editedPrompt.trim()}>
              {savingPrompt ? 'Salvando...' : 'Salvar prompt'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
