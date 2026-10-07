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

const SUPABASE_URL = 'https://rzqcndvctsudutmxrzkf.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2Npt6rw2HxoJkmFesxMCQA_5sTMZxB_';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);
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
  const {
    data: { user },
    error: userError
  } = await supabaseClient.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('Authenticated user is required to load the customer feed.');

  const { data: account, error: accountError } = await supabaseClient
    .from('customer_accounts')
    .select('id, customer_id, company_name')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (accountError) throw accountError;
  if (!account) throw new Error('Customer account not found.');

  const { data: opportunities, error: opportunityError } = await supabaseClient
    .from('customer_opportunities')
    .select(
      'id, opportunity_id, permit_id, address, project_type, project_scale, permit_stage, issue_date, reported_cost, work_description, discovery_class, source, observed_at, latitude, longitude, ward, community_area'
    )
    .eq('customer_account_id', account.id)
    .order('issue_date', { ascending: false });

  if (opportunityError) throw opportunityError;

  const opportunityRows = opportunities ?? [];
  const opportunityIds = opportunityRows.map(row => row.id);

  let companyRows = [];
  let signalRows = [];

  if (opportunityIds.length > 0) {
    const [
      { data: companies, error: companyError },
      { data: signals, error: signalError }
    ] = await Promise.all([
      supabaseClient
        .from('customer_opportunity_companies')
        .select(
          'customer_opportunity_id, company_name, role, permit_id, city, state, zipcode'
        )
        .in('customer_opportunity_id', opportunityIds),
      supabaseClient
        .from('customer_opportunity_signals')
        .select(
          'customer_opportunity_id, type, observed_at, details'
        )
        .in('customer_opportunity_id', opportunityIds)
    ]);

    if (companyError) throw companyError;
    if (signalError) throw signalError;

    companyRows = companies ?? [];
    signalRows = signals ?? [];
  }

  const companiesByOpportunity = new Map();

  for (const company of companyRows) {
    const list = companiesByOpportunity.get(company.customer_opportunity_id) ?? [];
    list.push({
      company_name: company.company_name,
      role: company.role,
      permit_id: company.permit_id,
      city: company.city,
      state: company.state,
      zipcode: company.zipcode
    });
    companiesByOpportunity.set(company.customer_opportunity_id, list);
  }

  const signalsByOpportunity = new Map();

  for (const signal of signalRows) {
    const list = signalsByOpportunity.get(signal.customer_opportunity_id) ?? [];
    list.push({
      type: signal.type,
      observed_at: signal.observed_at,
      details: signal.details
    });
    signalsByOpportunity.set(signal.customer_opportunity_id, list);
  }

  state.feed = {
    schema_version: '1.0.0',
    generated_at: new Date().toISOString(),
    source: 'CHICAGO_INTEL_CUSTOMER_FEED',
    summary: {
      opportunities: opportunityRows.length,
      new_opportunities: opportunityRows.filter(row =>
        (signalsByOpportunity.get(row.id) ?? []).some(
          signal => signal.type === 'NEW_OPPORTUNITY'
        )
      ).length,
      changed_opportunities: opportunityRows.filter(row =>
        (signalsByOpportunity.get(row.id) ?? []).some(
          signal => signal.type !== 'NEW_OPPORTUNITY'
        )
      ).length
    },
    opportunities: opportunityRows.map(row => ({
      opportunity_id: row.opportunity_id,
      permit_id: row.permit_id,
      address: row.address,
      project_type: row.project_type,
      project_scale: row.project_scale,
      permit_stage: row.permit_stage,
      issue_date: row.issue_date,
      reported_cost: row.reported_cost,
      work_description: row.work_description,
      discovery_class: row.discovery_class,
      location: {
        latitude: row.latitude,
        longitude: row.longitude,
        ward: row.ward,
        community_area: row.community_area
      },
      participating_companies:
        companiesByOpportunity.get(row.id) ?? [],
      signals:
        signalsByOpportunity.get(row.id) ?? [],
      provenance: {
        source: row.source,
        permit_id: row.permit_id,
        observed_at: row.observed_at
      }
    }))
  };
}


function renderAuth(message = '') {
  app.innerHTML = `
    <section class="auth-card">
      <p class="eyebrow">CHICAGO INTEL</p>
      <h2>Sign in to your intelligence dashboard</h2>
      <p class="auth-intro">
        Access your customer-specific construction opportunity feed.
      </p>

      <form id="auth-form" class="auth-form">
        <label>
          Email
          <input id="auth-email" type="email" autocomplete="email" required>
        </label>

        <label>
          Password
          <input id="auth-password" type="password" autocomplete="current-password" minlength="8" required>
        </label>

        <div class="auth-actions">
          <button type="submit">Sign in</button>
          <button type="button" id="signup-button" class="secondary-button">
            Create account
          </button>
        </div>

        <p id="auth-message" class="auth-message">${escapeHtml(message)}</p>
      </form>
    </section>
  `;

  const form = document.getElementById('auth-form');
  const messageEl = document.getElementById('auth-message');

  async function authenticate(action) {
    const email = document.getElementById('auth-email').value.trim();
    const password = document.getElementById('auth-password').value;

    if (!email || !password) {
      messageEl.textContent = 'Enter your email and password.';
      return;
    }

    messageEl.textContent =
      action === 'signup' ? 'Creating your account…' : 'Signing in…';

    const result = action === 'signup'
      ? await supabaseClient.auth.signUp({ email, password })
      : await supabaseClient.auth.signInWithPassword({ email, password });

    if (result.error) {
      messageEl.textContent = result.error.message;
      return;
    }

    if (action === 'signup' && !result.data.session) {
      messageEl.textContent =
        'Account created. Check your email to confirm your address, then sign in.';
      return;
    }

    await handleAuthenticatedUser(result.data.user);
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    authenticate('signin').catch(error => {
      messageEl.textContent = error.message;
    });
  });

  document.getElementById('signup-button').addEventListener('click', () => {
    authenticate('signup').catch(error => {
      messageEl.textContent = error.message;
    });
  });
}

function renderCustomerOnboarding(user, message = '') {
  app.innerHTML = `
    <section class="auth-card onboarding-card">
      <p class="eyebrow">ACCOUNT SETUP</p>
      <h2>Welcome to Chicago Intel</h2>
      <p class="auth-intro">
        Set up your company profile so we can personalize your construction intelligence feed.
      </p>

      <form id="onboarding-form" class="auth-form">
        <label>
          Company name
          <input
            id="company-name"
            type="text"
            autocomplete="organization"
            required
            maxlength="160"
            placeholder="Your company name"
          >
        </label>

        <fieldset>
          <legend>Target roles</legend>

          <label class="checkbox-row">
            <input type="checkbox" name="target-role" value="CONTRACTOR-GENERAL CONTRACTOR">
            General contractor
          </label>

          <label class="checkbox-row">
            <input type="checkbox" name="target-role" value="CONTRACTOR-ELECTRICAL">
            Electrical
          </label>

          <label class="checkbox-row">
            <input type="checkbox" name="target-role" value="CONTRACTOR-PLUMBER/PLUMBING">
            Plumbing
          </label>

          <label class="checkbox-row">
            <input type="checkbox" name="target-role" value="CONTRACTOR-VENTILATION">
            Ventilation
          </label>

          <label class="checkbox-row">
            <input type="checkbox" name="target-role" value="CONTRACTOR-REFRIGERATION">
            Refrigeration
          </label>

          <label class="checkbox-row">
            <input type="checkbox" name="target-role" value="MASONRY CONTRACTOR">
            Masonry
          </label>

          <label class="checkbox-row">
            <input type="checkbox" name="target-role" value="EXPEDITOR">
            Expeditor
          </label>
        </fieldset>

        <fieldset>
          <legend>Project types</legend>

          <label class="checkbox-row">
            <input type="checkbox" name="project-type" value="NEW_CONSTRUCTION" checked>
            New construction
          </label>

          <label class="checkbox-row">
            <input type="checkbox" name="project-type" value="RENOVATION" checked>
            Renovation
          </label>
        </fieldset>

        <fieldset>
          <legend>Project scales</legend>

          <label class="checkbox-row">
            <input type="checkbox" name="project-scale" value="COMMERCIAL_SCALE" checked>
            Commercial
          </label>

          <label class="checkbox-row">
            <input type="checkbox" name="project-scale" value="LARGE_SCALE" checked>
            Large
          </label>
        </fieldset>

        <fieldset>
          <legend>Geography</legend>

          <p class="field-help">
            Leave both blank to receive opportunities across Chicago.
          </p>

          <label>
            Wards
            <input
              id="wards"
              type="text"
              inputmode="numeric"
              placeholder="Example: 1, 27, 42"
            >
          </label>

          <label>
            Community areas
            <input
              id="community-areas"
              type="text"
              placeholder="Example: Near North Side, Lake View"
            >
          </label>
        </fieldset>

        <label>
          Alert frequency
          <select id="alert-frequency">
            <option value="DAILY" selected>Daily</option>
            <option value="WEEKLY">Weekly</option>
            <option value="NONE">None</option>
          </select>
        </label>

        <p id="onboarding-message" class="auth-message">${escapeHtml(message)}</p>

        <div class="auth-actions">
          <button type="submit">Save profile</button>
          <button type="button" id="onboarding-signout" class="secondary-button">
            Sign out
          </button>
        </div>
      </form>
    </section>
  `;

  const form = document.getElementById('onboarding-form');
  const messageEl = document.getElementById('onboarding-message');

  const checkedValues = name =>
    [...document.querySelectorAll(`input[name="${name}"]:checked`)]
      .map(input => input.value);

  const csvValues = value =>
    value
      .split(',')
      .map(item => item.trim())
      .filter(Boolean);

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const companyName =
      document.getElementById('company-name').value.trim();

    const targetRoles = checkedValues('target-role');
    const targetProjectTypes = checkedValues('project-type');
    const targetScales = checkedValues('project-scale');

    const wards =
      csvValues(document.getElementById('wards').value);

    const communityAreas =
      csvValues(document.getElementById('community-areas').value);

    const alertFrequency =
      document.getElementById('alert-frequency').value;

    if (!companyName) {
      messageEl.textContent = 'Enter your company name.';
      return;
    }

    if (targetRoles.length === 0) {
      messageEl.textContent = 'Select at least one target role.';
      return;
    }

    if (targetProjectTypes.length === 0) {
      messageEl.textContent = 'Select at least one project type.';
      return;
    }

    if (targetScales.length === 0) {
      messageEl.textContent = 'Select at least one project scale.';
      return;
    }

    messageEl.textContent = 'Saving your profile…';

    const customerId =
      'cust_' + crypto.randomUUID().replaceAll('-', '');

    const { error } = await supabaseClient
      .from('customer_accounts')
      .insert({
        auth_user_id: user.id,
        customer_id: customerId,
        company_name: companyName,
        target_roles: targetRoles,
        target_project_types: targetProjectTypes,
        target_scales: targetScales,
        geography: {
          wards,
          community_areas: communityAreas
        },
        alert_frequency: alertFrequency
      });

    if (error) {
      messageEl.textContent = error.message;
      return;
    }

    messageEl.textContent =
      'Profile saved. Loading your dashboard…';

    await handleAuthenticatedUser(user);
  });

  document
    .getElementById('onboarding-signout')
    .addEventListener('click', async () => {
      await supabaseClient.auth.signOut();
    });
}


async function handleAuthenticatedUser(user) {
  const { data, error } = await supabaseClient
    .from('customer_accounts')
    .select('id, customer_id, company_name, subscription_status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    renderCustomerOnboarding(user);
    return;
  }

  await loadFeed();
  renderDashboard();
}

async function initAuth() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) throw error;

  if (data.session?.user) {
    await handleAuthenticatedUser(data.session.user);
  } else {
    renderAuth();
  }

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    if (!session?.user) {
      state.feed = null;
      state.selectedOpportunity = null;
      renderAuth();
    }
  });
}

async function init() {
  try {
    await initAuth();
  } catch (error) {
    app.innerHTML = `
      <section class="empty-card">
        <h2>Unable to start Chicago Intel</h2>
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
