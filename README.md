# Preço Justo· V.3.0 (em construção)

Ferramenta online gratuita para consulta e análise de preços de itens e serviços no ComprasGov.  
Focada em apoiar **compradores públicos, analistas e gestores**.  
Esta é a segunda versão e está em evolução contínua.

---

## 🚀 Funcionalidades

- Consulta automática às médias de preços de materiais (CATMAT) e serviços (CATSER)  
- Destaque visual de outliers (valores fora do padrão)  
- Classificação por Curvas de Mercado (A, B, C)  
- Recomendação automática da curva mais estável (**CV ≤ 25% e ≥ 3 contratações**)  
- Resumo inteligente com métricas agregadas (média, mediana, CV, n, outliers)  
- Exibição de **UASG (nome/código), fornecedor e ID da compra**

### Acompanhamento da compra com fluxo robusto
- 📋 **Copiar ID da compra**  
- 🔗 **Abrir**: leva à página base de acompanhamento (sem deep link — adequado ao captcha do ComprasNet)  

### Fornecedores Potenciais por CATMAT/CATSER
- CNPJ, nome, preço médio, CV, UFs, marcas, score  
- Última venda (data) com copiar ID e link **“Abrir”** para a página base  
- Integração com sanções (CEIS) com cache leve  

### Exportação para Excel (.xlsx)
- **Aba Resumo** (métricas, recomendação, P5/P95)  
- **Aba Curvas-Stats** (A/B/C: n, média, mediana, desvio, CV%)  
- **Aba Resultados** e abas por **Curva A/B/C** (+ Curva ND quando aplicável)  
- Tipos nativos (número/data) e larguras de coluna sugeridas  

### Análise de Mercado em página dedicada
- KPIs e gráficos (pizza/barras) por curva  
- Destaque de outliers e top valores  

### Persistência entre abas
- Salva o último resultado em `sessionStorage` e `localStorage` (chave `storeKey`)  
- Recuperação em ordem:  
  1. sessionStorage  
  2. localStorage (`storeKey` / `type+code`)  
  3. legado `zePrecos:lastData`  
  4. reconsulta ao backend  

### Robustez de UX
- `AbortController` para cancelar pesquisas anteriores  
- Botão **Solicitar Pesquisa** desabilitado durante a consulta  
- Mensagens de carregando e tratamento de erros  
- Sanitização de HTML e normalização de links  

---

## 📦 Tecnologias

- **Front-end**: HTML5, CSS3, JavaScript  
- **Gráficos**: Chart.js  
- **Planilhas**: SheetJS (xlsx)  
- **Back-end**: Google Apps Script (GAS) + APIs ComprasGov / Portal da Transparência  
- **Comunicação**: `fetch (POST)` para o endpoint `/exec` do GAS  
  - Fallback: `JSONP` via `doGet?callback=...` para fornecedores  
- **Persistência**: `sessionStorage` e `localStorage`  

---

## 📄 Como usar

1. Acesse a aplicação hospedada (link público).  
2. Informe apenas **um** dos códigos: CATMAT ou CATSER.  
3. Clique em **Solicitar Pesquisa**.  
4. Analise o **Resumo**, as **Curvas** e os **Outliers** destacados.  
5. (Opcional) Clique em **Exportar XLSX** para baixar a planilha.  
6. Use **Ir para Análise de Mercado** para abrir a página com gráficos e KPIs.  
7. Na coluna **ID Compra**, use:  
   - 📋 para **copiar o ID da compra**  
   - 🔗 **Abrir** para ir à página base (cole o ID lá, por conta do captcha)  

---

## 🧭 Fornecedores Potenciais

Gerados a partir do histórico de compras do item (CATMAT/CATSER).  

**Colunas**: Fornecedor, CNPJ, Amostras, Preço médio, CV (%), UFs, Marcas, Última venda, Score.  

- Última venda: mostra a data e oferece 📋 copiar ID + Abrir (página base).  
- Sanções (CEIS): backend consulta e mantém cache de **6h por CNPJ** (resumo + categorias).  

### Score (heurístico)

score = 0.5·wN + 0.3·wCV + 0.2·wUF
- **wN** = min(amostras, 10) / 10  
- **wCV** = 1 − min(CV, 0.5) / 0.5 (quanto menor CV, melhor)  
- **wUF** = min(qtd_UFs, 5) / 5  

👉 É apenas um indicador de ordenação; **não substitui análise jurídica/compliance**.  

---

## 📝 Critérios de recomendação de curva

A ferramenta recomenda uma curva quando:  

- CV (coeficiente de variação) ≤ 25%  
- Número de contratações ≥ 3  

A curva recomendada aparece com **cartão + selo “Recomendada”**.  

---

## 🧾 Exportação (.xlsx)

- Resumo com métricas (média, mediana, P5/P95, outliers) e recomendação  
- Curvas-Stats (A/B/C): n, média, mediana, desvio padrão, CV%  
- Resultados completos (inclui **Link Compra**)  
- Abas por Curva A/B/C e, se houver, **Curva ND**  

---

## 🔌 Endpoints do Back-end (GAS)

**Base**: Web App do GAS (deploy “Acessível a qualquer pessoa com o link”)  

1. **Pesquisa de preços** (rota legada / usada pelo front)  
POST .../exec
catmat_code | catser_code
Retorno: `{ success, precos, summary, stats, curves, curveStats, recommended }`  

2. **Fornecedores por catálogo** 
POST .../exec
action=fornecedoresPorCatalogo
type=catmat|catser
code=<código do item>
filtros={ uf, codigoUasg, codigoMunicipio, maxPaginas } (opcional)
includeSanctions=1
Retorno: `{ ok: true, data: { lista:[...], sancoesByCnpj? }, ver }`  
Fallback JSONP: `doGet?callback=foo`  

3. **Sanções — detalhes (CEIS)**

POST/GET .../exec
action=sancoesDetalhes
cnpj=<CNPJ>

Retorno: `{ ok: true, data: { cnpj, categorias:[...], registros:[...] }, ver }`  

---

## ⚙️ Configuração (GAS)

- **Script Properties**: definir chave para API do Portal da Transparência:
- `PT_API_KEY` (preferencial)  
- `PT.KEY`  
- `chave_api_dados`  

- **Cache**:  
- `CacheService` (ScriptCache) com TTL de 6h para CEIS  
- `CACHE_VER` para invalidar cache  

- **Requisições**:  
- Função `_withRetry` com **backoff progressivo** para rate limit (429)  

---

## 🔐 Segurança & UX

- Sanitização de HTML recebido do backend  
- Normalização de URLs (**somente http/https**)  
- Captcha do ComprasNet:  
- exibe o ID  
- 📋 copiar ID  
- 🔗 abre a página base para colar manualmente  
- Tratamento de IDs nulos/inválidos (**N/A**)  

---

## 🧩 Estrutura do projeto
/index.html # Página principal (Cotação Rápida)
/style.css # Estilos (cartões, selos, tabelas, botões)
/script.js # Busca, curvas, outliers, exportação, análise e persistência
/analise-mercado.html # Página de Análise de Mercado (gráficos/KPIs)
/img/ # Logos e imagens
/README.md # Este arquivo


---

## 🧪 Dicas & Solução de problemas

- **“A chave da compra ‘null’ é inválida”** → registro sem ID → exibe “N/A”  
- **Link de compra quebrado** → use 📋 copiar ID + Abrir → cole o ID (captcha)  
- **CORS em fornecedores** → tenta POST, se falhar → JSONP (`doGet?callback=...`)  
- **Sem resultados** → verifique se informou CATMAT/CATSER (apenas um) e ajuste filtros  

---

## 🗺️ Roadmap (V2)

- Filtros avançados (período, modalidade, órgão)  
- Gráficos adicionais na Análise (boxplot, séries temporais)  
- Indicadores de concentração (HHI) por fornecedor  
- Exportação `.csv` além de `.xlsx`  
- Melhorias de acessibilidade (atalhos, navegação por teclado)  

---

## ⚠️ Aviso — Versão 2

Esta versão ainda está em evolução.  
Partes da integração podem mudar conforme o **ComprasGov** e o **Apps Script**.  

💡 Sugestões e feedbacks são muito bem-vindos!

