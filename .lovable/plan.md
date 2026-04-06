

# Adicionar campo obrigatório de API Key para Evolution API no formulário de aquecimento

## Mudança

### `src/pages/ChipWarmupPage.tsx`

1. Mostrar campo "API Key" quando provider for `evolution` (além de já mostrar para `waha`)
2. Tornar o campo obrigatório para `evolution` e `waha` — desabilitar botão "Conectar" se vazio
3. No botão de "Reconectar" de cards inativos, também preencher o token

**Lógica atualizada:**
- `showTokenField` muda de `provider === 'waha'` para `provider === 'evolution' || provider === 'waha'`
- Label dinâmico: "API Key" para Evolution, "Token" para WAHA
- Validação do botão: `disabled={!apiUrl || !token || connectMutation.isPending}` quando token é obrigatório

| Arquivo | Mudança |
|---|---|
| `src/pages/ChipWarmupPage.tsx` | Exibir e tornar obrigatório campo API Key/Token para Evolution e WAHA |

