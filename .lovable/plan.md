

# Melhorar Stepper do Wizard — Visual + Navegação

## Problema
O stepper atual tem tamanhos inconsistentes entre os steps, visual básico, e só permite clicar em steps anteriores.

## Solução

### `src/pages/AgentWizard.tsx` — Redesenhar o stepper

Substituir o bloco do stepper (linhas 256-268) por um design mais polido:

- **Tamanho uniforme**: cada step ocupa espaço igual (`flex-1`)
- **Navegação livre**: permitir clicar em qualquer step (não só anteriores)
- **Visual melhorado**:
  - Número em círculo fixo (32x32px) com cores distintas por estado
  - Step atual: círculo preenchido com primary, ring/glow sutil
  - Steps completos: círculo com check icon, fundo primary/20
  - Steps futuros: círculo muted com número
  - Linha conectora entre os círculos (barra horizontal)
  - Título sempre visível abaixo do círculo (truncado se necessário)
- **Hover**: todos os steps têm hover effect indicando clicabilidade

```
  [1 ✓]——[2 ✓]——[● 3]——[4]——[5]——[6]
  Tipo    Ident  Msg   Qual  Obj   LLM
```

### Detalhes técnicos
- Cada step: `button` com `onClick={() => setCurrentStep(i)}` (sem restrição de direção)
- Círculo: `w-8 h-8 rounded-full flex items-center justify-center`
- Linha conectora: `div` com `flex-1 h-0.5 bg-primary/20` (ou `bg-primary` se completo)
- Step completo: mostrar `Check` icon do lucide em vez do número
- Responsivo: títulos visíveis em desktop, ocultos em mobile (só círculos)

### Arquivo impactado
| Arquivo | Mudança |
|---|---|
| `src/pages/AgentWizard.tsx` | Redesenhar stepper com tamanho uniforme, navegação livre, visual melhorado |

