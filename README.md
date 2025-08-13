Zé Preços – Versão 1 (Em Construção)
O Zé Preços é uma ferramenta online gratuita para consulta e análise de preços de itens e serviços no ComprasGov. Desenvolvida para apoiar compradores públicos, analistas e gestores, a solução ainda está em fase inicial (Versão 1) e em constante evolução para inclusão de novas funcionalidades.

🚀 Funcionalidades
Consulta automática às médias de preços de materiais (CATMAT) e serviços (CATSER).

Identificação de outliers com destaque visual na tabela.

Classificação dos valores por Curvas de Mercado (A, B, C).

Recomendação automática da curva mais estável (CV ≤ 25% e ≥ 3 contratações).

Resumo inteligente com métricas agregadas.

Exibição do nome da UASG e detalhes da contratação.

Exportação dos resultados para planilha Excel (.xlsx).

Interface responsiva e fácil de usar.

📦 Tecnologias Utilizadas
HTML5, CSS3 e JavaScript para interface.

Google Apps Script para backend e integração com dados do ComprasGov.

SheetJS (xlsx.js) para geração de planilhas.

Fetch API para comunicação assíncrona.

📄 Como Usar
Acesse a aplicação hospedada (link público).

Informe apenas um dos códigos: CATMAT ou CATSER.

Clique em Solicitar Pesquisa.

Analise o resumo, as curvas de mercado e os outliers destacados.

(Opcional) Clique em Exportar XLSX para baixar a planilha.

📝 Critérios para Recomendação de Curva
A ferramenta recomenda uma curva quando:

O coeficiente de variação (CV) é menor ou igual a 25%.

Há pelo menos 3 contratações na curva.

⚠️ Aviso – Versão 1
Esta é a primeira versão do Zé Preços.
Algumas funcionalidades ainda estão em testes e podem sofrer ajustes. Sugestões e feedbacks são bem-vindos para aprimorar o sistema.

📂 Estrutura do Projeto
bash
Copiar
Editar
/index.html      → Página principal
/style.css       → Estilos da interface
/script.js       → Lógica da aplicação e integração com backend
/img/            → Logos e imagens
