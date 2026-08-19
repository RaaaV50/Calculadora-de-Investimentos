# Gráfico de evolução

Na aba **CDI**, o botão **Calcular** gera um gráfico mês a mês com duas séries:

- **Saldo projetado:** evolução do investimento com juros compostos e aportes.
- **Total investido:** soma do investimento inicial e dos aportes realizados.

O gráfico é responsivo, exibe os valores em reais ao passar o mouse e acompanha automaticamente o tema claro ou escuro da aplicação.

## Premissas

- Os aportes entram no fim de cada mês.
- A taxa mensal usada é uma aproximação da taxa anual do CDI dividida por 12.
- O gráfico mostra valores brutos; o resultado líquido com IR aparece nos cards da simulação.

## Dependência

O gráfico usa o Chart.js carregado por CDN no `index.html`. Se a biblioteca não estiver disponível, os valores continuam sendo calculados e a aplicação informa que o gráfico não pôde ser exibido.
