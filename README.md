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

## Contas das compradoras
- A compradora cria a conta com **nome, @, WhatsApp e senha** e fica logada no aparelho por 6 meses.
- Logada, o botão do catálogo vira **"Quero esse! 💜"**: um toque reserva o item (produtos com Pix parcelado abrem a escolha à vista/parcelado). Logo depois dá para escrever uma observação ou **desfazer** o claim em até 15 minutos.
- Quem **já comprou** antes (inclusive pedidos importados) precisa informar o **código de um pedido** para criar a conta — assim ninguém cria conta no número de outra pessoa.
- **Esqueceu a senha?** ADM → Compradoras → "Senha temporária" → enviar pelo WhatsApp. No próximo acesso ela é obrigada a criar uma senha nova.
- As senhas ficam na aba `Clientes` **protegidas (hash com sal)** — ninguém consegue lê-las. A sessão é um token assinado; trocar a senha encerra as sessões antigas.
- Em **ADM → Configurações** dá para desligar "Exigir conta para fazer claim".

## Vendas fora do site e repasses
- **ADM → Registrar venda:** para vendas feitas no WhatsApp/grupo ou antes do sistema. Escolha a compradora (ou digite uma nova), o produto (do catálogo ou digitado, com link da foto), quantidade, valor e o pagamento: **à vista** (pago ou pendente, com prazo) ou **Pix parcelado** (datas das parcelas + quantas já foram pagas). Produto digitado vira um item oculto (não aparece no catálogo).
- **Repasse pela cliente:** em "Meus Pedidos" (logada), itens **totalmente pagos** têm "Repassar este item": ela informa nome e WhatsApp de quem fica com o item e o pedido aguarda a **aprovação da ADM** (ADM → Pedidos → "Repasses aguardando").
- **Repasse pela ADM:** em cada pedido, "Repassar para outra pessoa / corrigir compradora" — para claim feito no nome errado (vale mesmo sem pagamento; o que falta pagar vai junto) ou para corrigir nome/WhatsApp. Tudo fica no **Histórico** do pedido.

## Cobranças e forma de pagamento
- **ADM → Cobranças do dia:** separa sozinho o que está **vencido**, **vence hoje** e **vence nos próximos dias** (padrão: 2). Cada cliente tem o botão "Enviar cobrança", que abre o WhatsApp com a mensagem pronta (itens, valores, vencimentos e chave Pix) e marca "cobrada hoje".
- **Resumo diário por e-mail:** cadastre o e-mail em ADM → Configurações e, no editor do Apps Script, rode **uma vez** a função `ativarResumoDiario` (ela pede autorização para enviar e-mail e criar o gatilho, e manda um e-mail de teste). Depois disso, todo dia por volta das 8h chega o resumo com os links de cobrança — só quando há algo a cobrar. Confira em *Configurações do projeto* se o fuso horário é `(GMT-03:00) São Paulo`.
- **Pix ou cartão de crédito:** no claim a cliente escolhe a forma de pagamento (pode trocar logo depois do claim). O site **não pede dados do cartão**: o pedido fica marcado "💳 Cartão", a mensagem de WhatsApp para a loja já diz que ela escolheu cartão, e esses pedidos aparecem em "Cobranças do dia" e no resumo diário para vocês mandarem o link. Dá para desligar o cartão em ADM → Configurações.
- Os lembretes automáticos são enviados por você (um toque por cliente) porque mensagens automáticas no WhatsApp só são permitidas pela API oficial da Meta.

## Endereços e frete (Melhor Envio + SuperFrete)
- A cliente cadastra até 5 endereços (o CEP preenche rua/bairro/cidade pelo ViaCEP) em "Minha conta" ou na hora de pedir o envio.
- Em "Meus Pedidos" → **Pedir envio dos meus itens**: escolhe os itens, o endereço e toca em **Calcular frete**; o site cota no Melhor Envio e no SuperFrete (as duas juntas, do mais barato ao mais caro). A opção escolhida vira a cobrança "Frete nacional" (o preço é recalculado no servidor).
- Pacote automático: **só photocards = envelope**; **com álbum/DVD/vinil/merch = caixa** (photocards vão dentro e só somam peso). Peso/medidas por categoria editáveis em ADM → Configurações → Frete.
- **ADM → Envios:** endereço para copiar, itens, pacote, frete pago ou não; informar o valor quando não houve cotação automática; marcar **Enviado** com o rastreio (os itens viram "Enviado") e avisar a cliente no WhatsApp.
- **Configuração:** ADM → Configurações → Frete: CEP de origem, e-mail técnico e os **tokens** do Melhor Envio e do SuperFrete (guardados em segredo nas Propriedades do script — nunca na planilha nem no site).

## Fotos enviadas do celular
- Em todo campo de foto do painel (pedido já feito → "Editar item", produto, foto por membro, "Registrar venda" e "Separar por membro") há o botão **📷 Enviar foto**: escolha a foto no celular/computador e o link é preenchido sozinho.
- A foto é reduzida no aparelho (até 1200 px) e salva na pasta **"CEG Fotos"** do seu Google Drive, compartilhada como "qualquer pessoa com o link pode ver".
- Na primeira vez, rode `setup` no editor do Apps Script e autorize o acesso ao **Google Drive**.

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
1. Coloque a URL `/exec` em `web/.env.production` (ou crie a variável `VITE_API_URL` em **Settings → Secrets and variables → Actions → Variables**, que tem prioridade).
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
