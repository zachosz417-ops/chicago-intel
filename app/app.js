const state = {
  feed: null,
  deferredInstallPrompt: null,
  view: 'relevant',
  search: '',
  projectType: 'ALL',
  projectScale: 'ALL',
  sort: 'newest',
  selectedOpportunity: null,
  customerAccount: null,
  salesActivity: {},
  salesPersistenceAvailable: false,
  salesPersistenceMessage: 'Sales activity is currently saved in this browser session only.',
  salesStatusFilter: 'ALL',
  followUpFilter: 'ALL',
  dashboardScrollY: 0,
  dashboardOpportunityId: null,
  detailHistoryActive: false,
  companyResearchHistoryActive: false,
  companyResearchReturnOpportunity: null,
  companyResearchReturnScrollY: 0
};

const app = document.getElementById('app');

function returnToDashboardFromDetail() {
  state.detailHistoryActive = false;
  state.selectedOpportunity = null;
  renderDashboard();

  requestAnimationFrame(() => {
    window.scrollTo(0, state.dashboardScrollY || 0);

    const cards = [...document.querySelectorAll('[data-opportunity-id]')];
    const target = cards.find(
      item => item.dataset.opportunityId === state.dashboardOpportunityId
    );

    if (target) target.scrollIntoView({ block: 'nearest' });
  });
}

function openCompanyResearch(companyName) {
  state.companyResearchReturnOpportunity = state.selectedOpportunity || null;
  state.companyResearchReturnScrollY = window.scrollY;
  state.companyResearchHistoryActive = true;

  window.history.pushState(
    { ...(window.history.state || {}), chicagoIntelCompanyResearch: true },
    ''
  );

  renderCompanyResearch(companyName);
}

function returnFromCompanyResearch() {
  state.companyResearchHistoryActive = false;
  const returnOpportunity = state.companyResearchReturnOpportunity;
  state.companyResearchReturnOpportunity = null;

  if (returnOpportunity) {
    renderDetail(returnOpportunity);
    return;
  }

  renderDashboard();
  requestAnimationFrame(() => {
    window.scrollTo(0, state.companyResearchReturnScrollY || 0);
  });
}

window.addEventListener('popstate', () => {
  if (state.companyResearchHistoryActive) {
    returnFromCompanyResearch();
    return;
  }

  if (state.detailHistoryActive && state.selectedOpportunity) {
    returnToDashboardFromDetail();
  }
});

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
    if (
      state.view === 'relevant' &&
      !(opportunity.trade_relevance?.assessments || []).length
    ) {
      return false;
    }

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

    const activity = salesActivityFor(opportunity);

    if (
      state.salesStatusFilter !== 'ALL' &&
      activity.status !== state.salesStatusFilter
    ) {
      return false;
    }

    const followUpDate = activity.followUpDate;
    const today = localDateKey();

    if (state.followUpFilter === 'UPCOMING' &&
        (!followUpDate || followUpDate < today)) {
      return false;
    }

    if (state.followUpFilter === 'OVERDUE' &&
        (!followUpDate || followUpDate >= today)) {
      return false;
    }

    if (state.followUpFilter === 'NONE' && followUpDate) {
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
          ${company.company_name
            ? `<button type="button" class="company-name-link"
                data-company-name="${escapeHtml(company.company_name)}">${escapeHtml(company.company_name)}</button>`
            : '<strong>Company not reported</strong>'}
          <span>${escapeHtml(company.role || 'Role not reported')}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function contactIntelligenceMarkup(opportunity) {
  const companies = opportunity.participating_companies || [];
  const profiles = window.ChicagoIntelContactResearch?.profiles || [];
  const normalize = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const rows = companies.map(company => {
    const profile = profiles.find(item =>
      normalize(item.entity) === normalize(company.company_name) &&
      (item.matches || []).some(match =>
        String(match.permit_id) === String(opportunity.permit_id) &&
        normalize(match.company_name) === normalize(company.company_name)
      )
    );
    let content = "";
    if (!profile) {
      content = "<p class=\"muted\">No linked research in the current pilot. This company has not necessarily been researched.</p>";
    } else {
      const links = (profile.sources || []).map(source => {
        if (!/^https?:\/\//i.test(source.url || "")) return "";
        return "<li><a href=\"" + escapeHtml(source.url) + "\" target=\"_blank\" rel=\"noopener noreferrer\">" + escapeHtml(source.title || "View source") + "</a> <span class=\"contact-source-type\">" + escapeHtml(source.source_type || "Source") + "</span></li>";
      }).join("");
      content = "<p><strong>Company identity:</strong> " + escapeHtml(profile.identity_status) + " (" + Number(profile.identity_evidence_count || 0) + " sources)</p>" +
        "<p><strong>External project connection:</strong> " + escapeHtml(profile.project_status) + "</p>" +
        "<p><strong>External project relationship:</strong> " + escapeHtml(profile.relationship_status) + "</p>" +
        (links ? "<strong>Sources identifying the company</strong><ul>" + links + "</ul>" : "<p class=\"muted\">No confirmed company-controlled source was found.</p>") +
        "<p class=\"muted\">Phone and email were not established by this research snapshot.</p>";
    }
    return "<div class=\"contact-research-row\"><strong>" + escapeHtml(company.company_name || "Company not reported") + "</strong>" +
      "<span class=\"contact-research-role\">Reported permit role: " + escapeHtml(company.role || "Not reported") + "</span>" + content + "</div>";
  }).join("");
  return "<section class=\"detail-section contact-intelligence\"><h3>Contact intelligence</h3>" +
    "<p class=\"contact-research-disclaimer\">Read-only research pilot. Company identity evidence and permit participant records are separate. A reported permit role does not identify a purchasing decision-maker or establish that work is available or awarded.</p>" +
    (rows || "<p class=\"muted\">No participating companies reported.</p>") +
    "<p class=\"contact-pilot-note\">Coverage is limited to the current three-profile research pilot. Unmatched companies have not necessarily been researched.</p></section>";
}
function tradeRelevanceMarkup(opportunity) {
  const relevance = opportunity.trade_relevance;

  if (!relevance) return '';

  const assessments = relevance.assessments ?? [];

  if (!assessments.length) {
    return `
      <section class="trade-relevance">
        <strong>No description-based trade match identified</strong>
        <p class="muted">
          The available project description did not contain a matching
          trade signal. This does not establish that the project is irrelevant.
        </p>
      </section>
    `;
  }

  return `
    <section class="trade-relevance">
      <strong>Potential matches for your business</strong>

      ${assessments.map(item => `
        <div class="trade-match">
          <span class="trade-match-label">
            ${escapeHtml(item.trade.replaceAll('_', ' '))}
          </span>

          <p>
            Project description mentions:
            ${escapeHtml(
              item.evidence.map(evidence => evidence.matched_term).join(', ')
            )}
          </p>

          ${item.participant_context.length ? `
            <p class="muted">
              Reported participant context:
              ${escapeHtml(
                item.participant_context.map(context => context.matched_term).join(', ')
              )}
            </p>
          ` : ''}
        </div>
      `).join('')}

      <p class="trade-relevance-disclaimer">
        ${escapeHtml(relevance.disclaimer)}
      </p>
    </section>
  `;
}

function recommendedNextActionMarkup(opportunity) {
  const assessments = opportunity.trade_relevance?.assessments ?? [];

  if (assessments.length) {
    const trades = assessments
      .map(item => item.trade.replaceAll('_', ' '))
      .join(', ');

    return `
      <section class="next-action">
        <strong>Suggested next step</strong>
        <p>
          Review the permit record and project description for the
          ${escapeHtml(trades)} match. Verify any listed participants
          through official sources before considering outreach.
        </p>
      </section>
    `;
  }

  return `
    <section class="next-action">
      <strong>Suggested next step</strong>
      <p>
        Review the full permit record and available project details.
        No description-based match was identified for your selected trades.
      </p>
    </section>
  `;
}


function salesActivityFor(opportunity) {
  return state.salesActivity[opportunity.opportunity_id] || {
    status: 'New',
    notes: '',
    followUpDate: '',
    updatedAt: ''
  };
}

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function salesStatusBadge(opportunity) {
  const activity = salesActivityFor(opportunity);
  const status = activity.status || 'New';
  const followUp = activity.followUpDate
    ? `<span class="sales-card-followup">Follow-up: ${escapeHtml(formatDate(activity.followUpDate))}</span>`
    : '';

  return `
    <div class="sales-card-status">
      <span class="sales-status-pill">${escapeHtml(status)}</span>
      ${followUp}
    </div>
  `;
}

function opportunityCard(opportunity) {
  const description = opportunity.work_description || 'No project description reported.';
  const preview = description.length > 180
    ? description.slice(0, 177).trimEnd() + '...'
    : description;

  const assessments = opportunity.trade_relevance?.assessments ?? [];
  const companies = opportunity.participating_companies || [];
  const tradeSummary = assessments.length
    ? assessments.map(item => item.trade.replaceAll('_', ' ')).join(', ')
    : 'No description-based trade match identified';

  return `
    <article class="opportunity-card">
      ${signalMarkup(opportunity)}
      ${salesStatusBadge(opportunity)}

      <div class="card-topline">
        <span>${escapeHtml(opportunity.project_type || 'Project type not reported')}</span>
        <span>${escapeHtml(opportunity.project_scale || 'Scale not reported')}</span>
      </div>

      <h3>${escapeHtml(opportunity.address || 'Address unavailable')}</h3>

      <p class="card-description">
        ${escapeHtml(preview)}
      </p>

      <section class="card-match-preview">
        <span class="meta-label">Trade relevance</span>
        <strong>${escapeHtml(tradeSummary)}</strong>
        ${assessments.length ? `
          <p>Matched description terms: ${escapeHtml(
            assessments.flatMap(item => item.evidence.map(evidence => evidence.matched_term)).join(', ')
          )}</p>
        ` : ''}
      </section>

      <div class="card-meta">
        <div>
          <span class="meta-label">Permit stage</span>
          <strong>${escapeHtml(opportunity.permit_stage || 'Not reported')}</strong>
        </div>
        <div>
          <span class="meta-label">Issue date</span>
          <strong>${formatDate(opportunity.issue_date)}</strong>
        </div>
      </div>

      <div class="card-participant-summary">
        <span class="meta-label">Reported participants</span>
        <strong>${companies.length
          ? `${companies.length} source-listed ${companies.length === 1 ? 'company' : 'companies'}`
          : 'None reported'}</strong>
      </div>

      <div class="card-footer">
        <span>Reported cost: ${formatMoney(opportunity.reported_cost)}</span>
        <button
          class="card-open-button"
          type="button"
          data-opportunity-id="${escapeHtml(opportunity.opportunity_id)}"
        >View full project details →</button>
      </div>
    </article>
  `;
}


function companyResearchAttentionReasons(companyName) {
  const normalize = value =>
    String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const key = 'chicago-intel-company-research:' + normalize(companyName);

  try {
    const record = JSON.parse(localStorage.getItem(key) || '{}');
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return [];
    }

    const fields = [
      ['Website', 'website_review_status', 'website_source_url'],
      ['Phone', 'phone_review_status', 'phone_source_url'],
      ['Email', 'email_review_status', 'email_source_url'],
      ['Contact', 'contact_review_status', 'contact_source_url']
    ];

    const reasons = fields.flatMap(([label, statusField, sourceField]) => {
      const status = record[statusField];
      const effectiveStatus = [
        'USER_RECORDED', 'SOURCE_SUPPLIED', 'VERIFIED', 'NEEDS_REVIEW'
      ].includes(status)
        ? status
        : record[sourceField] ? 'SOURCE_SUPPLIED' : 'USER_RECORDED';

      if (effectiveStatus === 'SOURCE_SUPPLIED') {
        return [label + ' — source pending'];
      }
      if (effectiveStatus === 'NEEDS_REVIEW') {
        return [label + ' — needs review'];
      }
      return [];
    });

    const contacts = Array.isArray(record.contacts) ? record.contacts : [];
    contacts.forEach((contact, index) => {
      if (!contact || typeof contact !== 'object' || Array.isArray(contact)) return;

      const contactFields = [
        ['Contact ' + (index + 1) + ' name/role', 'identity_review_status', 'identity_source_url'],
        ['Contact ' + (index + 1) + ' phone', 'phone_review_status', 'phone_source_url'],
        ['Contact ' + (index + 1) + ' email', 'email_review_status', 'email_source_url']
      ];

      contactFields.forEach(([label, statusField, sourceField]) => {
        const status = contact[statusField];
        const effectiveStatus = [
          'USER_RECORDED', 'SOURCE_SUPPLIED', 'VERIFIED', 'NEEDS_REVIEW'
        ].includes(status)
          ? status
          : contact[sourceField] ? 'SOURCE_SUPPLIED' : 'USER_RECORDED';

        if (effectiveStatus === 'SOURCE_SUPPLIED') {
          reasons.push(label + ' — source pending');
        } else if (effectiveStatus === 'NEEDS_REVIEW') {
          reasons.push(label + ' — needs review');
        }
      });
    });

    return reasons;
  } catch (_) {
    return [];
  }
}


function companyResearchReadiness(companyName) {
  const normalize = value =>
    String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const key = 'chicago-intel-company-research:' + normalize(companyName);
  const levels = {
    NO_RECORD: 0,
    SOURCES_RECORDED: 1,
    CONTACT_ROUTE: 2,
    NAMED_CONTACT: 3,
    VERIFIED_ROUTE: 4
  };

  try {
    const record = JSON.parse(localStorage.getItem(key) || 'null');
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      return 'NO_RECORD';
    }

    let level = levels.SOURCES_RECORDED;
    const verified = (value, source, status) =>
      Boolean(value && source && status === 'VERIFIED');

    if (record.phone || record.email) {
      level = levels.CONTACT_ROUTE;
    }

    const contacts = Array.isArray(record.contacts) ? record.contacts : [];
    const namedContact = contacts.some(contact =>
      contact && typeof contact === 'object' &&
      String(contact.name || '').trim() &&
      String(contact.identity_source_url || '').trim()
    ) || (
      String(record.contact_name || '').trim() &&
      String(record.contact_source_url || '').trim()
    );

    if (namedContact) level = Math.max(level, levels.NAMED_CONTACT);

    const verifiedBusinessRoute =
      verified(record.phone, record.phone_source_url, record.phone_review_status) ||
      verified(record.email, record.email_source_url, record.email_review_status);

    const verifiedNamedContact = contacts.some(contact =>
      contact && typeof contact === 'object' &&
      verified(contact.name, contact.identity_source_url, contact.identity_review_status) &&
      (
        verified(contact.phone, contact.phone_source_url, contact.phone_review_status) ||
        verified(contact.email, contact.email_source_url, contact.email_review_status)
      )
    );

    const verifiedLegacyContact =
      verified(record.contact_name, record.contact_source_url, record.contact_review_status) &&
      (
        verified(record.phone, record.phone_source_url, record.phone_review_status) ||
        verified(record.email, record.email_source_url, record.email_review_status)
      );

    if (verifiedBusinessRoute || verifiedNamedContact || verifiedLegacyContact) {
      level = levels.VERIFIED_ROUTE;
    }

    return Object.keys(levels).find(name => levels[name] === level) || 'NO_RECORD';
  } catch (_) {
    return 'NO_RECORD';
  }
}

function companyContactVerificationReasons(companyName) {
  return companyResearchAttentionReasons(companyName).filter(reason =>
    /^(Phone|Email|Contact)/.test(reason)
  );
}

function companyVerificationSortRank(companyName) {
  const reasons = companyContactVerificationReasons(companyName);
  const pendingRoutes = reasons.filter(reason =>
    /^(Phone|Email|Contact \d+ (phone|email))/.test(reason)
  );

  if (!pendingRoutes.length) {
    return reasons.some(reason => /^Contact \d+ name\/role/.test(reason)) ? 1 : 0;
  }

  const normalize = value =>
    String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const key = 'chicago-intel-company-research:' + normalize(companyName);

  try {
    const record = JSON.parse(localStorage.getItem(key) || 'null');
    if (!record || typeof record !== 'object' || Array.isArray(record)) return 2;

    const contacts = Array.isArray(record.contacts) ? record.contacts : [];
    const namedContactWithPendingRoute = contacts.some((contact, index) =>
      contact &&
      typeof contact === 'object' &&
      String(contact.name || '').trim() &&
      pendingRoutes.some(reason =>
        reason.startsWith('Contact ' + (index + 1) + ' phone') ||
        reason.startsWith('Contact ' + (index + 1) + ' email')
      )
    );

    const legacyNamedContactWithPendingRoute =
      String(record.contact_name || '').trim() &&
      pendingRoutes.some(reason => /^(Phone|Email)/.test(reason));

    return namedContactWithPendingRoute || legacyNamedContactWithPendingRoute ? 3 : 2;
  } catch (_) {
    return 2;
  }
}

function companyResearchNeedsAttention(companyName) {
  return companyResearchAttentionReasons(companyName).length > 0;
}

function contactResearchWorkspaceMarkup() {
  const report = window.ChicagoIntelResearchPriority;
  const profiles = window.ChicagoIntelContactResearch?.profiles || [];

  if (!report || !Array.isArray(report.companies)) return '';

  const normalize = value =>
    String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const researched = new Map(
    profiles.map(profile => [normalize(profile.entity), profile])
  );

  const companies = [...report.companies].sort((a, b) => {
    const rankDifference =
      companyVerificationSortRank(b.company_name) -
      companyVerificationSortRank(a.company_name);

    if (rankDifference) return rankDifference;

    return Number(b.research_priority || 0) -
      Number(a.research_priority || 0);
  });
  const tierCounts = report.tier_counts || {};

  const rows = companies.map((company, index) => {
    const profile = researched.get(normalize(company.company_name));
    const attentionReasons = companyResearchAttentionReasons(company.company_name);
    const needsAttention = attentionReasons.length > 0;
    const verificationReasons = companyContactVerificationReasons(company.company_name);
    const needsVerification = verificationReasons.length > 0;
    const verificationRank = companyVerificationSortRank(company.company_name);
    const verificationPriorityLabel =
      verificationRank === 3 ? 'High' :
      verificationRank === 2 ? 'Medium' :
      verificationRank === 1 ? 'Low' : '—';
    const readiness = companyResearchReadiness(company.company_name);
    const readinessLabels = {
      NO_RECORD: 'No local research',
      SOURCES_RECORDED: 'Sources recorded',
      CONTACT_ROUTE: 'Public contact route recorded',
      NAMED_CONTACT: 'Named contact recorded',
      VERIFIED_ROUTE: 'Verified contact route'
    };
    const attentionMarkup = attentionReasons.length
      ? attentionReasons.map(reason =>
          `<span class="research-attention-tag">${escapeHtml(reason)}</span>`
        ).join(' ')
      : '<span class="muted">No attention needed</span>';
    const roles = (company.roles || []).join(', ');
    const roleText = roles.toUpperCase();

    let category = 'OTHER';
    if (/GENERAL CONTRACTOR|CONTRACTOR/.test(roleText)) category = 'CONTRACTOR';
    else if (/OWNER|DEVELOPER/.test(roleText)) category = 'OWNER';
    else if (/ARCHITECT|DESIGN/.test(roleText)) category = 'DESIGN';
    else if (/EXPEDITOR/.test(roleText)) category = 'EXPEDITOR';

    const status = profile ? 'RESEARCHED' : 'UNRESEARCHED';

    let evidenceStatus = 'Unresearched';
    if (profile) {
      evidenceStatus =
        'Identity: ' + (profile.identity_status || 'Not established') +
        ' · Project: ' + (profile.project_status || 'Not established') +
        ' · Relationship: ' + (profile.relationship_status || 'Not established');
    }

    return `
      <tr
        data-company="${escapeHtml(company.company_name || '')}"
        data-roles="${escapeHtml(roleText)}"
        data-category="${category}"
        data-tier="${escapeHtml(company.research_tier || 'UNRANKED')}"
        data-research-status="${status}"
        data-attention-needed="${needsAttention}"
        data-verification-needed="${needsVerification}"
        data-readiness="${readiness}"
      >
        <td>${index + 1}</td>
        <td><button type="button" class="company-name-link" data-company-name="${escapeHtml(company.company_name || '')}">${escapeHtml(company.company_name || 'Name unavailable')}</button></td>
        <td>${escapeHtml(roles || 'Role not reported')}</td>
        <td>${Number(company.project_count || 0)}</td>
        <td>${(company.permit_ids || []).length}</td>
        <td>${escapeHtml(company.research_tier || 'Unranked')}</td>
        <td>${Number(company.research_priority || 0)}</td>
        <td>${escapeHtml(evidenceStatus)}</td>
        <td>${escapeHtml(readinessLabels[readiness])}</td>
        <td>${escapeHtml(verificationPriorityLabel)}</td>
        <td>${attentionMarkup}</td>
      </tr>
    `;
  }).join('');

  return `
    <section class="detail-section research-workspace">
      <h2>Contact Research Workspace</h2>
      <p class="muted">
        Research priorities for companies appearing in the project data.
        Priority is a sorting aid—not proof of a purchasing relationship,
        project connection, available work, or awarded contract.
      </p>

      <div class="research-workspace-summary">
        <strong>${companies.length} companies in the research queue</strong>
        <span id="research-attention-summary">${companies.filter(company => companyResearchNeedsAttention(company.company_name)).length} companies need research attention</span>
        <span>${Number(tierCounts.TIER_1_PRIMARY || 0)} primary-priority</span>
        <span>${Number(tierCounts.TIER_2_INFLUENCER || 0)} influencer</span>
        <span>${Number(tierCounts.TIER_3_SPECIALTY || 0)} specialty</span>
        <span>${Number(tierCounts.TIER_4_LOW_PRIORITY || 0)} lower-priority</span>
        <span>${companies.filter(c => companyResearchReadiness(c.company_name) === 'CONTACT_ROUTE').length} with public contact routes recorded</span>
        <span>${companies.filter(c => companyResearchReadiness(c.company_name) === 'NAMED_CONTACT').length} with named contacts recorded</span>
        <span>${companies.filter(c => companyResearchReadiness(c.company_name) === 'VERIFIED_ROUTE').length} with verified contact routes</span>
        <span>${companies.filter(c => companyContactVerificationReasons(c.company_name).length > 0).length} needing contact verification</span>
      </div>


      <div class="research-filters">
        <label>
          Search company
          <input id="research-company-search" type="search"
            placeholder="Enter company name..." autocomplete="off">
        </label>

        <label>
          Reported role category
          <select id="research-role-filter">
            <option value="ALL">All roles</option>
            <option value="CONTRACTOR">Contractors</option>
            <option value="OWNER">Owners / developers</option>
            <option value="DESIGN">Architects / design</option>
            <option value="EXPEDITOR">Expeditors</option>
            <option value="OTHER">Other / unclassified</option>
          </select>
        </label>

        <label>
          Research status
          <select id="research-status-filter">
            <option value="ALL">All statuses</option>
            <option value="UNRESEARCHED">Unresearched</option>
            <option value="RESEARCHED">Research profile available</option>
          </select>
        </label>

        <label>
          Research attention
          <select id="research-attention-filter">
            <option value="ALL">All companies</option>
            <option value="NEEDS_ATTENTION">Needs attention</option>
          </select>
        </label>

        <label>
          Contact readiness
          <select id="research-readiness-filter">
            <option value="ALL">All readiness levels</option>
            <option value="NO_RECORD">No local research</option>
            <option value="SOURCES_RECORDED">Sources recorded</option>
            <option value="CONTACT_ROUTE">Public contact route recorded</option>
            <option value="NAMED_CONTACT">Named contact recorded</option>
            <option value="VERIFIED_ROUTE">Verified contact route</option>
          </select>
        </label>
        <label>
          Verification status
          <select id="research-verification-filter">
            <option value="ALL">All companies</option>
            <option value="NEEDS_VERIFICATION">Needs verification</option>
            <option value="NO_PENDING_VERIFICATION">No pending contact verification</option>
          </select>
        </label>
        <label>
          Priority tier
          <select id="research-tier-filter">
            <option value="ALL">All tiers</option>
            <option value="TIER_1_PRIMARY">Tier 1 — Primary</option>
            <option value="TIER_2_INFLUENCER">Tier 2 — Influencer</option>
            <option value="TIER_3_SPECIALTY">Tier 3 — Specialty</option>
            <option value="TIER_4_LOW_PRIORITY">Tier 4 — Lower priority</option>
          </select>
        </label>
      </div>

      <p id="research-filter-count" class="muted" role="status">
        Showing ${companies.length} of ${companies.length} companies
      </p>

      <details class="research-workspace-table">
        <summary>View company research priorities</summary>
        <div class="research-table-scroll">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Company</th>
                <th>Reported roles</th>
                <th>Projects</th>
                <th>Permits</th>
                <th>Tier</th>
                <th>Priority</th>
                <th>Evidence status</th>
                <th>Contact readiness</th>
                <th>Verification priority</th>
                <th>Research attention</th>
              </tr>
            </thead>
            <tbody id="research-company-rows">${rows}</tbody>
          </table>
        </div>
      </details>

      <p class="muted">
        A research profile does not necessarily confirm a project relationship.
        An unresearched company has not been verified or ruled out.
        No phone numbers or email addresses are inferred.
      </p>
    </section>
  `;
}


function renderCompanyResearch(companyName) {
  const report = window.ChicagoIntelResearchPriority;
  const profiles = window.ChicagoIntelContactResearch?.profiles || [];

  const reportCompanies = Array.isArray(report?.companies)
    ? report.companies
    : [];

  const normalize = value =>
    String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  const companyKey = normalize(companyName);
  const company = reportCompanies.find(
    item => normalize(item.company_name) === companyKey
  );

  const companyRecord = company || {
    company_name: companyName,
    roles: [],
    permit_ids: [],
    research_priority: 0,
    research_tier: 'Unranked',
    project_count: 0
  };

  const profile = profiles.find(
    item => normalize(item.entity) === companyKey
  );

  const roles = companyRecord.roles || [];
  const permits = companyRecord.permit_ids || [];
  const matchedProjects = [];

  for (const opportunity of state.feed?.opportunities || []) {
    for (const participant of opportunity.participating_companies || []) {
      const sameCompany =
        normalize(participant.company_name) === companyKey;
      const samePermit =
        String(participant.permit_id || '') ===
        String(opportunity.permit_id || '');

      if (sameCompany && samePermit) {
        matchedProjects.push({ opportunity, participant });
      }
    }
  }

  const sources = profile?.sources || [];

  const sourceMarkup = sources.length
    ? sources.map(source => {
        let safeUrl = '';
        try {
          const parsed = new URL(source.url);
          if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
            safeUrl = parsed.href;
          }
        } catch (_) {}

        return `
          <li class="company-evidence-item">
            <strong>${escapeHtml(source.title || 'Untitled source')}</strong>
            <span>${escapeHtml(source.source_type || 'Source type unavailable')} · ${escapeHtml(source.status || 'Status unavailable')}</span>
            ${safeUrl
              ? `<a href="${escapeHtml(safeUrl)}" target="_blank" rel="noopener noreferrer">Open source</a>`
              : '<span>Source link unavailable</span>'}
          </li>
        `;
      }).join('')
    : '<p class="muted">No research sources are currently loaded for this companyRecord.</p>';

  const projectMarkup = matchedProjects.length
    ? matchedProjects.map(({ opportunity, participant }) => `
        <article class="company-project-card">
          <strong>${escapeHtml(opportunity.address || 'Address unavailable')}</strong>
          <p>Permit: ${escapeHtml(opportunity.permit_id || 'Not reported')}</p>
          <p>Reported role: ${escapeHtml(participant.role || 'Not reported')}</p>
          <p>${escapeHtml(opportunity.project_type || 'Project type unavailable')} · ${escapeHtml(opportunity.permit_stage || 'Stage unavailable')}</p>
          <button type="button" data-company-project-id="${escapeHtml(opportunity.opportunity_id || '')}">
            View project details
          </button>
        </article>
      `).join('')
    : '<p class="muted">No exact company-and-permit match was found in the currently loaded customer feed. This does not establish that the company has no other project connections.</p>';

  const identityStatus = profile?.identity_status || 'Not researched';
  const projectStatus = profile?.project_status || 'Not established';
  const relationshipStatus = profile?.relationship_status || 'Not established';


  const researchStorageKey = 'chicago-intel-company-research:' + companyKey;
  let savedResearch = {};

  try {
    savedResearch = JSON.parse(localStorage.getItem(researchStorageKey) || '{}');
    if (!savedResearch || typeof savedResearch !== 'object' || Array.isArray(savedResearch)) {
      savedResearch = {};
    }
  } catch (_) {
    savedResearch = {};
  }

  const savedField = key => escapeHtml(savedResearch[key] || '');

  // Additional contacts are stored separately from the legacy single-contact fields.
  const savedContacts = Array.isArray(savedResearch.contacts)
    ? savedResearch.contacts.filter(contact =>
        contact && typeof contact === 'object' && !Array.isArray(contact)
      )
    : [];

  const contactStatusOptions = (contact, statusField, sourceField) => {
    let selected = contact[statusField];
    if (!Object.prototype.hasOwnProperty.call(reviewStatuses, selected)) {
      selected = contact[sourceField] ? 'SOURCE_SUPPLIED' : 'USER_RECORDED';
    }

    return Object.entries(reviewStatuses).map(([value, label]) =>
      `<option value="${value}" ${value === selected ? 'selected' : ''}>${label}</option>`
    ).join('');
  };

  const additionalContactCard = (contact = {}, index = 0) => `
    <fieldset class="additional-contact-card" data-contact-card>
      <legend>Additional contact ${index + 1}</legend>

      <label>
        Contact name
        <input type="text" data-contact-field="name"
          value="${escapeHtml(contact.name || '')}">
      </label>

      <label>
        Reported role
        <input type="text" data-contact-field="role"
          placeholder="Source-supported role only"
          value="${escapeHtml(contact.role || '')}">
      </label>

      <label>
        Name and role evidence URL
        <input type="url" data-contact-field="identity_source_url"
          placeholder="Source identifying this person and role"
          value="${escapeHtml(contact.identity_source_url || '')}">
      </label>

      <label>
        Name and role review status
        <select data-contact-field="identity_review_status">
          ${contactStatusOptions(contact, 'identity_review_status', 'identity_source_url')}
        </select>
      </label>

      <label>
        Public phone
        <input type="tel" data-contact-field="phone"
          value="${escapeHtml(contact.phone || '')}">
      </label>

      <label>
        Phone evidence URL
        <input type="url" data-contact-field="phone_source_url"
          placeholder="Source confirming this phone"
          value="${escapeHtml(contact.phone_source_url || '')}">
      </label>

      <label>
        Phone review status
        <select data-contact-field="phone_review_status">
          ${contactStatusOptions(contact, 'phone_review_status', 'phone_source_url')}
        </select>
      </label>

      <label>
        Public email
        <input type="email" data-contact-field="email"
          value="${escapeHtml(contact.email || '')}">
      </label>

      <label>
        Email evidence URL
        <input type="url" data-contact-field="email_source_url"
          placeholder="Source confirming this email"
          value="${escapeHtml(contact.email_source_url || '')}">
      </label>

      <label>
        Email review status
        <select data-contact-field="email_review_status">
          ${contactStatusOptions(contact, 'email_review_status', 'email_source_url')}
        </select>
      </label>

      <label>
        Date checked
        <input type="date" data-contact-field="date_checked"
          value="${escapeHtml(contact.date_checked || '')}">
      </label>

      <button type="button" class="remove-contact-button" data-remove-contact>
        Remove this contact
      </button>
    </fieldset>
  `;

  const savedEvidenceLink = (url, label) => {
    if (!url) return '<span class="muted">No source URL recorded</span>';

    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        throw new Error('Invalid protocol');
      }

      return `<a href="${escapeHtml(parsed.href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
    } catch (_) {
      return '<span class="muted">Source URL is invalid</span>';
    }
  };

  const reviewStatuses = {
    USER_RECORDED: 'User-recorded — not independently checked',
    SOURCE_SUPPLIED: 'Source supplied — not yet reviewed',
    VERIFIED: 'Verified by manual source review',
    NEEDS_REVIEW: 'Needs review'
  };

  const reviewStatusFor = (field, sourceField) => {
    const saved = savedResearch[field];
    if (Object.prototype.hasOwnProperty.call(reviewStatuses, saved)) return saved;
    return savedResearch[sourceField] ? 'SOURCE_SUPPLIED' : 'USER_RECORDED';
  };

  const reviewStatusOptions = (field, sourceField) => {
    const selected = reviewStatusFor(field, sourceField);
    return Object.entries(reviewStatuses).map(([value, label]) =>
      `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`
    ).join('');
  };

  const savedEvidenceRows = [
    ['Company website', savedResearch.website, savedResearch.website_source_url, 'website_review_status'],
    ['Public business phone', savedResearch.phone, savedResearch.phone_source_url, 'phone_review_status'],
    ['Public business email', savedResearch.email, savedResearch.email_source_url, 'email_review_status'],
    [
      'Contact and reported role',
      [savedResearch.contact_name, savedResearch.contact_role].filter(Boolean).join(' — '),
      savedResearch.contact_source_url,
      'contact_review_status'
    ]
  ].filter(row => row[1] || row[2]);

  const savedEvidenceMarkup = `
    <section class="detail-section company-saved-evidence">
      <h3>Saved research evidence</h3>
      <p class="muted">
        User-recorded details and their supplied source references.
        These entries have not been independently verified.
      </p>
      ${
        savedEvidenceRows.length
          ? `<ul class="company-evidence-list">
              ${savedEvidenceRows.map(([label, value, url, statusField]) => `
                <li>
                  <strong>${escapeHtml(label)}:</strong>
                  ${escapeHtml(value || 'No detail recorded')}
                  <br>${savedEvidenceLink(url, 'Open supporting source')}
                  <br><span class="muted">${escapeHtml(reviewStatuses[reviewStatusFor(statusField, statusField.replace('_review_status', '_source_url'))])}</span>
                </li>
              `).join('')}
            </ul>`
          : '<p class="muted">No individual evidence entries have been saved yet.</p>'
      }
      ${
        savedResearch.source_url
          ? `<p><strong>General research source:</strong>
              ${savedEvidenceLink(savedResearch.source_url, 'Open additional source')}
            </p>`
          : ''
      }
      ${
        savedResearch.date_checked
          ? `<p><strong>Date checked:</strong> ${escapeHtml(savedResearch.date_checked)}</p>`
          : ''
      }
    </section>
  `;



  const savedContactEvidenceMarkup = `
    <section class="detail-section company-saved-evidence">
      <h3>Saved contact evidence</h3>
      <p class="muted">
        Separately recorded people and public contact details.
        Reported roles do not establish purchasing authority or decision-making responsibility.
        Review statuses reflect manual recordkeeping, not independent verification by this app.
      </p>
      ${
        savedContacts.length
          ? `<div class="company-evidence-list">
              ${savedContacts.map((contact, index) => {
                const contactReviewStatus = (statusField, sourceField) => {
                  const status = contact[statusField];
                  const effectiveStatus = Object.prototype.hasOwnProperty.call(reviewStatuses, status)
                    ? status
                    : contact[sourceField] ? 'SOURCE_SUPPLIED' : 'USER_RECORDED';
                  return reviewStatuses[effectiveStatus];
                };

                return `
                  <article class="company-evidence-item">
                    <h4>${escapeHtml(contact.name || `Additional contact ${index + 1}`)}</h4>
                    <p><strong>Reported role:</strong> ${escapeHtml(contact.role || 'Not recorded')}</p>

                    <p>
                      <strong>Name and role evidence:</strong>
                      ${savedEvidenceLink(contact.identity_source_url, 'Open supporting source')}
                      <br><span class="muted">${escapeHtml(contactReviewStatus('identity_review_status', 'identity_source_url'))}</span>
                    </p>

                    <p>
                      <strong>Public phone:</strong> ${escapeHtml(contact.phone || 'Not recorded')}
                      <br>${savedEvidenceLink(contact.phone_source_url, 'Open phone source')}
                      <br><span class="muted">${escapeHtml(contactReviewStatus('phone_review_status', 'phone_source_url'))}</span>
                    </p>

                    <p>
                      <strong>Public email:</strong> ${escapeHtml(contact.email || 'Not recorded')}
                      <br>${savedEvidenceLink(contact.email_source_url, 'Open email source')}
                      <br><span class="muted">${escapeHtml(contactReviewStatus('email_review_status', 'email_source_url'))}</span>
                    </p>

                    <p><strong>Date checked:</strong> ${escapeHtml(contact.date_checked || 'Not recorded')}</p>
                  </article>
                `;
              }).join('')}
            </div>`
          : '<p class="muted">No additional contact records have been saved yet.</p>'
      }
    </section>
  `;

  const researchEditorMarkup = `
    <section class="detail-section company-research-editor">
      <h3>Company research notes</h3>
      <p class="muted">
        Record publicly supported business and contact details. Give each
        detail its own source URL whenever possible. Entries are stored
        in this browser only and are not independently verified.
      </p>

      <p class="company-research-record-status">
        User-recorded research — not independently verified
      </p>

      <form id="company-research-form">
        <label>
          Company website
          <input name="website" type="url" placeholder="https://example.com"
            value="${savedField('website')}">
        </label>

        <label>
          Website evidence URL
          <input name="website_source_url" type="url"
            placeholder="Source confirming the website"
            value="${savedField('website_source_url')}">
        </label>
        <label>
          Website evidence review status
          <select name="website_review_status">
            ${reviewStatusOptions('website_review_status', 'website_source_url')}
          </select>
        </label>

        <label>
          Public business phone
          <input name="phone" type="tel" placeholder="Public business number"
            value="${savedField('phone')}">
        </label>

        <label>
          Phone evidence URL
          <input name="phone_source_url" type="url"
            placeholder="Source confirming this phone number"
            value="${savedField('phone_source_url')}">
        </label>
        <label>
          Phone evidence review status
          <select name="phone_review_status">
            ${reviewStatusOptions('phone_review_status', 'phone_source_url')}
          </select>
        </label>

        <label>
          Public business email
          <input name="email" type="email" placeholder="name@example.com"
            value="${savedField('email')}">
        </label>

        <label>
          Email evidence URL
          <input name="email_source_url" type="url"
            placeholder="Source confirming this email"
            value="${savedField('email_source_url')}">
        </label>
        <label>
          Email evidence review status
          <select name="email_review_status">
            ${reviewStatusOptions('email_review_status', 'email_source_url')}
          </select>
        </label>

        <label>
          Contact person's name
          <input name="contact_name" type="text"
            value="${savedField('contact_name')}">
        </label>

        <label>
          Contact person's reported role
          <input name="contact_role" type="text"
            placeholder="Use only a source-supported role"
            value="${savedField('contact_role')}">
        </label>

        <label>
          Contact name and role evidence URL
          <input name="contact_source_url" type="url"
            placeholder="Source identifying this person and role"
            value="${savedField('contact_source_url')}">
        </label>
        <label>
          Contact evidence review status
          <select name="contact_review_status">
            ${reviewStatusOptions('contact_review_status', 'contact_source_url')}
          </select>
        </label>

        <label>
          General research source URL
          <input name="source_url" type="url"
            placeholder="Additional or legacy source reference"
            value="${savedField('source_url')}">
        </label>

        <label>
          Date checked
          <input name="date_checked" type="date"
            value="${savedField('date_checked')}">
        </label>

        <label>
          Research notes
          <textarea name="notes" rows="4"
            placeholder="Record what each source actually confirms...">${savedField('notes')}</textarea>
        </label>

        <section class="additional-contacts-section">
          <h3>Additional company contacts</h3>
          <p class="muted">
            Add separately sourced people associated with this companyRecord.
            A reported role does not establish purchasing authority.
          </p>
          <div id="additional-contacts-list">
            ${savedContacts.map((contact, index) =>
              additionalContactCard(contact, index)
            ).join('')}
          </div>
          <button type="button" id="add-company-contact">
            Add contact
          </button>
        </section>

        <button type="submit" id="save-company-research">
          Save local research
        </button>
        <p id="company-research-save-message" class="muted" role="status">
          ${Object.keys(savedResearch).length ? 'Previously saved local research loaded.' : 'No local research saved for this company yet.'}
        </p>
      </form>

      <p class="muted">
        A saved entry is not proof that a person is a decision-maker
        or that a project opportunity is available. Browser data may be
        lost if this browser's site data is cleared.
      </p>
    </section>
  `;

  app.innerHTML = `
    <section class="company-research-page">
      <button id="company-research-back" class="back-button" type="button">
        ← Back to research workspace
      </button>

      <article class="detail-card">
        <p class="eyebrow">Company research record</p>
        <h2>${escapeHtml(companyRecord.company_name || companyName)}</h2>

        <div class="detail-grid">
          <div><span class="meta-label">Research priority</span><strong>${Number(companyRecord.research_priority || 0)}</strong></div>
          <div><span class="meta-label">Priority tier</span><strong>${escapeHtml(companyRecord.research_tier || 'Unranked')}</strong></div>
          <div><span class="meta-label">Reported projects</span><strong>${Number(companyRecord.project_count || 0)}</strong></div>
          <div><span class="meta-label">Reported permits</span><strong>${permits.length}</strong></div>
        </div>

        <section class="detail-section">
          <h3>Reported company roles</h3>
          <p>${escapeHtml(roles.join(', ') || 'No roles reported')}</p>
          <p class="muted">These are roles appearing in collected project data. They do not independently establish authority to award work.</p>
        </section>

        <section class="detail-section">
          <h3>Research evidence status</h3>
          <div class="company-evidence-status">
            <p><strong>Company identity:</strong> ${escapeHtml(identityStatus)}</p>
            <p><strong>Project connection:</strong> ${escapeHtml(projectStatus)}</p>
            <p><strong>Reported relationship:</strong> ${escapeHtml(relationshipStatus)}</p>
          </div>
          <p class="muted">Corroborating a company's identity does not establish its connection to a specific project or its authority in a purchasing decision.</p>
        </section>

        <section class="detail-section">
          <h3>Research sources</h3>
          <ul class="company-evidence-list">${sourceMarkup}</ul>
        </section>

        <section class="detail-section">
          <h3>Projects in your customer feed</h3>
          <p class="muted">Matches require both the company name and permit ID to match a reported participant record.</p>
          ${projectMarkup}
        </section>

        <section class="detail-section">
          <h3>Reported permit IDs</h3>
          <p>${permits.length ? permits.map(permit => escapeHtml(permit)).join(', ') : 'No permit IDs listed in the research priority report.'}</p>
        </section>

        ${savedEvidenceMarkup}
        ${savedContactEvidenceMarkup}

        ${researchEditorMarkup}

        <section class="detail-section">
          <h3>Contact information</h3>
          <p class="muted">No verified phone number or email address is available in this research profile. No contact details have been inferred.</p>
        </section>

        <p class="data-disclaimer">Research priority is a sorting aid, not proof of available work, an awarded contract, a purchasing relationship, or a decision-maker. Reported participant roles are not necessarily decision-making roles.</p>
      </article>
    </section>
  `;


  const researchForm = document.getElementById('company-research-form');

  if (researchForm) {
    const contactList = document.getElementById('additional-contacts-list');
    const addContactButton = document.getElementById('add-company-contact');

    if (contactList && addContactButton) {
      addContactButton.addEventListener('click', () => {
        const index = contactList.querySelectorAll('[data-contact-card]').length;
        contactList.insertAdjacentHTML(
          'beforeend',
          additionalContactCard({}, index)
        );
      });

      contactList.addEventListener('click', event => {
        const removeButton = event.target.closest('[data-remove-contact]');
        if (removeButton) {
          removeButton.closest('[data-contact-card]')?.remove();
        }
      });
    }

    researchForm.addEventListener('submit', event => {
      event.preventDefault();

      const formData = new FormData(researchForm);
      const record = {};

      for (const field of [
        'website',
        'website_source_url',
        'phone',
        'phone_source_url',
        'email',
        'email_source_url',
        'contact_name',
        'contact_role',
        'contact_source_url',
        'website_review_status',
        'phone_review_status',
        'email_review_status',
        'contact_review_status',
        'source_url',
        'date_checked',
        'notes'
      ]) {
        record[field] = String(formData.get(field) || '').trim();
      }

      record.contacts = Array.from(
        document.querySelectorAll('#additional-contacts-list [data-contact-card]')
      ).map(card => {
        const contact = {};
        card.querySelectorAll('[data-contact-field]').forEach(input => {
          contact[input.dataset.contactField] = String(input.value || '').trim();
        });

        for (const [statusField, sourceField] of [
          ['identity_review_status', 'identity_source_url'],
          ['phone_review_status', 'phone_source_url'],
          ['email_review_status', 'email_source_url']
        ]) {
          if (!Object.prototype.hasOwnProperty.call(reviewStatuses, contact[statusField])) {
            contact[statusField] = contact[sourceField]
              ? 'SOURCE_SUPPLIED'
              : 'USER_RECORDED';
          }
        }

        return contact;
      }).filter(contact =>
        Object.entries(contact).some(([key, value]) =>
          key.endsWith('_review_status')
            ? value !== 'USER_RECORDED'
            : Boolean(value)
        )
      );

      const statusFields = [
        'website_review_status',
        'phone_review_status',
        'email_review_status',
        'contact_review_status'
      ];

      for (const field of statusFields) {
        if (!Object.prototype.hasOwnProperty.call(reviewStatuses, record[field])) {
          const sourceField = field.replace('_review_status', '_source_url');
          record[field] = record[sourceField] ? 'SOURCE_SUPPLIED' : 'USER_RECORDED';
        }
      }

      const verifiedRequirements = [
        ['website_review_status', 'website', 'website_source_url'],
        ['phone_review_status', 'phone', 'phone_source_url'],
        ['email_review_status', 'email', 'email_source_url'],
        ['contact_review_status', 'contact_name', 'contact_source_url']
      ];

      for (const [statusField, detailField, sourceField] of verifiedRequirements) {
        if (record[statusField] === 'VERIFIED' &&
            (!record[detailField] || !record[sourceField])) {
          const message = document.getElementById('company-research-save-message');
          message.textContent = 'To mark a detail verified, provide both the detail and its supporting source URL.';
          return;
        }
      }

      const urlFields = [
        'website',
        'website_source_url',
        'phone_source_url',
        'email_source_url',
        'contact_source_url',
        'source_url'
      ];

      for (const field of urlFields) {
        const value = record[field];
        if (!value) continue;

        try {
          const parsed = new URL(value);
          if (!['http:', 'https:'].includes(parsed.protocol)) {
            throw new Error('Only HTTP and HTTPS URLs are accepted.');
          }
        } catch (_) {
          const message = document.getElementById('company-research-save-message');
          message.textContent = 'Please enter valid HTTP or HTTPS source URLs.';
          return;
        }
      }

      for (const contact of record.contacts) {
        for (const field of [
          'identity_source_url',
          'phone_source_url',
          'email_source_url'
        ]) {
          const value = contact[field];
          if (!value) continue;

          try {
            const parsed = new URL(value);
            if (!['http:', 'https:'].includes(parsed.protocol)) {
              throw new Error('Only HTTP and HTTPS URLs are accepted.');
            }
          } catch (_) {
            const message = document.getElementById('company-research-save-message');
            message.textContent = 'Please enter valid HTTP or HTTPS URLs for every contact source.';
            return;
          }
        }

        const verifiedRequirements = [
          ['identity_review_status', 'name', 'identity_source_url'],
          ['phone_review_status', 'phone', 'phone_source_url'],
          ['email_review_status', 'email', 'email_source_url']
        ];

        for (const [statusField, detailField, sourceField] of verifiedRequirements) {
          if (contact[statusField] === 'VERIFIED' &&
              (!contact[detailField] || !contact[sourceField])) {
            const message = document.getElementById('company-research-save-message');
            message.textContent = 'A contact detail marked verified needs both its value and supporting source URL.';
            return;
          }
        }
      }

      record.updated_at = new Date().toISOString();
      record.record_status = 'USER_RECORDED_NOT_INDEPENDENTLY_VERIFIED';

      const message = document.getElementById('company-research-save-message');
      const saveButton = document.getElementById('save-company-research');

      try {
        localStorage.setItem(researchStorageKey, JSON.stringify(record));
        savedResearch = record;
        message.textContent = 'Saved in this browser. Entries are not independently verified.';
      } catch (error) {
        console.error('Local company research save failed:', error);
        message.textContent = 'Unable to save in this browser. Check browser storage availability.';
      }
    });
  }

  document.getElementById('company-research-back').addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    if (state.companyResearchHistoryActive) {
      window.history.back();
    } else {
      returnFromCompanyResearch();
    }
  });

  document.querySelectorAll('[data-company-project-id]').forEach(button => {
    button.addEventListener('click', () => {
      const opportunity = state.feed.opportunities.find(
        item => item.opportunity_id === button.dataset.companyProjectId
      );
      if (opportunity) renderDetail(opportunity);
    });
  });
}

function renderDashboard(account = state.customerAccount) {
  const rows = filteredOpportunities();

  const projectTypes = [
    ...new Set(state.feed.opportunities.map(row => row.project_type).filter(Boolean))
  ];

  const projectScales = [
    ...new Set(state.feed.opportunities.map(row => row.project_scale).filter(Boolean))
  ];

  app.innerHTML = `
    ${paymentPanel(account?.subscription_status || 'INACTIVE')}

    <section class="profile-editor-card">
      <h2>Your business profile</h2>
      <p class="muted">
        Select the trades and services your company provides.
        These selections personalize project relevance.
      </p>

      <form id="business-profile-form">
        <fieldset>
          <legend>Business trades</legend>
          ${[
            ['GENERAL_CONTRACTING', 'General contracting'],
            ['ELECTRICAL', 'Electrical'],
            ['PLUMBING', 'Plumbing'],
            ['HVAC', 'HVAC'],
            ['ROOFING', 'Roofing'],
            ['MASONRY', 'Masonry']
          ].map(([value, label]) => `
            <label class="profile-option">
              <input type="checkbox" name="business-trade"
                value="${value}"
                ${(account?.business_trades || []).includes(value) ? 'checked' : ''}>
              ${label}
            </label>
          `).join('')}
        </fieldset>

        <fieldset>
          <legend>Services provided</legend>
          ${[
            ['COMMERCIAL_INSTALLATION', 'Commercial installation'],
            ['REPAIR_MAINTENANCE', 'Repair and maintenance'],
            ['RENOVATIONS', 'Renovations'],
            ['NEW_CONSTRUCTION', 'New construction'],
            ['SERVICE_UPGRADES', 'Service upgrades'],
            ['TENANT_BUILDOUTS', 'Tenant buildouts']
          ].map(([value, label]) => `
            <label class="profile-option">
              <input type="checkbox" name="business-service"
                value="${value}"
                ${(account?.business_services || []).includes(value) ? 'checked' : ''}>
              ${label}
            </label>
          `).join('')}
        </fieldset>

        <p id="profile-save-message" class="auth-message" role="status"></p>
        <button id="save-business-profile" type="submit">
          Save business profile
        </button>
      </form>
    </section>

    ${contactResearchWorkspaceMarkup()}

    <section class="summary-grid">
      <button class="summary-card ${state.view === 'relevant' ? 'active' : ''}" data-view="relevant">
        <strong>${state.feed.opportunities.filter(opportunity => (opportunity.trade_relevance?.assessments || []).length > 0).length}</strong>
        <span>Relevant to your trades</span>
      </button>

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

        <label>
          Sales status
          <select id="sales-status-filter">
            <option value="ALL">All sales statuses</option>
            ${SALES_STATUSES.map(status => `
              <option value="${escapeHtml(status)}"
                ${state.salesStatusFilter === status ? 'selected' : ''}>
                ${escapeHtml(status)}
              </option>
            `).join('')}
          </select>
        </label>

        <label>
          Follow-up
          <select id="follow-up-filter">
            <option value="ALL" ${state.followUpFilter === 'ALL' ? 'selected' : ''}>All projects</option>
            <option value="UPCOMING" ${state.followUpFilter === 'UPCOMING' ? 'selected' : ''}>Due today or later</option>
            <option value="OVERDUE" ${state.followUpFilter === 'OVERDUE' ? 'selected' : ''}>Overdue</option>
            <option value="NONE" ${state.followUpFilter === 'NONE' ? 'selected' : ''}>No date set</option>
          </select>
        </label>
      </div>
    </section>

    <section class="results-header">
      <div>
        <p class="eyebrow">OPPORTUNITIES</p>
        <h2>${rows.length} matching projects</h2>
        <p class="sales-followup-count">
          ${state.feed.opportunities.filter(opportunity => {
            const date = salesActivityFor(opportunity).followUpDate;
            return date && date >= localDateKey();
          }).length} projects with follow-ups due today or later
        </p>
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


const SALES_STATUSES = [
  'New',
  'Researching',
  'Contact identified',
  'Contacted',
  'Follow-up required',
  'Quoted',
  'Won',
  'Lost',
  'Not relevant'
];

function salesTrackingMarkup(opportunity) {
  const activity = state.salesActivity[opportunity.opportunity_id] || {
    status: 'New',
    notes: '',
    followUpDate: '',
    updatedAt: ''
  };

  const options = SALES_STATUSES.map(status => `
    <option value="${escapeHtml(status)}"
      ${activity.status === status ? 'selected' : ''}>
      ${escapeHtml(status)}
    </option>
  `).join('');

  return `
    <section class="sales-tracker detail-section">
      <h3>My sales activity</h3>
      <p class="sales-tracker-note">
        ${escapeHtml(state.salesPersistenceMessage)}
      </p>

      <label for="sales-status">Sales status</label>
      <select id="sales-status">${options}</select>

      <label for="sales-notes">Private notes</label>
      <textarea id="sales-notes" rows="4"
        placeholder="Research, contact attempts, conversation notes…">${escapeHtml(activity.notes)}</textarea>

      <label for="sales-follow-up">Next follow-up date</label>
      <input id="sales-follow-up" type="date"
        value="${escapeHtml(activity.followUpDate)}">

      <div class="sales-tracker-footer">
        <button id="save-sales-activity" type="button">
          Save sales activity
        </button>
        <span id="sales-save-message" role="status" aria-live="polite">
          ${activity.updatedAt
            ? `Saved in this session at ${escapeHtml(new Date(activity.updatedAt).toLocaleTimeString())}`
            : 'Not saved yet'}
        </span>
      </div>
    </section>
  `;
}

function scrollAppToTop() {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  app.scrollTop = 0;
}

function renderDetail(opportunity, resetScroll = true) {
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

      ${tradeRelevanceMarkup(opportunity)}
      ${recommendedNextActionMarkup(opportunity)}

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

      ${contactIntelligenceMarkup(opportunity)}

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
                        signal.details ||
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

      ${salesTrackingMarkup(opportunity)}

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

  if (resetScroll) scrollAppToTop();

  app.querySelectorAll('[data-company-name]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      openCompanyResearch(button.dataset.companyName);
    });
  });

  document.getElementById('back-button').addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();

    if (state.detailHistoryActive) {
      window.history.back();
    } else {
      returnToDashboardFromDetail();
    }
  });

  const saveSalesButton = document.getElementById('save-sales-activity');

  if (saveSalesButton) {
    saveSalesButton.addEventListener('click', async () => {
      const status = document.getElementById('sales-status').value;
      const notes = document.getElementById('sales-notes').value;
      const followUpDate = document.getElementById('sales-follow-up').value;
      const message = document.getElementById('sales-save-message');

      if (!SALES_STATUSES.includes(status)) {
        message.textContent = 'Please choose a valid sales status.';
        return;
      }

      const activity = {
        status,
        notes,
        followUpDate,
        updatedAt: new Date().toISOString()
      };

      const previousText = saveSalesButton.textContent;
      saveSalesButton.disabled = true;
      saveSalesButton.textContent = 'Saving…';

      try {
        if (state.salesPersistenceAvailable) {
          const customerOpportunityId =
            opportunity.customer_opportunity_row_id;

          if (!customerOpportunityId) {
            throw new Error('This project is missing its customer-specific database ID.');
          }

          const { error } = await supabaseClient
            .from('customer_sales_activity')
            .upsert({
              customer_opportunity_id: customerOpportunityId,
              status,
              notes,
              follow_up_date: followUpDate || null,
              updated_at: activity.updatedAt
            }, {
              onConflict: 'customer_opportunity_id'
            });

          if (error) throw error;

          state.salesActivity[opportunity.opportunity_id] = activity;
          state.salesPersistenceMessage = 'Sales activity is saved to your account.';
        } else {
          state.salesActivity[opportunity.opportunity_id] = activity;
          state.salesPersistenceMessage =
            'Sales activity is currently saved in this browser session only.';
        }

        renderDetail(opportunity, false);
        const updatedMessage = document.getElementById('sales-save-message');
        if (updatedMessage) {
          updatedMessage.textContent = state.salesPersistenceAvailable
            ? 'Saved to your account.'
            : 'Saved in this browser session only.';
        }
      } catch (error) {
        console.error('Sales activity save failed:', error);
        message.textContent =
          error.message || 'Unable to save sales activity.';
        saveSalesButton.disabled = false;
        saveSalesButton.textContent = previousText;
      }
    });
  }

}

function bindDashboardEvents() {
  document.querySelectorAll('[data-company-name]').forEach(button => {
    button.addEventListener('click', () => {
      openCompanyResearch(button.dataset.companyName);
    });
  });




  const researchSearch = document.getElementById('research-company-search');
  const researchRole = document.getElementById('research-role-filter');
  const researchStatus = document.getElementById('research-status-filter');
  const researchTier = document.getElementById('research-tier-filter');
  const researchAttention = document.getElementById('research-attention-filter');
  const researchReadiness = document.getElementById('research-readiness-filter');
  const researchVerification = document.getElementById('research-verification-filter');

  if (researchSearch && researchRole && researchStatus && researchTier && researchAttention && researchReadiness && researchVerification) {
    const applyResearchFilters = () => {
      const query = researchSearch.value.trim().toLowerCase();
      const role = researchRole.value;
      const status = researchStatus.value;
      const tier = researchTier.value;
      const attention = researchAttention.value;
      const readiness = researchReadiness.value;
      const verification = researchVerification.value;

      const rows = [...document.querySelectorAll('#research-company-rows tr')];
      let visible = 0;

      rows.forEach(row => {
        const matches =
          row.dataset.company.toLowerCase().includes(query) &&
          (role === 'ALL' || row.dataset.category === role) &&
          (status === 'ALL' || row.dataset.researchStatus === status) &&
          (tier === 'ALL' || row.dataset.tier === tier) &&
          (attention === 'ALL' || row.dataset.attentionNeeded === 'true') &&
          (readiness === 'ALL' || row.dataset.readiness === readiness) &&
          (verification === 'ALL' ||
            (verification === 'NEEDS_VERIFICATION' && row.dataset.verificationNeeded === 'true') ||
            (verification === 'NO_PENDING_VERIFICATION' && row.dataset.verificationNeeded === 'false'));

        row.hidden = !matches;
        if (matches) visible += 1;
      });

      const count = document.getElementById('research-filter-count');
      if (count) {
        count.textContent = `Showing ${visible} of ${rows.length} companies`;
      }
    };

    researchSearch.addEventListener('input', applyResearchFilters);
    researchRole.addEventListener('change', applyResearchFilters);
    researchStatus.addEventListener('change', applyResearchFilters);
    researchTier.addEventListener('change', applyResearchFilters);
    researchAttention.addEventListener('change', applyResearchFilters);
    researchReadiness.addEventListener('change', applyResearchFilters);
    researchVerification.addEventListener('change', applyResearchFilters);
  }


  const profileForm = document.getElementById('business-profile-form');

  if (profileForm) {
    profileForm.addEventListener('submit', async event => {
      event.preventDefault();

      const saveButton = document.getElementById('save-business-profile');
      const message = document.getElementById('profile-save-message');

      const businessTrades = [
        ...profileForm.querySelectorAll(
          'input[name="business-trade"]:checked'
        )
      ].map(input => input.value);

      const businessServices = [
        ...profileForm.querySelectorAll(
          'input[name="business-service"]:checked'
        )
      ].map(input => input.value);

      saveButton.disabled = true;
      saveButton.textContent = 'Saving…';
      message.textContent = '';

      try {
        const {
          data: { user },
          error: userError
        } = await supabaseClient.auth.getUser();

        if (userError) throw userError;
        if (!user) throw new Error('Please sign in again.');

        const { data, error } = await supabaseClient
          .from('customer_accounts')
          .update({
            business_trades: businessTrades,
            business_services: businessServices
          })
          .eq('auth_user_id', user.id)
          .select('id, customer_id, company_name, business_trades, business_services, subscription_status')
          .maybeSingle();

        if (error) throw error;
        if (!data) {
          throw new Error(
            'Profile was not updated. Check your account permissions.'
          );
        }

        state.customerAccount = data;
        message.textContent = 'Profile saved. Refreshing your opportunities…';

        await loadFeed();
        renderDashboard(data);
      } catch (error) {
        console.error('Business profile save failed:', error);
        message.textContent =
          error.message || 'Unable to save your business profile.';
        saveButton.disabled = false;
        saveButton.textContent = 'Save business profile';
      }
    });
  }

  const dashboardSignout = document.getElementById('dashboard-signout');

  if (dashboardSignout) {
    dashboardSignout.addEventListener('click', async () => {
      dashboardSignout.disabled = true;
      dashboardSignout.textContent = 'Signing out…';

      const { error } = await supabaseClient.auth.signOut();

      if (error) {
        dashboardSignout.disabled = false;
        dashboardSignout.textContent = 'Sign out';
        throw error;
      }
    });
  }
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
        state.dashboardScrollY = window.scrollY;
        state.dashboardOpportunityId = opportunity.opportunity_id;
        state.detailHistoryActive = true;

        window.history.pushState(
          { ...(window.history.state || {}), chicagoIntelDetail: true },
          ''
        );

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

  const salesStatusFilter = document.getElementById('sales-status-filter');
  const followUpFilter = document.getElementById('follow-up-filter');

  salesStatusFilter.addEventListener('change', event => {
    state.salesStatusFilter = event.target.value;
    renderDashboard();
  });

  followUpFilter.addEventListener('change', event => {
    state.followUpFilter = event.target.value;
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
    .select('id, customer_id, company_name, business_trades, business_services')
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
    // Fetch all participant rows in stable, bounded pages.
    const pageSize = 500;
    let offset = 0;

    while (true) {
      const {
        data: companies,
        error: companyError
      } = await supabaseClient
        .from('customer_opportunity_companies')
        .select(
          'customer_opportunity_id, company_name, role, permit_id, city, state, zipcode'
        )
        .in('customer_opportunity_id', opportunityIds)
        .order('customer_opportunity_id')
        .order('permit_id')
        .order('company_name')
        .order('role')
        .range(offset, offset + pageSize - 1);

      if (companyError) throw companyError;

      const page = companies ?? [];
      companyRows.push(...page);

      if (page.length < pageSize) break;
      offset += pageSize;
    }

    const {
      data: signals,
      error: signalError
    } = await supabaseClient
      .from('customer_opportunity_signals')
      .select(
        'customer_opportunity_id, type, observed_at, details'
      )
      .in('customer_opportunity_id', opportunityIds);

    if (signalError) throw signalError;

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
      customer_opportunity_row_id: row.id,
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
      trade_relevance:
        window.ChicagoIntelTradeRelevance.assessTradeRelevance(
          {
            work_description: row.work_description,
            participating_companies:
              companiesByOpportunity.get(row.id) ?? []
          },
          {
            business_trades: account.business_trades ?? [],
            business_services: account.business_services ?? []
          }
        ),
      signals:
        signalsByOpportunity.get(row.id) ?? [],
      provenance: {
        source: row.source,
        permit_id: row.permit_id,
        observed_at: row.observed_at
      }
    }))
  };

  // Load private sales activity only when the optional table is installed.
  state.salesPersistenceAvailable = false;
  state.salesPersistenceMessage =
    'Sales activity is currently saved in this browser session only.';

  if (opportunityIds.length > 0) {
    const { data: activityRows, error: activityError } = await supabaseClient
      .from('customer_sales_activity')
      .select('customer_opportunity_id, status, notes, follow_up_date, updated_at')
      .in('customer_opportunity_id', opportunityIds);

    if (activityError) {
      const missingTable =
        activityError.code === '42P01' ||
        activityError.code === 'PGRST205' ||
        /customer_sales_activity.*(not found|does not exist)|schema cache/i.test(activityError.message || '');

      if (!missingTable) {
        throw activityError;
      }

      state.salesPersistenceMessage =
        'Sales activity is session-only until account storage is enabled.';
    } else {
      state.salesPersistenceAvailable = true;
      state.salesPersistenceMessage =
        'Sales activity is saved to your account.';

      for (const row of activityRows ?? []) {
        const opportunity = opportunityRows.find(
          item => item.id === row.customer_opportunity_id
        );

        if (!opportunity) continue;

        state.salesActivity[opportunity.opportunity_id] = {
          status: row.status,
          notes: row.notes ?? '',
          followUpDate: row.follow_up_date ?? '',
          updatedAt: row.updated_at ?? ''
        };
      }
    }
  }
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
          <legend>Your business trades</legend>

          <label class="checkbox-row">
            <input type="checkbox" name="business-trade" value="GENERAL_CONTRACTING">
            General contracting
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-trade" value="ELECTRICAL">
            Electrical
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-trade" value="PLUMBING">
            Plumbing
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-trade" value="HVAC">
            HVAC
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-trade" value="ROOFING">
            Roofing
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-trade" value="MASONRY">
            Masonry
          </label>
        </fieldset>

        <fieldset>
          <legend>Services your company provides</legend>

          <label class="checkbox-row">
            <input type="checkbox" name="business-service" value="COMMERCIAL_INSTALLATION">
            Commercial installation
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-service" value="REPAIR_MAINTENANCE">
            Repair and maintenance
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-service" value="RENOVATIONS">
            Renovations
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-service" value="NEW_CONSTRUCTION">
            New construction
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-service" value="SERVICE_UPGRADES">
            Service upgrades
          </label>
          <label class="checkbox-row">
            <input type="checkbox" name="business-service" value="TENANT_BUILDOUTS">
            Tenant build-outs
          </label>
        </fieldset>

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

    const businessTrades = checkedValues('business-trade');
    const businessServices = checkedValues('business-service');
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
        business_trades: businessTrades,
        business_services: businessServices,
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


async function startCheckout() {
  const button = document.getElementById('subscribe-button');
  const messageEl = document.getElementById('payment-message');

  if (button) {
    button.disabled = true;
    button.textContent = 'Opening checkout…';
  }

  if (messageEl) {
    messageEl.textContent = '';
  }

  try {
    const { data: sessionData, error: sessionError } =
      await supabaseClient.auth.getSession();

    if (sessionError) throw sessionError;

    if (!sessionData.session) {
      throw new Error('Your session has expired. Please sign in again.');
    }

    const { data, error } = await supabaseClient.functions.invoke(
      'create-checkout-session',
      {
        method: 'POST'
      }
    );

    if (error) {
      console.error('create-checkout-session error:', error);
      console.error('create-checkout-session error context:', {
        name: error?.name,
        message: error?.message,
        context: error?.context,
        status: error?.context?.status,
      });

      let detail = error?.message || 'Unable to start checkout.';

      try {
        if (error?.context && typeof error.context.clone === 'function') {
          const response = error.context.clone();
          const body = await response.text();
          console.error('create-checkout-session response body:', body);

          if (body) {
            detail += ` — ${body}`;
          }
        }
      } catch (diagnosticError) {
        console.error(
          'Unable to read create-checkout-session response body:',
          diagnosticError
        );
      }

      throw new Error(detail);
    }

    if (!data?.url) {
      throw new Error('Checkout did not return a payment URL.');
    }

    window.location.href = data.url;
  } catch (error) {
    if (button) {
      button.disabled = false;
      button.textContent = 'Subscribe — $99/month';
    }

    if (messageEl) {
      messageEl.textContent =
        error?.message || 'Unable to start checkout.';
    }
  }
}

function paymentPanel(subscriptionStatus) {
  const active = subscriptionStatus === 'ACTIVE';

  if (active) {
    return `
      <section class="payment-card payment-active">
        <div>
          <p class="eyebrow">SUBSCRIPTION</p>
          <h2>Chicago Intel is active</h2>
          <p>Your subscription is active and your intelligence feed is available.</p>
        </div>
        <div class="subscription-actions">
          <span class="status-badge">ACTIVE</span>
          <button id="dashboard-signout" type="button" class="secondary-button">
            Sign out
          </button>
        </div>
      </section>
    `;
  }

  return `
    <section class="payment-card">
      <div>
        <p class="eyebrow">SUBSCRIPTION</p>
        <h2>Unlock Chicago Intel</h2>
        <p>
          Get access to your personalized Chicago commercial project intelligence feed.
        </p>
        <strong class="payment-price">$99/month</strong>
        <p id="payment-message" class="auth-message"></p>
      </div>

      <button id="subscribe-button" type="button">
        Subscribe — $99/month
      </button>
    </section>
  `;
}

async function handleAuthenticatedUser(user) {
  const { data, error } = await supabaseClient
    .from('customer_accounts')
    .select('id, customer_id, company_name, business_trades, business_services, subscription_status')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    renderCustomerOnboarding(user);
    return;
  }

  state.customerAccount = data;

  if (data.subscription_status !== 'ACTIVE') {
    app.innerHTML = paymentPanel(data.subscription_status);
  } else {
    await loadFeed();
    renderDashboard(data);
  }

  const subscribeButton = document.getElementById('subscribe-button');

  if (subscribeButton) {
    subscribeButton.addEventListener('click', () => {
      startCheckout();
    });
  }
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
      state.customerAccount = null;
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
