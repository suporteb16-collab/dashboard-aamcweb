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
| `public.dash_aaemcweb_principal` | `public.transacoes_vendas` (Kiwify) | vendas da **Escola do Ouvido** feitas por quem entrou pela campanha — o fundo do funil |
| `public.dash_aaemcweb_referencia` | `public.transacoes_vendas` (Kiwify) | preço mediano do principal nos últimos 180 dias, usado no break-even |

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

**3. O fundo do funil não pode depender da utm.** O checkout da Escola do Ouvido **não
carrega o parâmetro da campanha**: das 148 vendas pagas do principal na base, **zero**
têm a tag `aaemcweb` — elas chegam como `campanha = 'Direto'` ou orgânico do Google. Se
o dashboard esperasse a utm, o fundo do funil ficaria zerado para sempre e o ROAS nunca
fecharia, mesmo com o pitch vendendo.

Por isso a `dash_aaemcweb_principal` atribui **por coorte**: quem entrou pela campanha
(comprou ou tentou comprar com a tag) e **depois** comprou o principal. Ela conta só
**venda nova, paga, de 24/08/2026 em diante**. Detalhes que não são decoração:

- **Recorte em 24/08/2026** — primeiro dia de mídia da campanha. Sem o piso entram dois
  anos de histórico da Escola do Ouvido que não têm nada a ver com a ação. O mesmo piso
  está na `dash_aaemcweb_vendas` (lá não muda número nenhum hoje, é guarda).
- **Renovação sai — e a coluna `e_renovacao` não serve para detectá-la.** Ela está
  `false` nas **18.004 linhas** da base: zero `true`, zero nulo. A ingestão nunca a
  preencheu. O que separa de verdade é a **ordem de compra do e-mail**: a primeira
  compra paga do principal em toda a história é venda nova, qualquer outra é renovação.
  A base confirma o padrão de assinatura — mesmo e-mail, R$ 92,44, de ~30 em 30 dias,
  até 10 vezes seguidas. Aplicada à história inteira, a regra separa **179 vendas novas
  (mediana R$ 942,96)** de **33 renovações (mediana R$ 92,44)**.
  O `row_number` roda **sem filtro de data**; se rodasse dentro da janela, uma compra
  antiga cairia fora e a renovação seria promovida a "primeira".

- O corte `data_criacao >= entrou` é obrigatório. Sem ele, um aluno que já tinha
  comprado a Escola do Ouvido em **2024** e voltou pelo webinário aparece como conversão
  nova — é exatamente o caso que existe na base hoje, e é por isso que a view devolve
  0 linhas em vez de 1.
- No dashboard, vendas do principal são **removidas** do lado da entrada antes de somar.
  Hoje não há sobreposição, mas se um dia o link do pitch passar a carregar a utm a
  mesma venda cairia nas duas views e o faturamento dobraria.

O ROAS soma entrada + principal; o ticket médio usa **só** a entrada (misturar um
produto de R$ 6,96 com um de R$ 768,73 produz um número que não descreve nenhum dos
dois). O KPI **Break-even** diz quantas vendas do principal ainda faltam para pagar a
mídia: enquanto não houver venda, o preço vem da mediana histórica
(`dash_aaemcweb_referencia`, hoje R$ 768,73); depois passa a usar o preço praticado.
A referência também conta só venda nova — renovação a R$ 92,44 puxaria a mediana para
baixo e o break-even prometeria um número de vendas que não paga a mídia.

### Sobre `status`

Venda paga aqui é **`status = 'paid'`**, e só. A base tem 19 registros com status
sujo — `paided` (8), `refuseded` (8), `refund_requested` (2) e um nulo — mas **nenhum
deles é do núcleo `maestro`**: são todos de Mundial Cromo e Revista Catolicismo.
Não existe `approved` na base. Vale o alerta para os **outros** dashboards da B16,
onde esses registros existem e podem estar caindo fora da conta.

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

2. 🟡 **`Escola do Ouvido` com zero venda — e o rastreio dela é por coorte, não por
   utm.** A dúvida anterior ("pitch não abriu ou parâmetro não chega?") está resolvida:
   **as duas coisas**. O pitch ainda não abriu *e* o checkout do principal nunca carrega
   o parâmetro da campanha. O fundo do funil já está ligado e preenche sozinho a cada
   pitch semanal, mas a atribuição é por comprador — se alguém assistir à aula e comprar
   com **outro e-mail**, a venda não é contada. Vale pedir ao Peterson que o link do
   pitch leve `utm_campaign=aaemcwebnario`: aí a venda é capturada pelos dois caminhos.

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

---

## Deploy

Esta pasta é o repositório git, ligado a `suporteb16-collab/dashboard-aamcweb`
(branch `main`, GitHub Pages). `git push origin main` e o Pages republica em ~20s.

O repo é **compartilhado com o resto da B16**: `git fetch` antes de começar a mexer.
A credencial do GitHub está no Windows Credential Manager, então o push não pede login.
Até 30/08/2026 a pasta era só uma cópia solta e o deploy era manual — se o histórico
parecer curto, é por isso.

**Agência B16** — Henrique Cardoso, Business Intelligence · 29/08/2026,
atualizado em 30/08/2026.
