

# Formatar Campo de Número de Transferência

## Problema
O campo aceita qualquer formato (ex: `+5562997274903`), mas a Evolution API precisa apenas dos dígitos. Além disso, o usuário não sabe qual formato usar.

## Solução

### `src/components/wizard/WizardStep6.tsx`

1. **Máscara de input** — Ao digitar, auto-formatar para o padrão `55 62 99727-4903` (código país + DDD + número)
2. **Validação visual** — Mostrar indicador verde/vermelho se o número tem entre 12-13 dígitos (após remover não-dígitos)
3. **Placeholder claro** — `55 11 99999-9999`
4. **Hint text** — "Digite: código do país (55) + DDD + número, sem +"
5. **Auto-strip no onChange** — Salvar no store apenas os dígitos puros (sem espaços, traços ou +), já que o backend faz `replace(/\D/g, '')` de qualquer forma

### Lógica do onChange
```
const raw = e.target.value.replace(/\D/g, '').slice(0, 13);
updateWizardData({ transfer_number: raw });
```

### Display formatado
Mostrar o número formatado visualmente (`55 62 99727-4903`) usando uma função de formatação, mas armazenar apenas dígitos.

### Validação
- < 12 dígitos: texto vermelho "Número incompleto"
- 12-13 dígitos: texto verde "✓ Formato válido"

## Arquivo impactado

| Arquivo | Mudança |
|---|---|
| `src/components/wizard/WizardStep6.tsx` | Máscara, validação visual e armazenamento limpo do número |

