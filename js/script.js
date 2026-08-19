const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function parseInputNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (value === null || value === undefined || value === '') return 0;

  const text = String(value).trim().replace(/\s/g, '');
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function buscarCDI() {

  const url = "https://api.bcb.gov.br/dados/serie/bcdata.sgs.1178/dados/ultimos/1?formato=json";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) {
      const txt = await response.text().catch(() => '');
      throw new Error(`HTTP ${response.status} ${response.statusText} ${txt}`);
    }

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) throw new Error('Resposta inesperada da API');

    const ultimo = data[0];
    const valorStr = String(ultimo.valor).replace(',', '.');
    const valorNum = parseFloat(valorStr);

    console.log(`Último CDI registrado: ${valorNum}% em ${ultimo.data}`);
    if (isNaN(valorNum)) throw new Error('Valor do CDI não é número');
    return { valor: valorNum, data: ultimo.data };
  } catch (error) {
    clearTimeout(timeout);
    console.warn('Não foi possível obter o CDI automaticamente:', error);
    throw error;
  }
}

const CDI_CACHE_KEY = 'cdi_cache_v1';
const CDI_CACHE_TTL = 24 * 60 * 60 * 1000;

function saveCdiCache(obj) {
  try {
    const payload = { valor: obj.valor, data: obj.data || null, ts: Date.now() };
    localStorage.setItem(CDI_CACHE_KEY, JSON.stringify(payload));
  } catch (e) {
    console.warn('Não foi possível salvar cache do CDI:', e);
  }
}

function readCdiCache() {
  try {
    const raw = localStorage.getItem(CDI_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.valor !== 'number') return null;
    return parsed;
  } catch (e) {
    console.warn('Erro lendo cache do CDI:', e);
    return null;
  }
}

function formatAge(ts) {
  if (!ts) return '?';
  const diff = Date.now() - ts;
  if (diff < 60 * 1000) return 'agora';
  const mins = Math.floor(diff / (60 * 1000));
  if (mins < 60) return `${mins}m atrás`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h atrás`;
  const days = Math.floor(hrs / 24);
  return `${days}d atrás`;
}
document.addEventListener('DOMContentLoaded', () => {
  const taxaInput = document.getElementById('taxaCDI');
  const percentualEl = document.getElementById('percentualCDI');
  const cdiInfoEl = document.getElementById('cdiInfo');
  const taxaCDIInversaEl = document.getElementById('taxaCDIInversa');
  const pctObjInput = document.getElementById('percentualCDIObjetivo');
  const cdiInfoObjetivoEl = document.getElementById('cdiInfoObjetivo');
  const toastEl = document.getElementById('toast');

  let currentCdi = null;
  let toastTimer;
  const cdiInputs = [taxaInput, taxaCDIInversaEl].filter(Boolean);
  const refreshButtons = [
    document.getElementById('refreshCdiBtn'),
    document.getElementById('refreshCdiInversaBtn')
  ].filter(Boolean);
  const copyButtons = [
    document.getElementById('copyCdiBtn'),
    document.getElementById('copyCdiInversaBtn')
  ].filter(Boolean);
  const clearCacheButtons = [
    document.getElementById('clearCacheBtn'),
    document.getElementById('clearCacheInversaBtn')
  ].filter(Boolean);

  function notify(message, type = 'success') {
    if (!toastEl) return;
    window.clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.className = `toast show${type === 'error' ? ' error' : ''}`;
    toastTimer = window.setTimeout(() => {
      toastEl.className = 'toast';
    }, 3200);
  }

  function setCdiValue(value, editable = false) {
    currentCdi = Number(value);
    cdiInputs.forEach(input => {
      input.value = Number.isFinite(currentCdi) ? currentCdi.toFixed(4) : '';
      input.disabled = !editable;
    });
  }

  function renderCdiInfo(status = '') {
    const cdi = parseInputNumber(taxaInput ? taxaInput.value : currentCdi);
    const pct = parseInputNumber(percentualEl ? percentualEl.value : 0);
    if (!cdiInfoEl) return;

    if (cdi > 0 && pct > 0) {
      const aplicado = cdi * (pct / 100);
      cdiInfoEl.innerHTML = `<span class="ok">${status} CDI base: ${cdi.toFixed(4)}% · aplicando ${pct}% = ${aplicado.toFixed(4)}%</span>`;
    } else if (status) {
      cdiInfoEl.innerHTML = `<span class="warn">${status}</span>`;
    } else {
      cdiInfoEl.textContent = 'Informe o percentual para ver a taxa aplicada.';
    }
  }

  function renderObjetivoInfo(status = '') {
    if (!cdiInfoObjetivoEl) return;
    const cdi = parseInputNumber(taxaCDIInversaEl ? taxaCDIInversaEl.value : currentCdi);
    const pct = parseInputNumber(pctObjInput ? pctObjInput.value : 0);
    if (cdi > 0 && pct > 0) {
      const aplicado = cdi * (pct / 100);
      cdiInfoObjetivoEl.innerHTML = `<span class="ok">${status} CDI base: ${cdi.toFixed(4)}% · aplicando ${pct}% = ${aplicado.toFixed(4)}%</span>`;
    } else if (status) {
      cdiInfoObjetivoEl.innerHTML = `<span class="warn">${status}</span>`;
    } else {
      cdiInfoObjetivoEl.textContent = 'Informe o percentual para ver a taxa aplicada.';
    }
  }

  async function loadCDI({ force = false } = {}) {
    const cached = readCdiCache();
    if (cached) {
      setCdiValue(cached.valor);
      renderCdiInfo(`Cache · atualizado ${formatAge(cached.ts)} ·`);
      renderObjetivoInfo(`Cache · atualizado ${formatAge(cached.ts)} ·`);
      const stale = (Date.now() - cached.ts) > CDI_CACHE_TTL;
      if (!force && !stale) return cached;
    }

    try {
      renderCdiInfo('Atualizando…');
      renderObjetivoInfo('Atualizando…');
      refreshButtons.forEach(button => { button.disabled = true; });
      const res = await buscarCDI();
      setCdiValue(res.valor);
      saveCdiCache(res);
      renderCdiInfo('Atualizado ·');
      renderObjetivoInfo('Atualizado ·');
      return res;
    } catch (err) {
      if (!cached) {
        currentCdi = null;
        cdiInputs.forEach(input => {
          input.value = '';
          input.placeholder = 'Insira manualmente';
          input.disabled = false;
        });
        renderCdiInfo(`Não foi possível obter o CDI (${String(err.message).slice(0, 80)}).`);
        renderObjetivoInfo('Informe a taxa CDI manualmente.');
      } else {
        renderCdiInfo(`Cache · atualização falhou · ${formatAge(cached.ts)} ·`);
        renderObjetivoInfo(`Cache · atualização falhou · ${formatAge(cached.ts)} ·`);
      }
    } finally {
      refreshButtons.forEach(button => { button.disabled = false; });
    }
  }

  function updatePercentualInfo() {
    renderCdiInfo();
  }

  function updateObjetivoPercentualInfo() {
    renderObjetivoInfo();
  }
  if (percentualEl) percentualEl.addEventListener('input', updatePercentualInfo);
  if (taxaInput) taxaInput.addEventListener('input', updatePercentualInfo);
  if (pctObjInput) pctObjInput.addEventListener('input', updateObjetivoPercentualInfo);
  if (taxaCDIInversaEl) taxaCDIInversaEl.addEventListener('input', updateObjetivoPercentualInfo);

  copyButtons.forEach(copyButton => {
    copyButton.addEventListener('click', async () => {
      const input = copyButton.id === 'copyCdiInversaBtn' ? taxaCDIInversaEl : taxaInput;
      try {
        if (!input || !input.value) throw new Error('taxa indisponível');
        await navigator.clipboard.writeText(String(input.value));
        copyButton.textContent = '✅';
        notify('Taxa CDI copiada.');
        setTimeout(() => { copyButton.textContent = '📋'; }, 1000);
      } catch (e) {
        notify('Não foi possível copiar a taxa CDI.', 'error');
      }
    });
  });

  refreshButtons.forEach(button => {
    button.addEventListener('click', () => loadCDI({ force: true }));
  });

  clearCacheButtons.forEach(button => {
    button.addEventListener('click', async () => {
      try {
        localStorage.removeItem(CDI_CACHE_KEY);
        renderCdiInfo('Cache limpo ·');
        renderObjetivoInfo('Cache limpo ·');
        await loadCDI({ force: true });
      } catch (e) {
        notify('Erro ao atualizar o CDI.', 'error');
      }
    });
  });

  updatePercentualInfo();
  updateObjetivoPercentualInfo();
  void loadCDI();
  const cdiSection = document.getElementById('cdi-section');
  const fiiSection = document.getElementById('fii-section');
  const inversaSection = document.getElementById('inversa-section');
  const objetivoSection = document.getElementById('objetivo-section');
  const allSections = [cdiSection, fiiSection, inversaSection, objetivoSection].filter(s => s);

  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabArray = Array.from(tabBtns);

  function activateTab(btn) {
    tabBtns.forEach(b => {
      const isActive = b === btn;
      b.classList.toggle('active', isActive);
      b.setAttribute('aria-selected', isActive ? 'true' : 'false');
      b.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    const targetTab = btn.dataset.tab;
    const targetSection = document.getElementById(`${targetTab}-section`);

    allSections.forEach(section => {
      if (!section) return;
      const isTarget = section === targetSection;

      section.hidden = !isTarget;
      if (isTarget) {
        section.removeAttribute('aria-hidden');
        try { section.focus(); } catch (e) { }
      } else {
        section.setAttribute('aria-hidden', 'true');
      }
    });
  }

  tabBtns.forEach((btn, idx) => {
    btn.setAttribute('tabindex', btn.classList.contains('active') ? '0' : '-1');
    btn.addEventListener('click', () => activateTab(btn));

    btn.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        const next = tabArray[(idx + 1) % tabArray.length];
        next.focus();
        activateTab(next);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = tabArray[(idx - 1 + tabArray.length) % tabArray.length];
        prev.focus();
        activateTab(prev);
      } else if (e.key === 'Home') {
        e.preventDefault();
        const first = tabArray[0];
        first.focus();
        activateTab(first);
      } else if (e.key === 'End') {
        e.preventDefault();
        const last = tabArray[tabArray.length - 1];
        last.focus();
        activateTab(last);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activateTab(btn);
      }
    });
  });

  const initialTab = document.querySelector('.tab-btn.active') || tabBtns[0];
  if (initialTab) activateTab(initialTab);
  const calcularBtn = document.getElementById('calcularBtn');
  const valorInicialEl = document.getElementById('valorInicial');
  const aportesEl = document.getElementById('Aportes');
  const periodoEl = document.getElementById('periodo');

  const montanteEl = document.getElementById('montante');
  const aplicadoEl = document.getElementById('valoraplicado');
  const rendimentoEl = document.getElementById('rendimento');
  const impostoTotalEl = document.getElementById('impostoTotal');
  const rendimentoLiquidoEl = document.getElementById('rendimentoLiquido');
  const montanteLiquidoEl = document.getElementById('montanteLiquido');

  function impostoPorPrazo(meses) {
    // Tabela regressiva comum de IR sobre rendimentos:
    // <=6 meses: 22.5%, <=12 meses: 20%, <=24 meses: 17.5%, >24 meses: 15%
    if (meses <= 6) return 22.5;
    if (meses <= 12) return 20.0;
    if (meses <= 24) return 17.5;
    return 15.0;
  }

  function calcularImpostoPorLotes(valorInicial, aportes, taxaMensal, periodo) {
    let imposto = 0;
    const aplicarImposto = (valorAplicado, mesesInvestidos) => {
      const rendimento = valorAplicado * Math.pow(1 + taxaMensal, mesesInvestidos) - valorAplicado;
      return rendimento > 0 ? rendimento * (impostoPorPrazo(mesesInvestidos) / 100) : 0;
    };

    imposto += aplicarImposto(valorInicial, periodo);
    for (let mes = 1; mes <= periodo; mes++) {
      // O aporte entra no fim do mês; por isso, o último aporte ainda não tem rendimento.
      imposto += aplicarImposto(aportes, periodo - mes);
    }
    return imposto;
  }

  function showResult(el, text) {
    if (!el) return;
    el.textContent = text;
    try { el.classList.add('visible'); } catch (e) { }
  }

  function clearResults(...els) {
    els.forEach(el => {
      if (!el) return;
      el.textContent = '';
      try { el.classList.remove('visible'); } catch (e) { }
    });
  }

  let chartInstance = null;

  function gerarGraficoEvolutivo(valorInicial, aportes, taxaMensal, periodo) {
    if (typeof Chart === 'undefined') {
      notify('O gráfico não está disponível no momento, mas o cálculo foi concluído.', 'error');
      return;
    }

    const labels = [];
    const dataEvolutivo = [];
    const dataAplicado = [];
    
    let saldoAtual = valorInicial;
    let totalAplicado = valorInicial;
    
    for (let mes = 0; mes <= periodo; mes++) {
      labels.push(`Mês ${mes}`);
      dataEvolutivo.push(parseFloat(saldoAtual.toFixed(2)));
      dataAplicado.push(parseFloat(totalAplicado.toFixed(2)));
      
      if (mes < periodo) {
        // Calcula juros sobre o saldo atual
        saldoAtual = saldoAtual * (1 + taxaMensal) + aportes;
        totalAplicado += aportes;
      }
    }

    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) chartContainer.classList.add('visible');

    const ctx = document.getElementById('graficoEvolutivo');
    if (!ctx) return;

    const css = getComputedStyle(document.body);
    const textColor = css.getPropertyValue('--text').trim() || '#ffffff';
    const mutedColor = css.getPropertyValue('--muted').trim() || '#a8b6c9';
    const accentColor = css.getPropertyValue('--accent').trim() || '#8b5cf6';

    // Destruir gráfico anterior se existir
    if (chartInstance) {
      chartInstance.destroy();
    }

    chartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Saldo com Juros Compostos',
            data: dataEvolutivo,
            borderColor: accentColor,
            backgroundColor: 'rgba(139, 92, 246, 0.12)',
            borderWidth: 2,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: accentColor,
            pointBorderColor: textColor,
            pointBorderWidth: 2,
            tension: 0.3,
            yAxisID: 'y'
          },
          {
            label: 'Total Investido',
            data: dataAplicado,
            borderColor: mutedColor,
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 3,
            pointBackgroundColor: mutedColor,
            tension: 0.3,
            yAxisID: 'y'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            display: true,
            labels: {
              color: textColor,
              font: {
                size: 12,
                weight: 'normal'
              },
              usePointStyle: true,
              padding: 15
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: '#ffffff',
            bodyColor: '#ffffff',
            borderColor: accentColor,
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              label: function(context) {
                return context.dataset.label + ': ' + fmt.format(context.parsed.y);
              }
            }
          }
        },
        scales: {
          y: {
            type: 'linear',
            position: 'left',
            ticks: {
              color: mutedColor,
              callback: function(value) {
                return fmt.format(value);
              }
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.16)',
              drawBorder: false
            }
          },
          x: {
            ticks: {
              color: mutedColor
            },
            grid: {
              color: 'rgba(148, 163, 184, 0.1)',
              drawBorder: false
            }
          }
        }
      }
    });
  }

  function calcularCDI() {
    const valorInicial = parseInputNumber(valorInicialEl.value);
    const aportes = parseInputNumber(aportesEl.value);
    const percentualCDI = parseInputNumber(percentualEl.value);
    const periodo = parseInt(periodoEl.value) || 0;

    const cdiAnualPct = parseInputNumber(taxaInput.value);

    if (valorInicial < 0 || aportes < 0 || percentualCDI <= 0 || cdiAnualPct <= 0 || periodo <= 0 || (valorInicial === 0 && aportes === 0)) {
      notify('Informe valores positivos para o investimento, a taxa CDI e o prazo.', 'error');
      clearResults(aplicadoEl, montanteEl, rendimentoEl, impostoTotalEl, rendimentoLiquidoEl, montanteLiquidoEl);
      return;
    }

    const CDI_ANUAL = cdiAnualPct / 100;
    const taxaAnual = (percentualCDI / 100) * CDI_ANUAL;
    const r = taxaAnual / 12;
    const n = periodo;

    const fvInicial = valorInicial * Math.pow(1 + r, n);
    let fvAportes = 0;
    if (r === 0) fvAportes = aportes * n;
    else fvAportes = aportes * ((Math.pow(1 + r, n) - 1) / r);

    const montante = fvInicial + fvAportes;
    const totalAplicado = valorInicial + (aportes * periodo);
    const rendimento = montante - totalAplicado;

    // O IR é estimado por lote: o investimento inicial e cada aporte respeitam seu próprio prazo.
    const impostoPct = impostoPorPrazo(periodo);
    const impostoTotal = calcularImpostoPorLotes(valorInicial, aportes, r, periodo);
    const rendimentoLiquido = rendimento - impostoTotal;
    const montanteLiquido = totalAplicado + rendimentoLiquido;

    showResult(aplicadoEl, `Valor total aplicado: ${fmt.format(totalAplicado)}`);
    showResult(montanteEl, `Montante bruto após ${periodo} meses: ${fmt.format(montante)}`);
    const efetivaAnualPct = (taxaAnual * 100).toFixed(3);
    showResult(rendimentoEl, `Rendimento bruto: ${fmt.format(rendimento)} (${efetivaAnualPct}% a.a.)`);
    showResult(impostoTotalEl, `IR estimado por prazo: ${fmt.format(impostoTotal)} (alíquota inicial de referência: ${impostoPct.toFixed(2)}%)`);
    showResult(rendimentoLiquidoEl, `Rendimento líquido: ${fmt.format(rendimentoLiquido)}`);
    showResult(montanteLiquidoEl, `Montante líquido após impostos: ${fmt.format(montanteLiquido)}`);

    // Gerar gráfico
    if (periodo > 0 && (valorInicial > 0 || aportes > 0)) {
      gerarGraficoEvolutivo(valorInicial, aportes, r, periodo);
    }
  }

  if (calcularBtn) {
    calcularBtn.addEventListener('click', () => {
      calcularBtn.disabled = true;
      calcularBtn.style.transform = 'scale(.98)';
      setTimeout(() => { calcularBtn.style.transform = ''; calcularBtn.disabled = false; }, 250);
      calcularCDI();
    });
  }

  [valorInicialEl, aportesEl, percentualEl, periodoEl].forEach(inp => {
    if (inp) {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); calcularBtn && calcularBtn.click(); }
      });
    }
  });

  const salvarCdiBtn = document.getElementById('salvarCdiBtn');
  if (salvarCdiBtn) {
    salvarCdiBtn.addEventListener('click', () => {
      if (!montanteEl.textContent) {
        notify('Calcule uma simulação antes de salvar.', 'error');
        return;
      }
      const dados = extrairDadosFormulario('calcForm');
      salvarSimulacao('CDI', dados, { montante: montanteEl.textContent });
      notify('Simulação CDI salva no histórico.');
    });
  }

  const calcularFiiBtn = document.getElementById('calcularFiiBtn');
  const cotaValorEl = document.getElementById('cotaValor');
  const rendimentoMensalEl = document.getElementById('rendimentoMensal');
  const cotasIniciaisEl = document.getElementById('cotasIniciais');
  const cotasMensaisEl = document.getElementById('cotasMensais');


  const tempoAtingimentoEl = document.getElementById('tempoAtingimento');
  const totalRecebidoEl = document.getElementById('totalRecebido');
  const cotaFinalEl = document.getElementById('cotaFinal');
  const cotasNecessariasEl = document.getElementById('cotasNecessarias');
  const totalAportesEl = document.getElementById('totalAportes');

  function calcularFII() {
    const cotaValor = parseInputNumber(cotaValorEl.value);
    const rendimentoMensal = parseInputNumber(rendimentoMensalEl.value);
    const cotasIniciais = parseInputNumber(cotasIniciaisEl.value);
    const cotasMensais = parseInputNumber(cotasMensaisEl.value);

    if (cotaValor <= 0 || rendimentoMensal <= 0 || cotasIniciais <= 0 || cotasMensais < 0) {
      notify('Informe valores positivos para a cota, o rendimento e as cotas.', 'error');
      return;
    }

    let cotas = cotasIniciais;
    let meses = 0;
    let totalDividendoRecebido = 0;
    let totalAportado = cotasIniciais * cotaValor;
    const limiteMeses = 10000;

    while (cotas * rendimentoMensal < cotaValor && meses < limiteMeses) {
      meses++;

      const dividendos = cotas * rendimentoMensal;
      totalDividendoRecebido += dividendos;

      const novasCotasPorDividendos = dividendos / cotaValor;
      cotas += novasCotasPorDividendos;

      if (cotasMensais > 0) {
        cotas += cotasMensais;
        totalAportado += cotasMensais * cotaValor;
      }
    }

    const atingiuObjetivo = cotas * rendimentoMensal >= cotaValor;
    const anos = (meses / 12).toFixed(1);

    showResult(tempoAtingimentoEl, atingiuObjetivo
      ? `Magic Number atingido em: ${meses} meses (${anos} anos)`
      : `Não atingido em ${limiteMeses.toLocaleString('pt-BR')} meses. Aumente os aportes ou o número de cotas.`);
    showResult(cotasNecessariasEl, `Cotas projetadas: ${cotas.toFixed(2)}`);
    showResult(cotaFinalEl, `Rendimento mensal final: ${fmt.format(cotas * rendimentoMensal)}`);
    showResult(totalRecebidoEl, `Total recebido em dividendos: ${fmt.format(totalDividendoRecebido)}`);
    showResult(totalAportesEl, `Total aportado: ${fmt.format(totalAportado)}`);
  }

  if (calcularFiiBtn) {
    calcularFiiBtn.addEventListener('click', () => {
      calcularFiiBtn.disabled = true;
      calcularFiiBtn.style.transform = 'scale(.98)';
      setTimeout(() => { calcularFiiBtn.style.transform = ''; calcularFiiBtn.disabled = false; }, 250);
      calcularFII();
    });
  }

  [cotaValorEl, rendimentoMensalEl, cotasIniciaisEl, cotasMensaisEl].forEach(inp => {
    if (inp) {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); calcularFiiBtn && calcularFiiBtn.click(); }
      });
    }
  });

  const salvarFiiBtn = document.getElementById('salvarFiiBtn');
  if (salvarFiiBtn) {
    salvarFiiBtn.addEventListener('click', () => {
      if (!tempoAtingimentoEl.textContent) {
        notify('Calcule uma simulação antes de salvar.', 'error');
        return;
      }
      const dados = extrairDadosFormulario('fiiForm');
      salvarSimulacao('Fundo Imobiliário', dados, { tempoAtingimento: tempoAtingimentoEl.textContent });
      notify('Simulação de FII salva no histórico.');
    });
  }
  const calcularInversaBtn = document.getElementById('calcularInversaBtn');
  const valorInicialMilhaoEl = document.getElementById('valorInicialMilhao');
  const percentualCDIInversaEl = document.getElementById('percentualCDIInversa');
  const aportesInversaEl = document.getElementById('AportesInversa');
  const tempoParaMilhaoEl = document.getElementById('tempoParaMilhao');
  const MILHAO = 1000000;

  function calcularTempoParaMilhao() {
    const valorInicial = parseInputNumber(valorInicialMilhaoEl.value);
    const percentualCDI = parseInputNumber(percentualCDIInversaEl.value);
    const aportes = parseInputNumber(aportesInversaEl.value);
    const montanteDesejado = MILHAO;

    const cdiAnualPct = parseInputNumber(taxaInput.value);

    if (valorInicial < 0 || aportes < 0 || percentualCDI <= 0 || cdiAnualPct <= 0 || (valorInicial === 0 && aportes === 0)) {
      notify('Informe um capital inicial ou aporte mensal, além de uma taxa CDI válida.', 'error');
      clearResults(tempoParaMilhaoEl);
      return;
    }

    if (valorInicial >= montanteDesejado) {
      showResult(tempoParaMilhaoEl, 'Objetivo já alcançado!');
      return;
    }

    const CDI_ANUAL = cdiAnualPct / 100;
    const taxaAnual = (percentualCDI / 100) * CDI_ANUAL;
    const r = taxaAnual / 12;
    if (r <= 0.000001) {
      const valorNecessario = montanteDesejado - valorInicial;

      if (valorNecessario <= 0) {
        showResult(tempoParaMilhaoEl, `Objetivo já alcançado!`);
        return;
      }

      if (aportes <= 0) {
        showResult(tempoParaMilhaoEl, `É necessário um aporte mensal positivo com esta taxa.`);
        return;
      }

      const meses = valorNecessario / aportes;
      const anos = (meses / 12).toFixed(1);
      showResult(tempoParaMilhaoEl, `Tempo estimado: ${Math.ceil(meses)} meses (${anos} anos)`);
      return;
    }
    const A = montanteDesejado * r + aportes;
    const B = valorInicial * r + aportes;

    if (B <= 0 || A / B <= 1 || !Number.isFinite(A / B)) {
      showResult(tempoParaMilhaoEl, 'Aumente o aporte mensal para viabilizar esta projeção.');
      return;
    }

    const n = Math.log(A / B) / Math.log(1 + r);

    const meses = Math.ceil(n);
    const anos = (meses / 12).toFixed(1);

    showResult(tempoParaMilhaoEl, `Tempo estimado: ${meses} meses (${anos} anos)`);
  }

  if (calcularInversaBtn) {
    calcularInversaBtn.addEventListener('click', () => {
      calcularInversaBtn.disabled = true;
      calcularInversaBtn.style.transform = 'scale(.98)';
      setTimeout(() => { calcularInversaBtn.style.transform = ''; calcularInversaBtn.disabled = false; }, 250);
      calcularTempoParaMilhao();
    });
  }

  [valorInicialMilhaoEl, percentualCDIInversaEl, aportesInversaEl].forEach(inp => {
    if (inp) {
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); calcularInversaBtn && calcularInversaBtn.click(); }
      });
    }
  });

  const salvarInversaBtn = document.getElementById('salvarInversaBtn');
  if (salvarInversaBtn) {
    salvarInversaBtn.addEventListener('click', () => {
      if (!tempoParaMilhaoEl.textContent) {
        notify('Calcule uma simulação antes de salvar.', 'error');
        return;
      }
      const dados = extrairDadosFormulario('calcInversaForm');
      salvarSimulacao('Primeiro Milhão', dados, { tempoParaMilhao: tempoParaMilhaoEl.textContent });
      notify('Simulação do primeiro milhão salva no histórico.');
    });
  }
  const valorInicialObjetivoEl = document.getElementById('valorInicialObjetivo');
  const valorFinalDesejadoEl = document.getElementById('valorFinalDesejado');
  const percentualCDIObjetivoEl = document.getElementById('percentualCDIObjetivo');
  const periodoObjetivoEl = document.getElementById('periodoObjetivo');
  const calcularObjetivoBtn = document.getElementById('calcularObjetivoBtn');
  const aporteMensalNecessarioEl = document.getElementById('aporteMensalNecessario');
  const detalheObjetivoEl = document.getElementById('detalheObjetivo');

  function calcularObjetivo() {
    clearResults(aporteMensalNecessarioEl, detalheObjetivoEl);

    const valorInicial = parseInputNumber(valorInicialObjetivoEl.value);
    const valorFinal = parseInputNumber(valorFinalDesejadoEl.value);
    const percentualCDI = parseInputNumber(percentualCDIObjetivoEl.value);
    const periodo = parseInt(periodoObjetivoEl.value) || 0;

    const cdiAnualPct = parseInputNumber(taxaCDIInversaEl ? taxaCDIInversaEl.value : taxaInput.value);

    if (valorInicial < 0 || valorFinal <= 0 || periodo <= 0 || percentualCDI <= 0 || cdiAnualPct <= 0) {
      notify('Informe o investimento inicial, a meta, o % do CDI, a taxa e o prazo corretamente.', 'error');
      return;
    }

    if (valorInicial >= valorFinal) {
      showResult(aporteMensalNecessarioEl, 'Objetivo já alcançado com o investimento inicial.');
      showResult(detalheObjetivoEl, `Valor inicial: ${fmt.format(valorInicial)} · Meta: ${fmt.format(valorFinal)}`);
      return;
    }

    const CDI_ANUAL = cdiAnualPct / 100;
    const taxaAnual = (percentualCDI / 100) * CDI_ANUAL;
    const r = taxaAnual / 12;
    const n = periodo;

    let aporte = 0;
    if (Math.abs(r) < 1e-12) {
      aporte = (valorFinal - valorInicial) / n;
    } else {
      const pow = Math.pow(1 + r, n);
      const numer = valorFinal - valorInicial * pow;
      const denom = (pow - 1) / r;
      aporte = numer / denom;
    }

    if (!isFinite(aporte)) {
      clearResults(aporteMensalNecessarioEl, detalheObjetivoEl);
      notify('O cálculo não convergiu. Verifique os valores informados.', 'error');
      return;
    }

    if (aporte <= 0) {
      showResult(aporteMensalNecessarioEl, 'Objetivo já alcançado com o investimento inicial.');
      showResult(detalheObjetivoEl, `Montante projetado: ${fmt.format(valorInicial * Math.pow(1 + r, n))}`);
      return;
    }

    showResult(aporteMensalNecessarioEl, `Aporte mensal necessário: ${fmt.format(aporte)}`);
    const cdiBasePct = cdiAnualPct || 0;
    const cdiAplicadoPct = (cdiBasePct * (percentualCDI / 100));
    const taxaMensalPct = (r * 100).toFixed(4);
    showResult(detalheObjetivoEl, `CDI atual: ${cdiBasePct.toFixed(4)}% • Aplicando: ${cdiAplicadoPct.toFixed(4)}% • ${taxaMensalPct}% a.m. • Prazo: ${n} meses.`);

    aporteMensalNecessarioEl.classList.add('celebrate');
    setTimeout(() => { aporteMensalNecessarioEl.classList.remove('celebrate'); }, 900);
  }

  if (calcularObjetivoBtn) {
    calcularObjetivoBtn.addEventListener('click', () => {
      calcularObjetivoBtn.disabled = true;
      calcularObjetivoBtn.style.transform = 'scale(.98)';
      setTimeout(() => { calcularObjetivoBtn.style.transform = ''; calcularObjetivoBtn.disabled = false; }, 250);
      calcularObjetivo();
    });
  }

  [valorInicialObjetivoEl, valorFinalDesejadoEl, percentualCDIObjetivoEl, periodoObjetivoEl].forEach(inp => {
    if (!inp) return;
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (calcularObjetivoBtn) calcularObjetivoBtn.click(); }
    });
  });

  const salvarObjetivoBtn = document.getElementById('salvarObjetivoBtn');
  if (salvarObjetivoBtn) {
    salvarObjetivoBtn.addEventListener('click', () => {
      if (!aporteMensalNecessarioEl.textContent) {
        notify('Calcule uma simulação antes de salvar.', 'error');
        return;
      }
      const dados = extrairDadosFormulario('calcObjetivoForm');
      salvarSimulacao('Objetivo', dados, { aporteMensal: aporteMensalNecessarioEl.textContent });
      notify('Simulação de objetivo salva no histórico.');
    });
  }
  const themeToggle = document.getElementById('themeToggle');
  function applyTheme(theme) {
    if (theme === 'light') document.body.classList.add('light');
    else document.body.classList.remove('light');
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.classList.toggle('tab-btn--light', theme === 'light');
      btn.classList.toggle('tab-btn--dark', theme !== 'light');
    });
    localStorage.setItem('theme', theme);
    if (themeToggle) {
      const icon = themeToggle.querySelector('[aria-hidden="true"]');
      if (icon) icon.textContent = theme === 'light' ? '🌙' : '☀️';
      themeToggle.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
    }
  }
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const cur = localStorage.getItem('theme') === 'light' ? 'dark' : 'light';
      applyTheme(cur);
    });
  }
  applyTheme(localStorage.getItem('theme') || 'dark');




  // SISTEMA DE HISTÓRICO (LocalStorage)

  const HISTORICO_KEY = 'simulacoes_historico_v1';
  const MAX_HISTORICO = 5;

  function salvarSimulacao(abaNome, dados, resultado) {
    try {
      let historico = carregarHistorico();

      const novaSimulacao = {
        id: Date.now(),
        aba: abaNome,
        timestamp: new Date().toLocaleString('pt-BR'),
        dados: dados,
        resultado: resultado
      };

      historico.unshift(novaSimulacao);
      historico = historico.slice(0, MAX_HISTORICO);

      localStorage.setItem(HISTORICO_KEY, JSON.stringify(historico));
      atualizarListaHistorico();
    } catch (e) {
      console.warn('Erro ao salvar simulação:', e);
      notify('Não foi possível salvar a simulação.', 'error');
    }
  }

  function carregarHistorico() {
    try {
      const parsed = JSON.parse(localStorage.getItem(HISTORICO_KEY));
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.warn('Erro ao carregar histórico:', e);
      return [];
    }
  }

  function atualizarListaHistorico() {
    const historicoList = document.getElementById('historicoList');
    const historico = carregarHistorico();

    if (historico.length === 0) {
      historicoList.replaceChildren();
      const empty = document.createElement('p');
      empty.className = 'historico-empty';
      empty.textContent = 'Nenhuma simulação salva ainda.';
      historicoList.appendChild(empty);
      return;
    }

    historicoList.replaceChildren();
    historico.forEach(sim => {
      const tempoDecorrido = formatAge(sim.id);
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'historico-item';
      item.dataset.id = String(sim.id);

      const titulo = document.createElement('div');
      titulo.className = 'historico-item-titulo';
      titulo.textContent = `📊 ${sim.aba}`;

      const detalhes = document.createElement('div');
      detalhes.className = 'historico-item-detalhes';
      const parametros = document.createElement('span');
      parametros.textContent = `${Object.keys(sim.dados || {}).length} parâmetros`;
      const timestamp = document.createElement('span');
      timestamp.textContent = sim.timestamp || 'Data indisponível';
      detalhes.append(parametros, timestamp);

      const tempo = document.createElement('div');
      tempo.className = 'historico-item-tempo';
      tempo.textContent = `Salva ${tempoDecorrido}`;

      item.append(titulo, detalhes, tempo);
      item.addEventListener('click', () => window.carregarSimulacao(sim.id));
      historicoList.appendChild(item);
    });
  }

  window.carregarSimulacao = function (id) {
    const historico = carregarHistorico();
    const simulacao = historico.find(s => String(s.id) === String(id));

    if (!simulacao) return;

    const formularioId = getFormularioId(simulacao.aba);
    if (!formularioId) return;

    const formulario = document.getElementById(formularioId);
    if (!formulario) return;

    Object.keys(simulacao.dados || {}).forEach(chave => {
      const input = formulario.querySelector(`[id="${chave}"]`);
      if (input) {
        input.value = simulacao.dados[chave];
      }
    });

    const targetTab = getTabFromAba(simulacao.aba);
    const tab = document.querySelector(`.tab-btn[data-tab="${targetTab}"]`);
    if (tab) activateTab(tab);

    closeHistorico();

    notify(`Simulação de ${simulacao.aba} carregada. Clique em Calcular para atualizar o resultado.`);
  };

  function getFormularioId(abaNome) {
    const mapping = {
      'CDI': 'calcForm',
      'Fundo Imobiliário': 'fiiForm',
      'Objetivo': 'calcObjetivoForm',
      'Primeiro Milhão': 'calcInversaForm',
      'Juros Compostos': 'calcJurosCompostosForm',
      'Simulador de Empréstimo': 'calcSimuladorEmprestimoForm'
    };
    return mapping[abaNome];
  }

  function getTabFromAba(abaNome) {
    const mapping = {
      'CDI': 'cdi',
      'Fundo Imobiliário': 'fii',
      'Objetivo': 'objetivo',
      'Primeiro Milhão': 'inversa',
      'Juros Compostos': 'juros-compostos',
      'Simulador de Empréstimo': 'simulador-emprestimo'
    };
    return mapping[abaNome];
  }

  const historicoToggle = document.getElementById('historicToggle');
  const historicoModal = document.getElementById('historicoModal');
  const closeHistoricoBtn = document.getElementById('closeHistoricoBtn');
  const limparHistoricoBtn = document.getElementById('limparHistoricoBtn');
  let previousFocus = null;

  function closeHistorico() {
    if (!historicoModal) return;
    historicoModal.hidden = true;
    document.body.style.overflow = '';
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
  }

  if (historicoToggle && historicoModal) {
    historicoToggle.addEventListener('click', () => {
      if (!historicoModal.hidden) {
        closeHistorico();
        return;
      }
      previousFocus = document.activeElement;
      historicoModal.hidden = false;
      document.body.style.overflow = 'hidden';
      if (!historicoModal.hidden) {
        atualizarListaHistorico();
        closeHistoricoBtn && closeHistoricoBtn.focus();
      }
    });
  }

  if (closeHistoricoBtn && historicoModal) {
    closeHistoricoBtn.addEventListener('click', () => {
      closeHistorico();
    });
  }

  if (limparHistoricoBtn) {
    limparHistoricoBtn.addEventListener('click', () => {
      if (confirm('Tem certeza que deseja limpar o histórico de simulações?')) {
        localStorage.removeItem(HISTORICO_KEY);
        atualizarListaHistorico();
        notify('Histórico limpo.');
      }
    });
  }

  if (historicoModal) {
    historicoModal.addEventListener('click', (e) => {
      if (e.target === historicoModal) {
        closeHistorico();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && historicoModal && !historicoModal.hidden) closeHistorico();
  });

  function extrairDadosFormulario(formularioId) {
    const formulario = document.getElementById(formularioId);
    if (!formulario) return {};

    const dados = {};
    const inputs = formulario.querySelectorAll('input, select');
    inputs.forEach(input => {
      if (input.id && input.value) {
        dados[input.id] = input.value;
      }
    });
    return dados;
  }

  window.salvarSimulacao = salvarSimulacao;
  window.extrairDadosFormulario = extrairDadosFormulario;
});
