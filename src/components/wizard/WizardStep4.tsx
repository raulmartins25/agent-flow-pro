import { useAgentStore } from '@/stores/agentStore';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Plus, Trash2, GripVertical } from 'lucide-react';

export function WizardStep4() {
  const { wizardData, updateWizardData } = useAgentStore();
  const questions = wizardData.qualification_questions;

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
            <Card key={q.id}>
              <CardContent className="flex items-center gap-3 p-3">
                <GripVertical className="h-4 w-4 text-muted-foreground shrink-0 cursor-grab" />
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
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
