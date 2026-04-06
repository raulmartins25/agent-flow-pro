import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Pause, Play, Send, MessageSquare, Download, X, Smartphone, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/stores/authStore';
import type { RealtimePostgresChangesPayload } from '@supabase/supabase-js';

type Conversation = {
  id: string;
  agent_id: string;
  device_id: string | null;
  contact_number: string;
  contact_name: string | null;
  status: string;
  agent_paused: boolean;
  last_message_at: string | null;
  agents?: { name: string } | null;
  devices?: { name: string } | null;
};

type Message = {
  id: string;
  conversation_id: string;
  role: string;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  created_at: string;
};

type Device = { id: string; name: string };

const displayPhone = (raw: string) => raw?.replace(/@s\.whatsapp\.net$/i, '') || '';

export default function InboxPage() {
  const { conversationId } = useParams();
  const user = useAuthStore((s) => s.user);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [repliedConvIds, setRepliedConvIds] = useState<Set<string>>(new Set());
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'active' | 'paused' | 'transferred' | 'replied'>('all');
  const [deviceFilter, setDeviceFilter] = useState<string>('all');
  const [devices, setDevices] = useState<Device[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load devices for filter
  useEffect(() => {
    supabase.from('devices').select('id, name').then(({ data }) => {
      setDevices((data as Device[]) ?? []);
    });
  }, []);

  const fetchConvs = async () => {
    const { data } = await supabase
      .from('conversations')
      .select('*, agents!inner(name, user_id), devices(name)')
      .order('last_message_at', { ascending: false });
    setConversations((data as any[]) ?? []);
    setLoading(false);
  };

  // Load conversations
  useEffect(() => {
    if (!user) return;
    fetchConvs();

    const channel = supabase
      .channel('conversations-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' },
        () => { fetchConvs(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Load messages when conversation changes
  useEffect(() => {
    if (!activeConv) { setMessages([]); return; }

    const fetchMsgs = async () => {
      const { data } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', activeConv.id)
        .order('created_at', { ascending: true });
      setMessages((data as Message[]) ?? []);
    };
    fetchMsgs();

    const channel = supabase
      .channel(`messages-${activeConv.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${activeConv.id}`,
      }, (payload: RealtimePostgresChangesPayload<any>) => {
        setMessages(prev => [...prev, payload.new as Message]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConv?.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (conversationId && conversations.length) {
      const c = conversations.find(c => c.id === conversationId);
      if (c) setActiveConv(c);
    }
  }, [conversationId, conversations]);

  const togglePause = async () => {
    if (!activeConv) return;
    const newVal = !activeConv.agent_paused;
    await supabase.from('conversations').update({ agent_paused: newVal }).eq('id', activeConv.id);
    setActiveConv({ ...activeConv, agent_paused: newVal });
    toast.success(newVal ? 'Agente pausado' : 'Agente retomado');
  };

  const sendMessage = async () => {
    if (!input.trim() || !activeConv) return;
    const { error } = await supabase.from('messages').insert({
      conversation_id: activeConv.id,
      role: 'assistant',
      content: input,
    });
    if (error) toast.error(error.message);
    else setInput('');
  };

  const filtered = (() => {
    const matched = conversations.filter(c => {
      const matchSearch = (c.contact_name || c.contact_number || '').toLowerCase().includes(search.toLowerCase());
      const matchFilter = filter === 'all' ||
        (filter === 'active' && c.status === 'active' && !c.agent_paused) ||
        (filter === 'paused' && c.agent_paused) ||
        (filter === 'transferred' && c.status === 'transferred');
      const matchDevice = deviceFilter === 'all' || c.device_id === deviceFilter;
      return matchSearch && matchFilter && matchDevice;
    });
    // Deduplicate: keep only the most recent conversation per contact_number
    const seen = new Map<string, Conversation>();
    for (const c of matched) {
      const key = c.contact_number;
      if (!seen.has(key) || new Date(c.last_message_at || 0) > new Date(seen.get(key)!.last_message_at || 0)) {
        seen.set(key, c);
      }
    }
    return Array.from(seen.values());
  })();

  const statusColor = (c: Conversation) => {
    if (c.agent_paused) return 'bg-warning';
    if (c.status === 'active') return 'bg-primary';
    if (c.status === 'transferred') return 'bg-info';
    return 'bg-muted-foreground';
  };

  const renderMedia = (msg: Message) => {
    if (!msg.media_url) return null;
    switch (msg.media_type) {
      case 'image':
        return (
          <img src={msg.media_url} alt="Imagem"
            className="max-w-[200px] rounded-lg cursor-pointer hover:opacity-80"
            onClick={() => setLightboxUrl(msg.media_url)} />
        );
      case 'audio':
        return <audio controls src={msg.media_url} className="max-w-[250px]" />;
      case 'document':
        return (
          <a href={msg.media_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-primary hover:underline">
            <Download className="h-4 w-4" />Documento
          </a>
        );
      case 'video':
        return <video controls src={msg.media_url} className="max-w-[250px] rounded-lg" />;
      default: return null;
    }
  };

  return (
    <div className="flex h-[calc(100vh-5rem)] -m-6 border-t">
      {/* Conversation List */}
      <div className="w-80 border-r flex flex-col bg-background">
        <div className="p-3 border-b space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar..." className="pl-9 h-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            {(['all', 'active', 'replied', 'paused', 'transferred'] as const).map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`text-xs px-2 py-1 rounded-md transition-colors ${filter === f ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                {f === 'all' ? 'Todas' : f === 'active' ? 'Ativas' : f === 'replied' ? 'Em Conversa' : f === 'paused' ? 'Pausadas' : 'Transferidas'}
              </button>
            ))}
          </div>
          {devices.length > 0 && (
            <Select value={deviceFilter} onValueChange={setDeviceFilter}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Todos os dispositivos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os dispositivos</SelectItem>
                {devices.map(d => (
                  <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center py-8 text-center px-4">
              <MessageSquare className="h-8 w-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">Nenhuma conversa</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={async () => {
                if (!user) return;
                const { data: agent } = await supabase.from('agents').select('id').eq('user_id', user.id).limit(1).single();
                if (!agent) { toast.error('Crie um agente primeiro'); return; }
                const { data: conv } = await supabase.from('conversations').insert({
                  agent_id: agent.id, contact_number: '5511999990000', contact_name: 'Teste Inbox', status: 'active',
                  last_message_at: new Date().toISOString(),
                }).select().single();
                if (!conv) { toast.error('Erro ao criar conversa'); return; }
                await supabase.from('messages').insert({
                  conversation_id: conv.id, role: 'user', content: 'Olá, esta é uma mensagem de teste!',
                });
                toast.success('Conversa de teste criada');
                const { data: refreshed } = await supabase.from('conversations').select('*, agents(name), devices(name)').order('last_message_at', { ascending: false });
                setConversations((refreshed as any[]) ?? []);
              }}>
                <Plus className="mr-1 h-3 w-3" />Criar conversa de teste
              </Button>
            </div>
          ) : filtered.map(c => (
            <button key={c.id} onClick={() => setActiveConv(c)}
              className={`w-full text-left p-3 border-b hover:bg-muted/50 transition-colors ${activeConv?.id === c.id ? 'bg-muted' : ''}`}>
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary font-semibold text-sm">
                    {displayPhone(c.contact_name || c.contact_number || '?')[0].toUpperCase()}
                  </div>
                  <div className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background ${statusColor(c)}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{displayPhone(c.contact_name || c.contact_number)}</p>
                  <p className="text-xs text-muted-foreground truncate">{(c as any).agents?.name || 'Agente'}</p>
                </div>
                {c.last_message_at && (
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.last_message_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {!activeConv ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="h-12 w-12 mx-auto mb-3" />
              <p>Selecione uma conversa</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="h-14 border-b flex items-center justify-between px-4 bg-background">
              <div className="flex items-center gap-3">
                <div>
                  <p className="font-medium text-sm">{displayPhone(activeConv.contact_name || activeConv.contact_number)}</p>
                  <p className="text-xs text-muted-foreground">{displayPhone(activeConv.contact_number)}</p>
                </div>
                {(activeConv as any).devices?.name && (
                  <Badge variant="outline" className="text-xs gap-1">
                    <Smartphone className="h-3 w-3" />
                    {(activeConv as any).devices.name}
                  </Badge>
                )}
              </div>
              <Button
                variant={activeConv.agent_paused ? 'default' : 'outline'}
                size="sm"
                onClick={togglePause}
              >
                {activeConv.agent_paused ? <><Play className="mr-1 h-3 w-3" />Retomar</> : <><Pause className="mr-1 h-3 w-3" />Pausar</>}
              </Button>
            </div>

            {activeConv.agent_paused && (
              <div className="bg-warning/20 text-warning px-4 py-2 text-xs font-medium text-center">
                ⏸ Agente pausado — você está no controle
              </div>
            )}

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/30">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'assistant' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[70%] rounded-xl px-4 py-2 text-sm ${
                    msg.role === 'assistant'
                      ? 'bg-primary/20 text-foreground rounded-br-sm'
                      : 'bg-card text-foreground rounded-bl-sm border'
                  }`}>
                    {renderMedia(msg)}
                    {msg.content && <p className="whitespace-pre-wrap">{msg.content}</p>}
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="border-t p-3 bg-background">
              {!activeConv.agent_paused ? (
                <div className="text-center text-xs text-muted-foreground py-2">
                  Agente está no controle. Pause para intervir.
                </div>
              ) : (
                <div className="flex gap-2">
                  <Input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
                    placeholder="Digite uma mensagem..."
                    className="flex-1"
                  />
                  <Button size="icon" onClick={sendMessage} disabled={!input.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Lightbox */}
      {lightboxUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setLightboxUrl(null)}>
          <button className="absolute top-4 right-4 text-white" onClick={() => setLightboxUrl(null)}>
            <X className="h-6 w-6" />
          </button>
          <img src={lightboxUrl} alt="Preview" className="max-w-[90vw] max-h-[90vh] object-contain" />
        </div>
      )}
    </div>
  );
}
