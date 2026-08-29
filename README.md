# Dashboard — Ação de Webinário (Maestro Thiago Santos)

Dashboard de performance da ação de webinário do **Maestro Thiago Santos**, campanha
**AAEMCWEB**. Construído pela **Agência B16** a pedido do Peterson.

- **Produto de entrada:** `Aula Especial - A Arte de Escutar Música Clássica`
- **Produto principal:** `Escola do Ouvido`
- **Tag da campanha:** `utm_campaign = aaemcwebnario`

---

## Estado atual

| | |
|---|---|
| Fonte de vendas | ✅ Kiwify (planilha do Maestro, aba `kiwify_todos_produtos`) |
| Fonte de investimento | ⏳ **Meta Ads via Stract — pendente** |
| Hospedagem | ⏳ pendente (GitHub Pages) |

Sem o investimento não existem **CPA, ROAS e CPM** — os cards estão no lugar,
marcados como aguardando. Quando o conector Stract for autorizado, é só preencher
a seção `#midia`; nada mais muda.

---

## Como os números são calculados

Duas regras não óbvias, ambas necessárias para o número não sair errado:

**1. Uma linha por `order_ref`.** O webhook da Kiwify manda vários eventos por ordem
e eles **chegam fora de ordem** — "vale o evento mais recente" produz número errado
(já testado e descartado no report semanal da B16). A regra correta é por significado:
estorno anula, pagamento vale, o resto ignora.

**2. Uma compra ≠ uma ordem.** A Kiwify quebra **order bump em `order_ref` separados**,
mesmo comprador e mesmo minuto. Contar ordens infla a venda. O dashboard agrupa por
`created_at + sck` para reconstruir a sessão de checkout — o que dá o mesmo
agrupamento que usar o e-mail, **sem trafegar dado pessoal**. Validado: 9 sessões
pelos dois caminhos, zero grupo misturando compradores.

Por isso a página mostra **compras** (sessões) e **itens pagos** (ordens) como números
distintos, e o ticket médio é por compra, com bump incluso.

O `sck` da Meta vem estruturado como
`{publico}-{adset}-aaemcwebnario-{criativo}-{posicionamento}`, e é dele que saem
os cortes por público, criativo e posicionamento — sem depender do Meta Ads.

---

## Privacidade

A aba da Kiwify tem **nome, e-mail, CPF, telefone e IP** de ~11 mil clientes. O
dashboard é público, então ele pede **só 7 colunas** (`order_ref`, `order_status`,
`created_at`, `Product_product_name`, `sck`, `utm_campaign`, `Faturamento`) e o
recorte acontece **antes** do dado sair do servidor. Nenhum campo pessoal trafega.
Efeito colateral: 9 KB em vez de 6,5 MB.

---

## Fontes de dados — o que precisa ser feito

O `index.html` tenta o **Worker** primeiro e cai na **planilha pública** se ele não
responder. Hoje ele está caindo no plano B, e a página mostra um banner âmbar
avisando — de propósito, para a dependência não ficar invisível.

### Passo 1 — subir o worker (recomendado)

O `worker.js` deste repo é a evolução do worker do CNP0426: ganhou o lançamento
`maestro` e o parâmetro `cols`. Em https://dash.cloudflare.com → Workers →
`noisy-brook-b3b8`:

1. Colar o `worker.js` deste repo por cima do atual (ele continua atendendo
   CNP0426 e CNP0726 igual — só acrescenta).
2. Settings → Variables and Secrets → adicionar
   `SHEET_ID_MAESTRO = 1J_BryoZCsXPP-O9rJqrg1tqIMMpOIIOqoy1sno6Oz2k`.
3. Deploy.

Depois disso o banner âmbar some sozinho.

### Passo 2 — fechar a planilha do Maestro (opcional, mas é o ponto)

A planilha está **pública na internet**: dá para baixar 6,5 MB com dados pessoais de
~11 mil clientes sem nenhuma autenticação. Com o worker no ar, este dashboard deixa
de depender disso. Antes de fechar, compartilhar a planilha com o e-mail da service
account (o mesmo `GOOGLE_SA_KEY` que o worker já usa) — senão o worker perde o acesso
junto.

### Passo 3 — publicar

```bash
git remote add origin https://github.com/suporteb16-collab/dashboard-maestro-aaemcweb.git
git push -u origin main
```
Settings → Pages → branch `main` / root. O worker já autoriza a origem
`https://suporteb16-collab.github.io`.

---

## Achados que dependem de alguém

1. **Erro de tracking na Meta.** 3 compras chegaram com a macro `{{adset.name}}`
   literal no lugar do nome do conjunto — não foi interpolada. Essas vendas perdem a
   atribuição de conjunto. Precisa corrigir o parâmetro de URL do anúncio; o
   histórico já gravado não volta.

2. **`Escola do Ouvido` com zero venda.** Nenhuma atribuída à campanha, e nenhuma na
   base desde 25/08 com ou sem UTM. Ou o pitch ainda não abriu, ou a venda do
   principal não carrega o parâmetro — **confirmar com o Peterson qual dos dois**,
   porque muda o que o funil deveria mostrar.

3. **O nome do produto não é o que foi passado.** O pedido dizia "A Arte de escutar",
   mas existem quatro produtos parecidos na base. O que vende na campanha é
   `Aula Especial - A Arte de Escutar Música Clássica`; os outros são histórico de
   ações anteriores.

---

## Stack

HTML/CSS/JS puro, Chart.js 4, sem build. Design system B16 (`#F4F4F2` / `#D4A800` /
`#111`, Bebas Neue + DM Sans), tema claro e escuro. Paleta de dados validada nos dois
modos (banda de luminosidade, piso de croma, separação para daltonismo e contraste);
os cortes por magnitude usam rampa de um tom só, e todas as barras levam rótulo direto
— a leitura nunca depende só da cor.

**Agência B16** — Henrique Cardoso, Business Intelligence · 29/08/2026.
