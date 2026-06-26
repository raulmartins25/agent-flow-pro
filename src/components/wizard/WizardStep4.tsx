import { useState, useRef, useCallback } from 'react';
import { useAgentStore } from '@/stores/agentStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Plus, Trash2, GripVertical, Paperclip, X, FileText, Image, Mic, Play, ChevronDown } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const ACCEPTED_TYPES = '.pdf,.mp4,.mp3,.ogg,.jpg,.png,.jpeg';

function sanitizeFileName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_');
}

function getFileType(file: File): 'image' | 'audio' | 'document' | 'video' {
  if (file.type.startsWith('image/')) return 'image';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'document';
}

function MediaPreview({ media, onRemove }: { media: NonNullable<any>; onRemove: () => void }) {
  const icon = media.file_type === 'image' ? <Image className="h-5 w-5" /> :
    media.file_type === 'audio' ? <Mic className="h-5 w-5" /> :
    media.file_type === 'video' ? <Play className="h-5 w-5" /> :
    <FileText className="h-5 w-5" />;

  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/50 p-2">
      {media.file_type === 'image' ? (
        <img src={media.file_url} alt={media.file_name} className="h-12 w-12 rounded object-cover" />
      ) : (
        <div className="flex h-12 w-12 items-center justify-center rounded bg-muted">{icon}</div>
      )}
      <span className="flex-1 truncate text-sm">{media.file_name}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRemove}>
        <X className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

export function WizardStep4() {
  const { wizardData, updateWizardData } = useAgentStore();
  const questions = wizardData.qualification_questions;
  const [uploading, setUploading] = useState<Record<string, number>>({});
  const [openPanels, setOpenPanels] = useState<Record<string, boolean>>({});
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragCounter = useRef(0);

  const addQuestion = () => {
    updateWizardData({
      qualification_questions: [
        ...questions,
        { id: crypto.randomUUID(), question: '' },
      ],
    });
  };

  const removeQuestion = (id: string) => {
    updateWizardData({
      qualification_questions: questions.filter((q) => q.id !== id),
    });
  };

  const updateQuestion = (id: string, question: string) => {
    updateWizardData({
      qualification_questions: questions.map((q) => q.id === id ? { ...q, question } : q),
    });
  };

  const updateMedia = (id: string, media: any) => {
    updateWizardData({
      qualification_questions: questions.map((q) => q.id === id ? { ...q, media } : q),
    });
  };

  const reorderQuestions = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    const updated = [...questions];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);
    updateWizardData({ qualification_questions: updated });
  }, [questions, updateWizardData]);

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDraggedIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(idx));
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
    dragCounter.current = 0;
  };

  const handleDragEnter = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    dragCounter.current++;
    setDragOverIdx(idx);
  };

  const handleDragLeave = () => {
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      setDragOverIdx(null);
      dragCounter.current = 0;
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, toIdx: number) => {
    e.preventDefault();
    dragCounter.current = 0;
    const fromIdx = Number(e.dataTransfer.getData('text/plain'));
    if (!isNaN(fromIdx)) {
      reorderQuestions(fromIdx, toIdx);
    }
    setDraggedIdx(null);
    setDragOverIdx(null);
  };

  const handleUpload = async (questionId: string, file: File) => {
    const fileType = getFileType(file);
    const safeName = sanitizeFileName(file.name);
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData?.user?.id;
    if (!userId) { toast.error('Sessão expirada'); return; }
    const path = `${userId}/${questionId}/${safeName}`;

    setUploading((prev) => ({ ...prev, [questionId]: 0 }));

    const progressInterval = setInterval(() => {
      setUploading((prev) => {
        const current = prev[questionId] ?? 0;
        if (current >= 90) return prev;
        return { ...prev, [questionId]: current + 10 };
      });
    }, 200);

    const { error } = await supabase.storage.from('agent-media').upload(path, file, { upsert: true });

    clearInterval(progressInterval);

    if (error) {
      setUploading((prev) => { const n = { ...prev }; delete n[questionId]; return n; });
      toast.error('Erro ao enviar arquivo: ' + error.message);
      return;
    }

    const { data: urlData } = supabase.storage.from('agent-media').getPublicUrl(path);

    setUploading((prev) => ({ ...prev, [questionId]: 100 }));
    setTimeout(() => setUploading((prev) => { const n = { ...prev }; delete n[questionId]; return n; }), 500);

    const currentQ = questions.find((q) => q.id === questionId);
    updateMedia(questionId, {
      offer_message: currentQ?.media?.offer_message || '',
      file_url: urlData.publicUrl,
      file_name: file.name,
      file_type: fileType,
      send_condition: currentQ?.media?.send_condition || 'positive_response',
    });
  };

  const handleRemoveMedia = async (questionId: string) => {
    const q = questions.find((q) => q.id === questionId);
    if (q?.media?.file_name) {
      await supabase.storage.from('agent-media').remove([`${questionId}/${q.media.file_name}`]);
    }
    updateMedia(questionId, undefined);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Label>Perguntas de qualificação</Label>
          <p className="text-xs text-muted-foreground">O agente fará estas perguntas em sequência</p>
        </div>
        <Button variant="outline" size="sm" onClick={addQuestion}>
          <Plus className="mr-1 h-4 w-4" />Adicionar
        </Button>
      </div>

      {questions.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center text-muted-foreground">
            Nenhuma pergunta adicionada. Clique em "Adicionar" para começar.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {questions.map((q, i) => (
            <Card
              key={q.id}
              draggable
              onDragStart={(e) => handleDragStart(e, i)}
              onDragEnd={handleDragEnd}
              onDragEnter={(e) => handleDragEnter(e, i)}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, i)}
              className={`transition-all duration-150 ${
                dragOverIdx === i && draggedIdx !== i
                  ? 'border-primary ring-1 ring-primary/30'
                  : ''
              } ${draggedIdx === i ? 'opacity-50' : ''}`}
            >
              <CardContent className="space-y-3 p-3">
                <div className="flex items-center gap-3">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab active:cursor-grabbing" />
                  <span className="text-sm font-medium text-muted-foreground shrink-0">{i + 1}.</span>
                  <Input
                    value={q.question}
                    onChange={(e) => updateQuestion(q.id, e.target.value)}
                    placeholder="Ex: Qual seu orçamento disponível?"
                    className="flex-1"
                  />
                  <Button variant="ghost" size="icon" onClick={() => removeQuestion(q.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <Collapsible
                  open={openPanels[q.id] || !!q.media}
                  onOpenChange={(open) => setOpenPanels((p) => ({ ...p, [q.id]: open }))}
                >
                  <CollapsibleTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs text-muted-foreground">
                      <Paperclip className="h-3 w-3" />
                      {q.media ? 'Mídia anexada' : '+ Anexar mídia'}
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="space-y-3 pt-2 pl-8">
                    <div>
                      <Label className="text-xs">Mensagem de oferta</Label>
                      <p className="text-[11px] text-muted-foreground mb-1">
                        A IA fará esta pergunta ao lead. Se ele responder positivamente, o arquivo será enviado.
                      </p>
                      <Textarea
                        value={q.media?.offer_message || ''}
                        onChange={(e) => updateMedia(q.id, { ...q.media, offer_message: e.target.value, send_condition: q.media?.send_condition || 'positive_response' })}
                        placeholder="Ex: Posso te enviar nosso portfólio para você ver como trabalhamos?"
                        className="min-h-[60px] text-sm"
                      />
                    </div>

                    {q.media?.file_url ? (
                      <MediaPreview media={q.media} onRemove={() => handleRemoveMedia(q.id)} />
                    ) : (
                      <div>
                        <Label className="text-xs">Arquivo</Label>
                        {uploading[q.id] !== undefined ? (
                          <Progress value={uploading[q.id]} className="h-2 mt-1" />
                        ) : (
                          <Input
                            type="file"
                            accept={ACCEPTED_TYPES}
                            className="mt-1 text-sm"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) handleUpload(q.id, file);
                            }}
                          />
                        )}
                      </div>
                    )}

                    <div>
                      <Label className="text-xs">Quando enviar?</Label>
                      <Select
                        value={q.media?.send_condition || 'positive_response'}
                        onValueChange={(v) => updateMedia(q.id, { ...q.media, send_condition: v })}
                      >
                        <SelectTrigger className="h-8 text-xs mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="positive_response">Se responder Sim, Claro, Pode, etc.</SelectItem>
                          <SelectItem value="always">Sempre enviar após esta pergunta</SelectItem>
                          <SelectItem value="explicit_yes">Apenas se responder explicitamente "sim"</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
