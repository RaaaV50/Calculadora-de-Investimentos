const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function parseInputNumber(value) {
  if (!value) return 0;
  return parseFloat(String(value).replace(',', '.')) || 0;
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
document.addEventListener('DOMContentLoaded', async () => {
  const taxaInput = document.getElementById('taxaCDI');
  const percentualEl = document.getElementById('percentualCDI');
  const cdiInfoEl = document.getElementById('cdiInfo');

  let currentCdi = null;
  const refreshBtn = document.getElementById('refreshCdiBtn');

  async function loadCDI() {
    const cached = readCdiCache();
    if (cached) {
      currentCdi = cached.valor;
      taxaInput.value = currentCdi.toFixed(4);
      taxaInput.disabled = true;
      const pct = parseInputNumber(percentualEl.value);
      const aplicado = (currentCdi * (pct / 100));
      const age = formatAge(cached.ts);
      const stale = (Date.now() - cached.ts) > CDI_CACHE_TTL;
      cdiInfoEl.innerHTML = `<span class="ok">🔒 Cache: ${currentCdi.toFixed(4)}% — atualizado ${age} ${stale ? '(desatualizado)' : ''} | Aplicando ${pct}% = ${aplicado.toFixed(4)}%</span>`;
    }

    try {
      if (!cached) cdiInfoEl.innerHTML = '🔄 Obtendo CDI...';
      if (refreshBtn) refreshBtn.disabled = true;
      const res = await buscarCDI();
      currentCdi = res.valor;
      taxaInput.value = currentCdi.toFixed(4);
      taxaInput.disabled = true;
      saveCdiCache(res);
      const pct = parseInputNumber(percentualEl.value);
      const aplicado = (currentCdi * (pct / 100));
      cdiInfoEl.innerHTML = `<span class="ok">✅ CDI Base: ${currentCdi.toFixed(4)}% | Aplicando ${pct}% = ${aplicado.toFixed(4)}% (atualizado)</span>`;

      const taxaInversaInput = document.getElementById('taxaCDIInversa');
      const cdiInfoObjetivoEl = document.getElementById('cdiInfoObjetivo');
      if (taxaInversaInput) {
        taxaInversaInput.value = currentCdi.toFixed(4);
        taxaInversaInput.disabled = true;
      }
      if (cdiInfoObjetivoEl) {
        const pctObjEl = document.getElementById('percentualCDIObjetivo');
        const pctObj = parseInputNumber(pctObjEl ? pctObjEl.value : '') || 0;
        const aplicadoObj = (currentCdi * (pctObj / 100));
        cdiInfoObjetivoEl.innerHTML = `<span class="ok">✅ CDI Base: ${currentCdi.toFixed(4)}% | Aplicando ${pctObj}% = ${aplicadoObj.toFixed(4)}%</span>`;
      }
    } catch (err) {
      if (!cached) {
        currentCdi = null;
        taxaInput.placeholder = 'Erro ao obter CDI — insira manualmente';
        taxaInput.removeAttribute('disabled');
        cdiInfoEl.innerHTML = `<span class="warn">Falha ao obter CDI: ${String(err.message).slice(0, 120)}</span>`;
      } else {
        cdiInfoEl.innerHTML = cdiInfoEl.innerHTML + ` <span class="warn">(falha ao atualizar)</span>`;
      }
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  await loadCDI();

  if (refreshBtn) refreshBtn.addEventListener('click', async () => {
    await loadCDI();
  });

  function updatePercentualInfo() {
    const pct = parseInputNumber(percentualEl.value);
    const cdi = parseInputNumber(taxaInput.value);
    if (cdi > 0 && pct > 0) {
      const aplicada = (cdi * (pct / 100));
      cdiInfoEl.innerHTML = `<span class="ok">✅ CDI Base: ${cdi.toFixed(4)}% | Aplicando ${pct}% = ${aplicada.toFixed(4)}%</span>`;
    } else if (cdi > 0) {
      cdiInfoEl.innerHTML = `<span class="ok">✅ CDI Base: ${cdi.toFixed(4)}%</span>`;
    }
  }

  function updateObjetivoPercentualInfo() {
    const pctEl = document.getElementById('percentualCDIObjetivo');
    const pct = parseFloat(pctEl ? pctEl.value : '') || 0;
    const taxaEl = document.getElementById('taxaCDIInversa');
    const cdiInfoObjetivoEl = document.getElementById('cdiInfoObjetivo');
    const cdiSource = (taxaEl && taxaEl.value) ? taxaEl.value : taxaInput.value;
    const cdi = parseFloat(String(cdiSource).replace(',', '.')) || 0;
    if (cdi > 0 && pct > 0 && cdiInfoObjetivoEl) {
      const aplicada = (cdi * (pct / 100));
      cdiInfoObjetivoEl.innerHTML = `<span class="ok">✅ CDI Base: ${cdi.toFixed(4)}% | Aplicando ${pct}% = ${aplicada.toFixed(4)}%</span>`;
    } else if (cdi > 0 && cdiInfoObjetivoEl) {
      cdiInfoObjetivoEl.innerHTML = `<span class="ok">✅ CDI Base: ${cdi.toFixed(4)}%</span>`;
    }
  }
  if (percentualEl) percentualEl.addEventListener('input', updatePercentualInfo);
  if (taxaInput) taxaInput.addEventListener('input', updatePercentualInfo);
  const pctObjInput = document.getElementById('percentualCDIObjetivo');
  if (pctObjInput) pctObjInput.addEventListener('input', updateObjetivoPercentualInfo);
  const taxaCDIInversaEl = document.getElementById('taxaCDIInversa');
  if (taxaCDIInversaEl) taxaCDIInversaEl.addEventListener('input', updateObjetivoPercentualInfo);

  const copyCdiBtn = document.getElementById('copyCdiBtn');
  if (copyCdiBtn) {
    copyCdiBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(String(taxaInput.value));
        copyCdiBtn.textContent = '✅';
        setTimeout(() => { copyCdiBtn.textContent = '📋'; }, 1000);
      } catch (e) {
        console.warn('Não foi possível copiar CDI:', e);
      }
    });
  }

  const clearCacheBtn = document.getElementById('clearCacheBtn');
  if (clearCacheBtn) {
    clearCacheBtn.addEventListener('click', async () => {
      try {
        localStorage.removeItem(CDI_CACHE_KEY);
        cdiInfoEl.innerHTML = `<span class="ok">Cache limpo. Atualizando...</span>`;
        await loadCDI();
      } catch (e) {
        console.warn('Erro ao limpar cache:', e);
        cdiInfoEl.innerHTML = `<span class="warn">Erro ao limpar cache</span>`;
      }
    });
  }

  updatePercentualInfo();
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
            borderColor: '#b84e4e',
            backgroundColor: 'rgba(184, 78, 78, 0.1)',
            borderWidth: 2,
            fill: true,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: '#b84e4e',
            pointBorderColor: '#ffffff',
            pointBorderWidth: 2,
            tension: 0.3,
            yAxisID: 'y'
          },
          {
            label: 'Total Investido',
            data: dataAplicado,
            borderColor: 'rgba(255, 255, 255, 0.5)',
            borderWidth: 2,
            borderDash: [5, 5],
            fill: false,
            pointRadius: 3,
            pointBackgroundColor: 'rgba(255, 255, 255, 0.5)',
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
              color: '#ffffff',
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
            borderColor: '#b84e4e',
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
              color: 'rgba(255, 255, 255, 0.7)',
              callback: function(value) {
                return fmt.format(value);
              }
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.1)',
              drawBorder: false
            }
          },
          x: {
            ticks: {
              color: 'rgba(255, 255, 255, 0.7)'
            },
            grid: {
              color: 'rgba(255, 255, 255, 0.05)',
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

    if (isNaN(percentualCDI) || percentualCDI === 0 || isNaN(periodo) || periodo <= 0) {
      alert('Preencha a taxa CDI e o período corretamente.');
      return;
    }

    const cdiAnualPct = parseInputNumber(taxaInput.value);
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

    showResult(aplicadoEl, `Valor total aplicado: ${fmt.format(totalAplicado)}`);
    showResult(montanteEl, `Montante após ${periodo} meses: ${fmt.format(montante)}`);
    const efetivaAnualPct = (taxaAnual * 100).toFixed(3);
    showResult(rendimentoEl, `Rendimento total: ${fmt.format(rendimento)} (${efetivaAnualPct}% a.a.)`);

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
        alert('Por favor, calcule primeiro.');
        return;
      }
      const dados = extrairDadosFormulario('calcForm');
      salvarSimulacao('CDI', dados, { montante: montanteEl.textContent });
      alert('✅ Simulação salva com sucesso!');
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

    if (isNaN(cotaValor) || cotaValor <= 0 || isNaN(rendimentoMensal) || rendimentoMensal <= 0 || cotasIniciais <= 0) {
      alert('Preencha todos os campos corretamente.');
      return;
    }

    const cotasNecessariasTeoricas = Math.ceil(cotaValor / rendimentoMensal);

    let cotas = cotasIniciais;
    let meses = 0;
    let totalDividendoRecebido = 0;
    let totalAportado = cotasIniciais * cotaValor;

    while (cotas * rendimentoMensal < cotaValor && meses < 10000) {
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

    const anos = (meses / 12).toFixed(1);

    showResult(tempoAtingimentoEl, `Magic Number atingido em: ${meses} meses (${anos} anos)`);
    showResult(cotasNecessariasEl, `Cotas necessárias: ${cotas.toFixed(2)}`);
    showResult(cotaFinalEl, `Rendimento mensal final: ${fmt.format((cotas * rendimentoMensal).toFixed(2))}`);
    showResult(totalRecebidoEl, `Total recebido em dividendos: ${fmt.format(totalDividendoRecebido.toFixed(2))}`);
    showResult(totalAportesEl, `Total aportado (R$): ${fmt.format(totalAportado.toFixed(2))}`);
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
        alert('Por favor, calcule primeiro.');
        return;
      }
      const dados = extrairDadosFormulario('fiiForm');
      salvarSimulacao('Fundo Imobiliário', dados, { tempoAtingimento: tempoAtingimentoEl.textContent });
      alert('✅ Simulação salva com sucesso!');
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

    if (percentualCDI <= 0) {
      alert('Preencha o % CDI corretamente.');
      return;
    }

    const cdiAnualPct = parseInputNumber(taxaInput.value);
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

    if (A / B <= 1) {
      showResult(tempoParaMilhaoEl, `Objetivo já alcançado ou Investimento Inicial é muito alto.`);
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
        alert('Por favor, calcule primeiro.');
        return;
      }
      const dados = extrairDadosFormulario('calcInversaForm');
      salvarSimulacao('Primeiro Milhão', dados, { tempoParaMilhao: tempoParaMilhaoEl.textContent });
      alert('✅ Simulação salva com sucesso!');
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

    if (valorFinal <= 0 || periodo <= 0 || percentualCDI <= 0) {
      alert('Preencha o valor final, % do CDI e o prazo corretamente.');
      return;
    }

    const cdiAnualPct = parseInputNumber(taxaCDIInversaEl ? taxaCDIInversaEl.value : taxaInput.value);
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
      detalheObjetivoEl.textContent = 'Cálculo não convergiu. Verifique os valores.';
      aporteMensalNecessarioEl.textContent = '';
      return;
    }

    if (aporte <= 0) {
      aporteMensalNecessarioEl.textContent = `Objetivo já alcançado com o investimento inicial.`;
      detalheObjetivoEl.textContent = `Montante atual projetado: ${fmt.format(valorInicial * Math.pow(1 + r, n))}`;
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
        alert('Por favor, calcule primeiro.');
        return;
      }
      const dados = extrairDadosFormulario('calcObjetivoForm');
      salvarSimulacao('Objetivo', dados, { aporteMensal: aporteMensalNecessarioEl.textContent });
      alert('✅ Simulação salva com sucesso!');
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
      themeToggle.textContent = theme === 'light' ? '🌙' : '☀️';
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
      let historico = JSON.parse(localStorage.getItem(HISTORICO_KEY)) || [];

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
    }
  }

  function carregarHistorico() {
    try {
      return JSON.parse(localStorage.getItem(HISTORICO_KEY)) || [];
    } catch (e) {
      console.warn('Erro ao carregar histórico:', e);
      return [];
    }
  }

  function atualizarListaHistorico() {
    const historicoList = document.getElementById('historicoList');
    const historico = carregarHistorico();

    if (historico.length === 0) {
      historicoList.innerHTML = '<p style="color: #aaa; text-align: center;">Nenhuma simulação salva</p>';
      return;
    }

    historicoList.innerHTML = historico.map(sim => {
      const tempoDecorrido = formatAge(sim.id);
      const resultado = sim.resultado || {};

      return `
        <div class="historico-item" onclick="carregarSimulacao(${sim.id})">
          <div class="historico-item-titulo">📊 ${sim.aba}</div>
          <div class="historico-item-detalhes">
            <span>${Object.keys(sim.dados).length} parâmetros</span>
            <span>${sim.timestamp}</span>
          </div>
          <div class="historico-item-tempo">Salva ${tempoDecorrido}</div>
        </div>
      `;
    }).join('');
  }

  window.carregarSimulacao = function (id) {
    const historico = carregarHistorico();
    const simulacao = historico.find(s => s.id === id);

    if (!simulacao) return;

    const formularioId = getFormularioId(simulacao.aba);
    if (!formularioId) return;

    const formulario = document.getElementById(formularioId);
    if (!formulario) return;

    Object.keys(simulacao.dados).forEach(chave => {
      const input = formulario.querySelector(`[id="${chave}"]`);
      if (input) {
        input.value = simulacao.dados[chave];
      }
    });

    const modal = document.getElementById('historicoModal');
    if (modal) modal.hidden = true;

    alert(`Simulação "${simulacao.aba}" carregada! Clique em Calcular para ver os resultados.`);
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

  if (historicoToggle && historicoModal) {
    historicoToggle.addEventListener('click', () => {
      historicoModal.hidden = !historicoModal.hidden;
      if (!historicoModal.hidden) {
        atualizarListaHistorico();
      }
    });
  }

  if (closeHistoricoBtn && historicoModal) {
    closeHistoricoBtn.addEventListener('click', () => {
      historicoModal.hidden = true;
    });
  }

  if (limparHistoricoBtn) {
    limparHistoricoBtn.addEventListener('click', () => {
      if (confirm('Tem certeza que deseja limpar o histórico de simulações?')) {
        localStorage.removeItem(HISTORICO_KEY);
        atualizarListaHistorico();
      }
    });
  }

  if (historicoModal) {
    historicoModal.addEventListener('click', (e) => {
      if (e.target === historicoModal) {
        historicoModal.hidden = true;
      }
    });
  }

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