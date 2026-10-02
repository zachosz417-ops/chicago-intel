const state = {
  feed: null,
  deferredInstallPrompt: null,
  view: 'all',
  search: '',
  projectType: 'ALL',
  projectScale: 'ALL',
  sort: 'newest',
  selectedOpportunity: null
};

const app = document.getElementById('app');
const installButton = document.getElementById('install-button');

const SIGNAL_LABELS = {
  NEW_OPPORTUNITY: 'New opportunity',
  STATUS_CHANGE: 'Status changed',
  MILESTONE_CHANGE: 'Milestone changed',
  COST_CHANGE: 'Cost changed',
  DESCRIPTION_CHANGE: 'Description changed',
  PARTICIPANT_CHANGE: 'Participant changed'
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function formatMoney(value) {
  if (value === null || value === undefined || value === '') {
    return 'Not reported';
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return escapeHtml(value);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0
  }).format(number);
}

function formatDate(value) {
  if (!value) {
    return 'Unknown';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  }).format(date);
}

function signalFor(opportunity) {
  return Array.isArray(opportunity.signals) ? opportunity.signals : [];
}

function isNew(opportunity) {
  return signalFor(opportunity).some(
    signal => signal.type === 'NEW_OPPORTUNITY'
  );
}

function isChanged(opportunity) {
  return signalFor(opportunity).some(
    signal => signal.type !== 'NEW_OPPORTUNITY'
  );
}

function companyText(opportunity) {
  return (opportunity.participating_companies || [])
    .map(company => company.company_name)
    .filter(Boolean)
    .join(' ');
}

function matchesSearch(opportunity) {
  if (!state.search) {
    return true;
  }

  const haystack = [
    opportunity.address,
    opportunity.permit_id,
    opportunity.work_description,
    opportunity.project_type,
    opportunity.project_scale,
    opportunity.permit_stage,
    companyText(opportunity)
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return haystack.includes(state.search.toLowerCase());
}

function filteredOpportunities() {
  if (!state.feed) {
    return [];
  }

  let rows = state.feed.opportunities.filter(opportunity => {
    if (state.view === 'new' && !isNew(opportunity)) {
      return false;
    }

    if (state.view === 'changed' && !isChanged(opportunity)) {
      return false;
    }

    if (
      state.projectType !== 'ALL' &&
      opportunity.project_type !== state.projectType
    ) {
      return false;
    }

    if (
      state.projectScale !== 'ALL' &&
      opportunity.project_scale !== state.projectScale
    ) {
      return false;
    }

    return matchesSearch(opportunity);
  });

  rows.sort((a, b) => {
    if (state.sort === 'cost') {
      return Number(b.reported_cost || 0) - Number(a.reported_cost || 0);
    }

    return new Date(b.issue_date || 0) - new Date(a.issue_date || 0);
  });

  return rows;
}

function signalMarkup(opportunity) {
  const signals = signalFor(opportunity);

  if (!signals.length) {
    return '';
  }

  return `
    <div class="signal-row">
      ${signals.map(signal => `
        <span class="signal-badge">
          ${escapeHtml(SIGNAL_LABELS[signal.type] || signal.type)}
        </span>
      `).join('')}
    </div>
  `;
}

function companyMarkup(opportunity) {
  const companies = opportunity.participating_companies || [];

  if (!companies.length) {
    return '<p class="muted">No participating companies reported.</p>';
  }

  return `
    <div class="company-list">
      ${companies.map(company => `
        <div class="company-row">
          <strong>${escapeHtml(company.company_name)}</strong>
          <span>${escapeHtml(company.role || 'Role not reported')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function opportunityCard(opportunity) {
  return `
    <button
      class="opportunity-card"
      type="button"
      data-opportunity-id="${escapeHtml(opportunity.opportunity_id)}"
    >
      ${signalMarkup(opportunity)}

      <div class="card-topline">
        <span>${escapeHtml(opportunity.project_type)}</span>
        <span>${escapeHtml(opportunity.project_scale)}</span>
      </div>

      <h3>${escapeHtml(opportunity.address || 'Address unavailable')}</h3>

      <p class="card-description">
        ${escapeHtml(
          opportunity.work_description || 'No work description reported.'
        )}
      </p>

      <div class="card-meta">
        <div>
          <span class="meta-label">Reported permit cost</span>
          <strong>${formatMoney(opportunity.reported_cost)}</strong>
        </div>

        <div>
          <span class="meta-label">Issue date</span>
          <strong>${formatDate(opportunity.issue_date)}</strong>
        </div>
      </div>

      <div class="card-footer">
        <span>${escapeHtml(opportunity.permit_stage)}</span>
        <span>View project →</span>
      </div>
    </button>
  `;
}

function renderDashboard() {
  const rows = filteredOpportunities();

  const projectTypes = [
    ...new Set(state.feed.opportunities.map(row => row.project_type).filter(Boolean))
  ];

  const projectScales = [
    ...new Set(state.feed.opportunities.map(row => row.project_scale).filter(Boolean))
  ];

  app.innerHTML = `
    <section class="summary-grid">
      <button class="summary-card ${state.view === 'all' ? 'active' : ''}" data-view="all">
        <strong>${state.feed.summary.opportunities}</strong>
        <span>All opportunities</span>
      </button>

      <button class="summary-card ${state.view === 'new' ? 'active' : ''}" data-view="new">
        <strong>${state.feed.summary.new_opportunities}</strong>
        <span>New</span>
      </button>

      <button class="summary-card ${state.view === 'changed' ? 'active' : ''}" data-view="changed">
        <strong>${state.feed.summary.changed_opportunities}</strong>
        <span>Changed</span>
      </button>
    </section>

    <section class="controls-card">
      <label class="search-label">
        Search
        <input
          id="search-input"
          type="search"
          placeholder="Address, company, permit, description..."
          value="${escapeHtml(state.search)}"
          autocomplete="off"
        >
      </label>

      <div class="filter-grid">
        <label>
          Project type
          <select id="project-type">
            <option value="ALL">All types</option>
            ${projectTypes.map(type => `
              <option value="${escapeHtml(type)}" ${state.projectType === type ? 'selected' : ''}>
                ${escapeHtml(type.replaceAll('_', ' '))}
              </option>
            `).join('')}
          </select>
        </label>

        <label>
          Project scale
          <select id="project-scale">
            <option value="ALL">All scales</option>
            ${projectScales.map(scale => `
              <option value="${escapeHtml(scale)}" ${state.projectScale === scale ? 'selected' : ''}>
                ${escapeHtml(scale.replaceAll('_', ' '))}
              </option>
            `).join('')}
          </select>
        </label>

        <label>
          Sort
          <select id="sort-select">
            <option value="newest" ${state.sort === 'newest' ? 'selected' : ''}>
              Newest first
            </option>
            <option value="cost" ${state.sort === 'cost' ? 'selected' : ''}>
              Highest reported cost
            </option>
          </select>
        </label>
      </div>
    </section>

    <section class="results-header">
      <div>
        <p class="eyebrow">OPPORTUNITIES</p>
        <h2>${rows.length} matching projects</h2>
      </div>
      <span class="result-note">Source: Chicago Building Permits</span>
    </section>

    <section class="opportunity-list">
      ${
        rows.length
          ? rows.map(opportunityCard).join('')
          : `
            <div class="empty-card">
              <h3>No matching opportunities</h3>
              <p>Try changing the search or filters.</p>
            </div>
          `
      }
    </section>
  `;

  bindDashboardEvents();
}

function renderDetail(opportunity) {
  state.selectedOpportunity = opportunity;

  const signals = signalFor(opportunity);

  app.innerHTML = `
    <button id="back-button" class="back-button" type="button">
      ← Back to opportunities
    </button>

    <article class="detail-card">
      ${signalMarkup(opportunity)}

      <p class="eyebrow">
        ${escapeHtml(opportunity.project_type)}
        ·
        ${escapeHtml(opportunity.project_scale)}
      </p>

      <h2>${escapeHtml(opportunity.address || 'Address unavailable')}</h2>

      <div class="detail-grid">
        <div>
          <span class="meta-label">Permit ID</span>
          <strong>${escapeHtml(opportunity.permit_id)}</strong>
        </div>

        <div>
          <span class="meta-label">Permit stage</span>
          <strong>${escapeHtml(opportunity.permit_stage)}</strong>
        </div>

        <div>
          <span class="meta-label">Issue date</span>
          <strong>${formatDate(opportunity.issue_date)}</strong>
        </div>

        <div>
          <span class="meta-label">Reported permit cost</span>
          <strong>${formatMoney(opportunity.reported_cost)}</strong>
        </div>
      </div>

      <section class="detail-section">
        <h3>Project description</h3>
        <p>
          ${escapeHtml(
            opportunity.work_description || 'No work description reported.'
          )}
        </p>
      </section>

      <section class="detail-section">
        <h3>Participating companies</h3>
        ${companyMarkup(opportunity)}
      </section>

      ${
        signals.length
          ? `
            <section class="detail-section">
              <h3>Opportunity signals</h3>
              <div class="signal-detail-list">
                ${signals.map(signal => `
                  <div class="signal-detail">
                    <strong>
                      ${escapeHtml(SIGNAL_LABELS[signal.type] || signal.type)}
                    </strong>
                    <span>
                      ${escapeHtml(
                        signal.description ||
                        signal.message ||
                        signal.detail ||
                        ''
                      )}
                    </span>
                  </div>
                `).join('')}
              </div>
            </section>
          `
          : ''
      }

      <section class="provenance-card">
        <h3>Source</h3>
        <p>Chicago Building Permits</p>
        <p>Permit ID: ${escapeHtml(opportunity.provenance?.permit_id || opportunity.permit_id)}</p>
        <p>Observed: ${formatDate(opportunity.provenance?.observed_at)}</p>
      </section>

      <p class="data-disclaimer">
        Reported permit cost is the amount reported in the public permit data.
        It is not presented as contract value, awarded value, company revenue,
        or customer spend.
      </p>
    </article>
  `;

  document.getElementById('back-button').addEventListener('click', () => {
    state.selectedOpportunity = null;
    renderDashboard();
  });
}

function bindDashboardEvents() {
  document.querySelectorAll('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      state.view = button.dataset.view;
      renderDashboard();
    });
  });

  document.querySelectorAll('[data-opportunity-id]').forEach(button => {
    button.addEventListener('click', () => {
      const opportunity = state.feed.opportunities.find(
        row => row.opportunity_id === button.dataset.opportunityId
      );

      if (opportunity) {
        renderDetail(opportunity);
      }
    });
  });

  const searchInput = document.getElementById('search-input');
  const projectType = document.getElementById('project-type');
  const projectScale = document.getElementById('project-scale');
  const sortSelect = document.getElementById('sort-select');

  searchInput.addEventListener('input', event => {
    state.search = event.target.value;
    renderDashboard();
    const input = document.getElementById('search-input');
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });

  projectType.addEventListener('change', event => {
    state.projectType = event.target.value;
    renderDashboard();
  });

  projectScale.addEventListener('change', event => {
    state.projectScale = event.target.value;
    renderDashboard();
  });

  sortSelect.addEventListener('change', event => {
    state.sort = event.target.value;
    renderDashboard();
  });
}

async function loadFeed() {
  const response = await fetch('./data/customer-feed.json', {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error(`Customer feed request failed: HTTP ${response.status}`);
  }

  state.feed = await response.json();
}

async function init() {
  try {
    await loadFeed();
    renderDashboard();
  } catch (error) {
    app.innerHTML = `
      <section class="empty-card">
        <h2>Unable to load opportunities</h2>
        <p>${escapeHtml(error.message)}</p>
      </section>
    `;
  }
}

window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  state.deferredInstallPrompt = event;
  installButton.hidden = false;
});

installButton.addEventListener('click', async () => {
  if (!state.deferredInstallPrompt) {
    return;
  }

  state.deferredInstallPrompt.prompt();
  await state.deferredInstallPrompt.userChoice;
  state.deferredInstallPrompt = null;
  installButton.hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(error => {
      console.error('Service worker registration failed:', error);
    });
  });
}

init();
