
# Corrigir números desincronizados do disparo

## Diagnóstico
A tela está misturando duas fontes diferentes:
- `sent_count` e `error_count` vêm do registro da campanha
- `pendentes` vem da lista de contatos carregada na página

Na conferência do banco, isso realmente está quebrado: os totais salvos na campanha não batem com os status reais dos contatos. Então o problema não é só visual; a agregação no backend está errada.

Importante: os erros 400 mostrados na tabela são erros reais de envio. O bug aqui é a contabilidade dos totais.

## Causa raiz
No `blast-processor`, cada execução lê a campanha no começo e no fim salva:
- `sent_count = campaign.sent_count + sentCount`
- `error_count = campaign.error_count + errorCount`

Como o processor pode rodar em paralelo/encadeado, execuções diferentes usam valores antigos e acabam sobrescrevendo os totais umas das outras. Isso deixa `sent_count` e `error_count` defasados.

Depois, `BlastDetailPage` exibe:
- enviados/erros da campanha
- pendentes dos contatos

Resultado: os cards não fecham entre si.

## Plano
### 1) Corrigir a contagem na função de disparo
**Arquivo:** `supabase/functions/blast-processor/index.ts`

- Remover a atualização incremental baseada em valores antigos.
- Ao fim de cada lote, recalcular os totais reais diretamente de `blast_contacts` por status (`sent`, `error`, `pending`).
- Salvar esses totais exatos em `blast_campaigns`.
- Usar essa recontagem também para decidir o status final da campanha (`running` ou `completed`).

Isso elimina o desvio causado por concorrência.

### 2) Corrigir os cards da tela de detalhe
**Arquivo:** `src/pages/BlastDetailPage.tsx`

- Parar de misturar contadores da campanha com contagem local.
- Calcular `Enviados`, `Erros`, `Pendentes` e o progresso a partir de `contacts` enquanto a página estiver aberta.
- Assim, a barra, os cards e a tabela sempre passam a bater entre si em tempo real.

## Resultado esperado
- `Total = Enviados + Erros + Pendentes`
- A barra de progresso usa o mesmo número de “enviados” mostrado nos cards
- A campanha deixa de ficar com números atrasados por causa de execuções paralelas
- Quando não houver mais pendentes, o status finaliza corretamente

## Arquivos impactados
| Arquivo | Mudança |
|---|---|
| `supabase/functions/blast-processor/index.ts` | Recontagem real dos contatos e atualização correta dos agregados |
| `src/pages/BlastDetailPage.tsx` | Cards e progresso calculados com base nos contatos reais |

## Observação técnica
Não precisa migração de banco. O problema está na lógica de agregação e na forma como a tela combina dados de fontes diferentes.
