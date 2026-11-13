# 💜 CEG K-pop — Sistema de Claims

Ferramenta para anunciar os produtos da CEG. A compradora faz o claim e o item fica **reservado no nome dela na hora**. Depois ela acompanha o que **comprou**, o que **já pagou** e o que **ainda deve**.

- **Sem dados de cartão.** O pagamento é por Pix, fora do sistema. O site só mostra a chave Pix e um botão para mandar o comprovante no WhatsApp.
- **Os dados ficam numa Planilha Google sua.** Você pode abrir, filtrar e editar à vontade.
- **Custo zero.** Usa Google Apps Script (grátis) e um site estático (GitHub Pages, Netlify ou Vercel, todos grátis).

## Como funciona

| Quem | O que faz |
|---|---|
| **Compradora** | Vê o catálogo com estoque em tempo real → faz o claim (nome, @, WhatsApp) → recebe um **código do pedido** + chave Pix → manda o comprovante no WhatsApp |
| **Compradora** | Em **Meus Pedidos**, entra com WhatsApp + código e vê: *Falta pagar*, *Já pago*, *Itens comprados* e o status de cada item |
| **ADM** | Anuncia produtos, marca pagamentos como pagos, muda o status (Comprado → A caminho → Na bag → Enviado…), lança **frete por lote** e cobra quem está devendo pelo WhatsApp |

### Regras que o sistema garante
- **Nunca vende o mesmo item duas vezes.** O estoque é conferido no servidor, com trava, no momento do claim.
- **Nunca apaga pedidos.** Cada claim acrescenta uma linha na planilha.
- **Estoque sempre certo.** O disponível é calculado a partir dos pedidos. Se um pedido for cancelado, o item volta sozinho para o catálogo.
- **Privacidade.** Cada compradora só vê os próprios pedidos (WhatsApp + código). O painel ADM exige senha.
- **Cobranças em fases.** Ao fazer o claim, é criada a cobrança da *1ª fase* (valor do item). Fretes e taxas são lançados depois, por pedido ou para o lote inteiro.

## Estrutura

```
apps-script/Code.gs   → backend (cole na sua planilha)
web/                  → site (React + Tailwind)
web/tests/            → testes automáticos do backend
```

## Passo a passo para colocar no ar

### 1. Planilha + backend (5 minutos)
1. Crie uma Planilha Google nova.
2. Clique em **Extensões → Apps Script**, apague o que estiver lá e cole todo o conteúdo de [`apps-script/Code.gs`](apps-script/Code.gs). Salve.
3. No menu de funções lá em cima, escolha **`setup`** e clique em **Executar**. Autorize o acesso quando o Google pedir. Ele cria as abas `Config`, `Produtos`, `Pedidos` e `Cobranças`.
4. Na aba **Config** da planilha, troque:
   - `adminPassword` → uma senha forte só sua (o painel não abre com a senha padrão);
   - `pixKey`, `pixName`, `adminWhatsapp` (com 55 + DDD) e `storeName`.
5. De volta ao Apps Script, clique em **Implantar → Nova implantação → tipo "App da Web"**:
   - *Executar como:* **Eu**
   - *Quem pode acessar:* **Qualquer pessoa**
6. Copie a **URL do App da Web**, que termina em `/exec`.

> Mudou o `Code.gs` depois? Use **Implantar → Gerenciar implantações → editar → Nova versão** para a URL continuar a mesma.

### 2. Site
**Opção A — GitHub Pages (automático)**
1. No GitHub: **Settings → Secrets and variables → Actions → Variables → New variable**: nome `VITE_API_URL`, valor = a URL `/exec`.
2. **Settings → Pages → Source: GitHub Actions**.
3. Faça merge na branch `main`. O workflow `.github/workflows/deploy-site.yml` roda os testes e publica.
   *(GitHub Pages em repositório privado exige plano pago. Nesse caso, use a opção B.)*

**Opção B — Netlify / Vercel / qualquer hospedagem**
```bash
cd web
npm install
echo "VITE_API_URL=https://script.google.com/macros/s/SEU_ID/exec" > .env
npm run build      # gera a pasta web/dist
```
Arraste a pasta `web/dist` para [app.netlify.com/drop](https://app.netlify.com/drop). Pronto.

### 3. Usar
- Anuncie os produtos em **ADM → Produtos** (ou direto na aba `Produtos` da planilha).
- Divulgue o link do site. Se quiser, mande o link direto de "Meus Pedidos": `seu-site/#meus-pedidos`.
- Quando o comprovante chegar, abra o pedido no ADM (seta ▾) e mude a cobrança para **Pago**.
- Quando o lote chegar: **ADM → Cobrar frete do lote**, informe o valor por unidade e pronto. Todo mundo do lote passa a ver o frete em *Falta pagar*.
- **ADM → Compradoras → "Só quem está devendo" → Cobrar** abre o WhatsApp com a mensagem de cobrança pronta.

## Testar sem configurar nada (modo demonstração)
Sem `VITE_API_URL`, o site roda em **modo demonstração**: o mesmo `Code.gs` é executado no navegador sobre uma planilha simulada, com dados de exemplo. A senha do ADM na demonstração é `army123`.

```bash
cd web
npm install
npm run dev     # abre em http://localhost:5173
npm test        # testes do backend (estoque, privacidade, cobranças, cancelamento…)
```

## Editando direto na planilha
Pode editar à vontade: nome, preço, foto, estoque, status, ou marcar uma cobrança como `Pago`. Só **não mude a ordem das colunas** e **não altere os códigos** (`PED-…`, `COB-…`, `CEG-…`).

| Aba | Valores aceitos |
|---|---|
| Produtos → Ativo | `SIM` / `NÃO` (NÃO esconde do catálogo) |
| Pedidos → Status | Reservado, Comprado, A caminho do Brasil, Chegou (na bag), Enviado, Entregue, Cancelado |
| Cobranças → Status | Pendente, Pago, Cancelada |
| Config → claimsOpen | `SIM` / `NÃO` (pausa todos os claims) |

Dica: para cancelar um pedido, prefira o painel ADM. Ele também cancela as cobranças pendentes.
