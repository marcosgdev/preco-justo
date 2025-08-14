# Zé Preços · Versão 2 (em construção)

Ferramenta online gratuita para consulta e análise de preços de itens e serviços no ComprasGov.  
Focada em apoiar compradores públicos, analistas e gestores. Esta é a segunda versão e está em evolução contínua.

## 🚀 Funcionalidades
- Consulta automática às médias de preços de materiais (**CATMAT**) e serviços (**CATSER**)
- Destaque visual de **outliers** (valores fora do padrão)
- Classificação por **Curvas de Mercado (A, B, C)**
- **Recomendação automática** da curva mais estável (CV ≤ 25% e ≥ 3 contratações)
- **Resumo inteligente** com métricas agregadas (média, mediana, CV, n, outliers)
- Exibição de **nome da UASG, código UASG, fornecedor e link direto** da compra (com validação de URL)
- **Exportação para Excel (.xlsx)** com abas por curva, tipos nativos (número/data) e larguras de coluna sugeridas
- **Análise de Mercado** em página dedicada (gráficos com Chart.js):
  - Distribuição por curva (pizza)
  - Média por curva (barra)
  - KPIs, outliers e top 10 valores
- **Botão “Ir para Análise de Mercado” aparece somente após a pesquisa** ser concluída e a **tabela** ser renderizada
- **Persistência entre abas**: salva o último resultado em `sessionStorage` e `localStorage` (chave `storeKey`). A análise recupera por:
  1) `sessionStorage` → 2) `localStorage (storeKey / type+code)` → 3) legado `zePrecos:lastData` → 4) **reconsulta o backend**
- **Robustez de UX**:
  - `AbortController` para cancelar pesquisas anteriores
  - Botão **Solicitar Pesquisa** desabilitado durante a consulta
  - Mensagem de **carregando**
  - Sanitização do HTML retornado e normalização de links (segurança)

## 📦 Tecnologias
- **Front-end:** HTML5, CSS3, JavaScript
- **Gráficos:** Chart.js
- **Planilhas:** SheetJS (xlsx)
- **Back-end:** Google Apps Script (integração com dados do ComprasGov)
- **Comunicação:** `fetch` (POST) para o endpoint `exec` do Apps Script
- **Estado entre páginas/abas:** `sessionStorage` e `localStorage` (com `storeKey`)

## 📄 Como usar
1. Acesse a aplicação hospedada (link público).
2. Informe **apenas um** dos códigos: **CATMAT** ou **CATSER**.
3. Clique em **Solicitar Pesquisa**.
4. Analise o **resumo**, as **curvas** e os **outliers** destacados.
5. (Opcional) Clique em **Exportar XLSX** para baixar a planilha.
6. Quando os resultados forem exibidos, use o botão **Ir para Análise de Mercado** para abrir a página com gráficos e KPIs.

## 📝 Critérios de recomendação de curva
A ferramenta recomenda uma curva quando:
- **CV (coeficiente de variação) ≤ 25%**; e
- **Número de contratações ≥ 3**.

A curva recomendada aparece com um cartão e um selo de **“Recomendada”** na interface.

## ⚠️ Aviso — Versão 2
Ainda em evolução. Partes da integração podem mudar conforme o ComprasGov e o Apps Script.  
Sugestões e feedbacks são muito bem-vindos!

## 📂 Estrutura do projeto
- `/index.html` → Página principal (Cotação Rápida)
- `/style.css` → Estilos da interface (cartões, selos, tabelas, botões)
- `/script.js` → Lógica de busca (POST), agrupamento por curvas, outliers, exportação, **botão dinâmico de análise** e **persistência**
- `/analise-mercado.html` → Página de **Análise de Mercado** (recupera dados via storage/storeKey ou reconsulta; KPIs, gráficos e tabelas)
- `/img/` → Logos e imagens
