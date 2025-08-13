# Zé Preços · **Versão 1**  _(em construção)_

> Ferramenta online gratuita para consulta e análise de preços de itens e serviços no **ComprasGov**.  
> Focada em apoiar compradores públicos, analistas e gestores. Esta é a **primeira versão** e está em evolução contínua.

---

## 🚀 Funcionalidades

- Consulta automática às médias de preços de **materiais (CATMAT)** e **serviços (CATSER)**  
- Destaque visual de **outliers** (valores fora do padrão)  
- Classificação por **Curvas de Mercado (A, B, C)**  
- **Recomendação automática** da curva mais estável (**CV ≤ 25%** e **≥ 3** contratações)  
- **Resumo inteligente** com métricas agregadas  
- Exibição de **nome da UASG**, **código UASG**, **fornecedor** e **link direto** da compra  
- Exportação para **Excel (.xlsx)** com abas por curva  
- Interface **responsiva** e fácil de usar

---

## 📦 Tecnologias

- **Front-end:** HTML5, CSS3, JavaScript  
- **Back-end:** Google Apps Script (integração com dados do ComprasGov)  
- **Planilhas:** SheetJS (`xlsx`)  
- **Comunicação:** `fetch` (POST) para o endpoint `exec` do Apps Script

---

## 📄 Como usar

1. Acesse a aplicação hospedada (link público).  
2. Informe **apenas um** dos códigos: **CATMAT** _ou_ **CATSER**.  
3. Clique em **Solicitar Pesquisa**.  
4. Analise o **resumo**, as **curvas** e os **outliers** destacados.  
5. (Opcional) Clique em **Exportar XLSX** para baixar a planilha.


---

## 📝 Critérios de recomendação de curva

A ferramenta recomenda uma curva quando:
- **CV (coeficiente de variação) ≤ 25%**; e
- **Número de contratações ≥ 3**.

A curva recomendada aparece com um **cartão** e um **selo** de “Recomendada” na interface.

---

## ⚠️ Aviso — Versão 1

Esta é a **primeira versão** do Zé Preços.  
Algumas funcionalidades ainda estão em testes e podem sofrer ajustes. **Sugestões e feedbacks são muito bem-vindos.**

---

## 📂 Estrutura do projeto

/index.html → Página principal
/style.css → Estilos da interface (inclui cartões, selos e tabela)
/script.js → Lógica de busca, agrupamento por curvas, outliers e exportação
/img/ → Logos e imagens
