# Calculadora de Investimentos

Calculadora web, responsiva e sem backend para explorar cenários de investimento no CDI, fundos imobiliários e metas financeiras.

## O que ela faz

- Projeta montante, rendimento bruto e líquido no CDI, com aportes mensais.
- Estima o IR por lote, respeitando o prazo do investimento inicial e de cada aporte.
- Mostra a evolução do saldo e do total investido em um gráfico interativo.
- Simula o tempo para atingir o “Magic Number” de um fundo imobiliário.
- Calcula o aporte mensal necessário para alcançar uma meta.
- Estima o tempo necessário para chegar ao primeiro milhão.
- Salva as últimas simulações no histórico local e oferece tema claro/escuro.

## Como executar

É uma aplicação estática. Basta abrir `index.html` no navegador. Para uma experiência mais consistente com a API do CDI, também é possível servir a pasta com qualquer servidor local, por exemplo:

```powershell
python -m http.server 8000
```

Depois, acesse `http://localhost:8000`.

## Tecnologias

- HTML, CSS e JavaScript puro.
- Chart.js via CDN para o gráfico.
- API do Banco Central do Brasil para consultar o CDI, com cache local de 24 horas e possibilidade de preenchimento manual.
- `localStorage` para tema e histórico.

## Observação

As projeções são estimativas matemáticas e não constituem recomendação de investimento. Rentabilidade, tributação e condições reais podem variar.
