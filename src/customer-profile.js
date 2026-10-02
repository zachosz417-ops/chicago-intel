const fs = require('fs');

const ALLOWED_PROJECT_TYPES = new Set([
  'NEW_CONSTRUCTION',
  'RENOVATION'
]);

const ALLOWED_PROJECT_SCALES = new Set([
  'STANDARD',
  'COMMERCIAL_SCALE',
  'LARGE_SCALE'
]);

const ALLOWED_ALERT_FREQUENCIES = new Set([
  'DAILY',
  'WEEKLY',
  'NONE'
]);

function clean(value) {
  return String(value ?? '').trim();
}

function normalizeList(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map(clean).filter(Boolean))];
}

function validateCustomerConfig(config) {
  if (!config || typeof config !== 'object') {
    throw new Error('Customer configuration must be an object');
  }

  const customerId = clean(config.customer_id);

  if (!customerId) {
    throw new Error('Customer configuration requires customer_id');
  }

  const targetRoles = normalizeList(config.target_roles);
  const targetProjectTypes = normalizeList(config.target_project_types);
  const targetScales = normalizeList(config.target_scales);

  for (const value of targetProjectTypes) {
    if (!ALLOWED_PROJECT_TYPES.has(value)) {
      throw new Error(`Unsupported target_project_type: ${value}`);
    }
  }

  for (const value of targetScales) {
    if (!ALLOWED_PROJECT_SCALES.has(value)) {
      throw new Error(`Unsupported target_scale: ${value}`);
    }
  }

  const geography = config.geography || {};

  if (typeof geography !== 'object' || Array.isArray(geography)) {
    throw new Error('geography must be an object');
  }

  const wards = normalizeList(geography.wards);
  const communityAreas = normalizeList(geography.community_areas);

  const alertFrequency = clean(config.alert_frequency || 'DAILY');

  if (!ALLOWED_ALERT_FREQUENCIES.has(alertFrequency)) {
    throw new Error(`Unsupported alert_frequency: ${alertFrequency}`);
  }

  return {
    customer_id: customerId,
    company_name: clean(config.company_name),
    target_roles: targetRoles,
    target_project_types: targetProjectTypes,
    target_scales: targetScales,
    geography: {
      wards,
      community_areas: communityAreas
    },
    alert_frequency: alertFrequency
  };
}

function matchesList(value, targets) {
  return targets.length === 0 || targets.includes(clean(value));
}

function matchesGeography(opportunity, geography) {
  const {
    wards = [],
    community_areas: communityAreas = []
  } = geography;

  if (
    wards.length === 0 &&
    communityAreas.length === 0
  ) {
    return true;
  }

  const location = opportunity.location || {};

  const wardMatch =
    wards.length === 0 ||
    wards.includes(clean(location.ward));

  const communityAreaMatch =
    communityAreas.length === 0 ||
    communityAreas.includes(clean(location.community_area));

  return wardMatch && communityAreaMatch;
}

function matchingRoles(opportunity, targetRoles) {
  const companies = opportunity.participating_companies || [];

  if (targetRoles.length === 0) {
    return companies;
  }

  return companies.filter(company =>
    targetRoles.includes(clean(company.role))
  );
}

function matchesOpportunity(opportunity, config) {
  if (!matchesList(opportunity.project_type, config.target_project_types)) {
    return false;
  }

  if (!matchesList(opportunity.project_scale, config.target_scales)) {
    return false;
  }

  if (matchingRoles(opportunity, config.target_roles).length === 0) {
    return false;
  }

  if (!matchesGeography(opportunity, config.geography)) {
    return false;
  }

  return true;
}

function filterFeed(feed, rawConfig) {
  if (!feed || typeof feed !== 'object') {
    throw new Error('Customer feed must be an object');
  }

  if (!Array.isArray(feed.opportunities)) {
    throw new Error('Customer feed requires opportunities[]');
  }

  const config = validateCustomerConfig(rawConfig);

  const opportunities = feed.opportunities
    .filter(opportunity => matchesOpportunity(opportunity, config))
    .map(opportunity => ({
      ...opportunity,
      participating_companies: matchingRoles(
        opportunity,
        config.target_roles
      )
    }));

  const newOpportunities = opportunities.filter(opportunity =>
    (opportunity.signals || []).some(
      signal => signal.type === 'NEW_OPPORTUNITY'
    )
  ).length;

  const changedOpportunities = opportunities.filter(opportunity =>
    (opportunity.signals || []).some(signal =>
      [
        'STATUS_CHANGE',
        'MILESTONE_CHANGE',
        'COST_CHANGE',
        'DESCRIPTION_CHANGE',
        'PARTICIPANT_CHANGE'
      ].includes(signal.type)
    )
  ).length;

  return {
    schema_version: feed.schema_version,
    generated_at: feed.generated_at,
    source: feed.source,
    customer_id: config.customer_id,
    customer_config: config,
    summary: {
      opportunities: opportunities.length,
      new_opportunities: newOpportunities,
      changed_opportunities: changedOpportunities
    },
    opportunities
  };
}

function loadFeed(feedPath) {
  const raw = fs.readFileSync(feedPath, 'utf8');
  return JSON.parse(raw);
}

module.exports = {
  validateCustomerConfig,
  filterFeed,
  loadFeed
};
