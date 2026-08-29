# Dashboard — Ação de Webinário (Maestro Thiago Santos)

Dashboard de performance da ação de webinário do **Maestro Thiago Santos**, campanha
**AAEMCWEB**. Construído pela **Agência B16** a pedido do Peterson.

🔗 https://suporteb16-collab.github.io/dashboard-aamcweb/

- **Produto de entrada:** `Aula Especial - A Arte de Escutar Música Clássica`
- **Produto principal:** `Escola do Ouvido`
- **Tag da campanha:** `utm_campaign = aaemcwebnario`

---

## Fontes de dados

Tudo vem do **Supabase** (projeto `Data&Revenue`), por PostgREST, com a chave
publishable. Não há mais leitura de planilha.

| View | Origem | O que traz |
|---|---|---|
| `public.dash_aaemcweb_vendas` | `public.transacoes_vendas` (Kiwify) | vendas da campanha, sem dado pessoal |
| `public.dash_aaemcweb_midia` | `"trafego-pago".meta_ads_aaemcweb` (Meta Ads via Stract) | gasto, impressões, cliques, LPV, checkouts por dia/anúncio |

### Por que views e não as tabelas direto

Três motivos, e os três importam:

1. **PII.** `transacoes_vendas` tem `email`, `nome_completo`, `telefone`, `documento`,
   `ip`, `instagram` e `endereco`. O dashboard é público. A view expõe só as colunas
   de análise; a tabela-base continua fechada (`401` para o anon — testado).
2. **O schema `trafego-pago` não é publicado no PostgREST.** A view em `public` é a
   ponte.
3. **O agrupamento de compra precisa do e-mail.** Ele é calculado dentro da view, onde
   o e-mail existe, e sai como um inteiro (`compra_id`). O e-mail nunca trafega.

As duas views aparecem no linter do Supabase como `security_definer_view` (nível
ERROR). **É intencional**: é justamente isso que deixa o anon ler a view sem ter
acesso à tabela-base. "Corrigir" para `security_invoker` exigiria dar `select` no
`transacoes_vendas` para o anon — ou seja, expor a PII. Não faça isso.

---

## Como os números são calculados

Duas regras não óbvias, ambas necessárias para o número não sair errado:

**1. Uma compra ≠ uma ordem.** A Kiwify quebra **order bump em `order_ref` separados**,
mesmo comprador e mesmo minuto. Contar ordens infla a venda: são 16 itens pagos, mas
**9 compras**. O `compra_id` da view agrupa isso. Validado contra a planilha original:
9 sessões pelos dois caminhos, zero grupo misturando compradores.

**2. Faturamento vem da Kiwify, não do pixel.** O pixel da Meta reporta 12 compras /
R$ 83,52; a Kiwify tem 16 itens / R$ 128,79. O pixel sub-reporta (normal). Quem manda
no ROAS é a Kiwify — venda de verdade. O funil usa pixel nas etapas de mídia e Kiwify
na última, e isso está dito no próprio card.

### Cruzamento mídia × venda

| Dimensão | Meta Ads | Kiwify |
|---|---|---|
| Público | `[FRIO]` / `[QUENTE]` no nome da campanha | `canal` |
| Conjunto | `conjunto` | `midia` |
| Criativo | `anuncio` | `conteudo` |

Os nomes batem exatamente entre as duas fontes — **exceto** nas vendas em que a macro
`{{adset.name}}` não interpolou (ver abaixo).

---

## Achados que dependem de alguém

1. 🔴 **A campanha está no prejuízo.** R$ 804,45 investidos para R$ 128,79 faturados —
   **ROAS 0,16×**. O custo por compra (R$ 89,38) é **6,2× o ticket médio** (R$ 14,31).
   Nenhum criativo passa de ROAS 0,69×. Com o produto de entrada a R$ 6,96, a conta só
   fecha se a Escola do Ouvido converter — e ela não vendeu nada.

2. 🟡 **`Escola do Ouvido` com zero venda.** Nenhuma na campanha e nenhuma na base
   desde 25/08. Ou o pitch ainda não abriu, ou a venda do principal não carrega o
   parâmetro — **confirmar com o Peterson qual dos dois**.

3. 🟡 **Erro de tracking na Meta.** 3 vendas chegaram com a macro `{{adset.name}}`
   literal no lugar do nome do conjunto. Entram nos totais, mas não casam com o gasto
   por conjunto. Corrigir o parâmetro de URL do anúncio; o histórico não volta.

4. **O nome do produto não é o que foi passado.** O pedido dizia "A Arte de escutar",
   mas há quatro produtos parecidos na base. O que vende na campanha é
   `Aula Especial - A Arte de Escutar Música Clássica`.

---

## Stack e design

HTML/CSS/JS puro, Chart.js 4, sem build. Paleta **clássica B16** (a mesma do dashboard
Mundial Cromo): `#f4f4f2` / `#d4a800` / `#111`, Bebas Neue + DM Sans, tema claro e
escuro.

As cores de dado foram validadas nos dois modos (banda de luminosidade, piso de croma,
separação para daltonismo, contraste). Duas decisões que saíram disso:

- **Só 2 slots categóricos** (amarelo = investido, azul = faturado). O conjunto
  clássico de 4 (amarelo/verde/azul/rosa) não passa na separação para daltonismo com
  4 séries na tela — verde↔amarelo e verde↔rosa ficam indistinguíveis. Os cortes por
  magnitude usam rampa de um tom só.
- **Toda barra leva rótulo direto.** O amarelo da marca fica abaixo de 3:1 no tema
  claro; o rótulo é o que garante que a leitura nunca dependa só da cor.

---

## Arquivos

| | |
|---|---|
| `index.html` | o dashboard |
| `worker.js` | **legado** — proxy Cloudflare da versão que lia a planilha. Não é mais usado por este dashboard; fica aqui porque o parâmetro `cols` que ele ganhou serve aos outros dashboards da B16 |

**Agência B16** — Henrique Cardoso, Business Intelligence · 29/08/2026.
