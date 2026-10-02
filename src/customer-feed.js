const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

const DISCOVERY_FILE = path.join(
  ROOT,
  'data',
  'processed',
  'project-discovery.json'
);

const CHANGE_HISTORY_FILE = path.join(
  ROOT,
  'data',
  'processed',
  'project-discovery-change-history.json'
);

const OUTPUT_FILE = path.join(
  ROOT,
  'data',
  'processed',
  'customer-feed.json'
);

const SCHEMA_VERSION = '1.0.0';
const SOURCE = 'CHICAGO_INTEL_CUSTOMER_FEED';
const AUTHORITATIVE_SOURCE = 'CHICAGO_BUILDING_PERMITS';

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function clean(value) {
  return typeof value === 'string'
    ? value.trim()
    : value == null
      ? ''
      : String(value).trim();
}

function stableOpportunityId(permitId) {
  return `OPP-${clean(permitId)}`;
}

function normalizeContact(contact) {
  return {
    company_name: clean(contact.name) || null,
    role: clean(contact.role) || null,
    permit_id: clean(contact.permit_id) || null,
    city: clean(contact.city) || null,
    state: clean(contact.state) || null,
    zipcode: clean(contact.zipcode) || null
  };
}

function contactKey(contact) {
  return [
    clean(contact.role),
    clean(contact.name),
    clean(contact.city),
    clean(contact.state),
    clean(contact.zipcode)
  ].join('|');
}

function contactsEqual(a, b) {
  const left = (a || []).map(contactKey).sort();
  const right = (b || []).map(contactKey).sort();

  return JSON.stringify(left) === JSON.stringify(right);
}

function signalDescription(type, previous, current) {
  if (type === 'STATUS_CHANGE') {
    return `Permit status changed from "${previous}" to "${current}".`;
  }

  if (type === 'MILESTONE_CHANGE') {
    return `Permit milestone changed from "${previous}" to "${current}".`;
  }

  if (type === 'COST_CHANGE') {
    return `Reported permit cost changed from ${previous} to ${current}.`;
  }

  if (type === 'DESCRIPTION_CHANGE') {
    return 'Permit work description changed.';
  }

  if (type === 'PARTICIPANT_CHANGE') {
    return 'Permit-listed participants changed.';
  }

  return 'Permit information changed.';
}

function buildSignals(event) {
  const previous = event.previous_state || {};
  const current = event.current_state || {};
  const signals = [];

  if (previous.permit_status !== current.permit_status) {
    signals.push({
      type: 'STATUS_CHANGE',
      description: signalDescription(
        'STATUS_CHANGE',
        previous.permit_status || 'unknown',
        current.permit_status || 'unknown'
      )
    });
  }

  if (previous.permit_milestone !== current.permit_milestone) {
    signals.push({
      type: 'MILESTONE_CHANGE',
      description: signalDescription(
        'MILESTONE_CHANGE',
        previous.permit_milestone || 'unknown',
        current.permit_milestone || 'unknown'
      )
    });
  }

  if (previous.reported_cost !== current.reported_cost) {
    signals.push({
      type: 'COST_CHANGE',
      description: signalDescription(
        'COST_CHANGE',
        previous.reported_cost == null
          ? 'not reported'
          : `$${Number(previous.reported_cost).toLocaleString()}`,
        current.reported_cost == null
          ? 'not reported'
          : `$${Number(current.reported_cost).toLocaleString()}`
      )
    });
  }

  if (previous.work_description !== current.work_description) {
    signals.push({
      type: 'DESCRIPTION_CHANGE',
      description: signalDescription(
        'DESCRIPTION_CHANGE',
        '',
        ''
      )
    });
  }

  if (!contactsEqual(
    previous.authoritative_contacts,
    current.authoritative_contacts
  )) {
    signals.push({
      type: 'PARTICIPANT_CHANGE',
      description: signalDescription(
        'PARTICIPANT_CHANGE',
        '',
        ''
      )
    });
  }

  return signals.map((signal, index) => ({
    signal_id: `SIG-${clean(event.permit_id)}-${index + 1}`,
    type: signal.type,
    detected_at: event.detected_at,
    description: signal.description
  }));
}

function buildOpportunity(row, eventMap) {
  const permitId = clean(row.permit_id);

  const participants = (row.authoritative_contacts || [])
    .map(contact => normalizeContact({
      ...contact,
      permit_id: permitId
    }))
    .filter(contact =>
      contact.company_name ||
      contact.role
    );

  const signals = [];

  if (row.observation_status === 'NEW_TO_HISTORY') {
    signals.push({
      signal_id: `SIG-${permitId}-NEW`,
      type: 'NEW_OPPORTUNITY',
      detected_at: row.issue_date || row.observed_at || null,
      description: 'New qualifying opportunity added to the monitored discovery feed.'
    });
  }

  const events = eventMap.get(permitId) || [];

  for (const event of events) {
    signals.push(...buildSignals(event));
  }

  return {
    opportunity_id: stableOpportunityId(permitId),
    permit_id: permitId,
    address: clean(row.address) || null,
    project_type: clean(row.project_type) || null,
    project_scale: clean(row.commercial_scale) || null,
    permit_stage: clean(row.permit_stage) || null,
    issue_date: clean(row.issue_date) || null,
    reported_cost:
      row.reported_cost == null || row.reported_cost === ''
        ? null
        : Number(row.reported_cost),
    work_description: clean(row.work_description) || null,
    discovery_class: clean(row.discovery_class) || null,
    location: {
      latitude:
        row.latitude == null || row.latitude === ''
          ? null
          : Number(row.latitude),
      longitude:
        row.longitude == null || row.longitude === ''
          ? null
          : Number(row.longitude),
      ward: clean(row.ward) || null,
      community_area: clean(row.community_area) || null
    },
    participating_companies: participants,
    signals,
    provenance: {
      source: AUTHORITATIVE_SOURCE,
      permit_id: permitId,
      observed_at: clean(row.issue_date) || null
    }
  };
}

function validateFeed(feed) {
  const errors = [];

  if (feed.schema_version !== SCHEMA_VERSION) {
    errors.push('Invalid schema_version.');
  }

  if (feed.source !== SOURCE) {
    errors.push('Invalid feed source.');
  }

  if (!feed.generated_at) {
    errors.push('Missing generated_at.');
  }

  if (!feed.summary || typeof feed.summary !== 'object') {
    errors.push('Missing summary.');
  }

  if (!Array.isArray(feed.opportunities)) {
    errors.push('opportunities must be an array.');
    return errors;
  }

  const ids = new Set();

  for (const opportunity of feed.opportunities) {
    const required = [
      'opportunity_id',
      'permit_id',
      'address',
      'project_type',
      'project_scale',
      'permit_stage',
      'issue_date',
      'reported_cost',
      'work_description',
      'discovery_class',
      'participating_companies',
      'signals',
      'provenance'
    ];

    for (const field of required) {
      if (!(field in opportunity)) {
        errors.push(
          `${opportunity.opportunity_id || opportunity.permit_id || 'unknown'}: missing ${field}.`
        );
      }
    }

    if (ids.has(opportunity.opportunity_id)) {
      errors.push(
        `Duplicate opportunity_id: ${opportunity.opportunity_id}`
      );
    }

    ids.add(opportunity.opportunity_id);

    if (!Array.isArray(opportunity.participating_companies)) {
      errors.push(
        `${opportunity.opportunity_id}: participating_companies must be an array.`
      );
    }

    if (!Array.isArray(opportunity.signals)) {
      errors.push(
        `${opportunity.opportunity_id}: signals must be an array.`
      );
    }

    if (
      !opportunity.provenance ||
      opportunity.provenance.source !== AUTHORITATIVE_SOURCE ||
      opportunity.provenance.permit_id !== opportunity.permit_id
    ) {
      errors.push(
        `${opportunity.opportunity_id}: invalid provenance.`
      );
    }

    for (const signal of opportunity.signals || []) {
      const allowed = [
        'NEW_OPPORTUNITY',
        'STATUS_CHANGE',
        'MILESTONE_CHANGE',
        'COST_CHANGE',
        'DESCRIPTION_CHANGE',
        'PARTICIPANT_CHANGE'
      ];

      if (!allowed.includes(signal.type)) {
        errors.push(
          `${opportunity.opportunity_id}: invalid signal type ${signal.type}.`
        );
      }
    }
  }

  const newCount = feed.opportunities.filter(opportunity =>
    opportunity.signals.some(signal =>
      signal.type === 'NEW_OPPORTUNITY'
    )
  ).length;

  const changedCount = feed.opportunities.filter(opportunity =>
    opportunity.signals.some(signal =>
      signal.type !== 'NEW_OPPORTUNITY'
    )
  ).length;

  if (feed.summary.opportunities !== feed.opportunities.length) {
    errors.push('summary.opportunities does not match opportunity count.');
  }

  if (feed.summary.new_opportunities !== newCount) {
    errors.push('summary.new_opportunities does not match opportunity count.');
  }

  if (feed.summary.changed_opportunities !== changedCount) {
    errors.push('summary.changed_opportunities does not match opportunity count.');
  }

  return errors;
}

function main() {
  if (!fs.existsSync(DISCOVERY_FILE)) {
    throw new Error(`Missing discovery file: ${DISCOVERY_FILE}`);
  }

  if (!fs.existsSync(CHANGE_HISTORY_FILE)) {
    throw new Error(`Missing change-history file: ${CHANGE_HISTORY_FILE}`);
  }

  const discovery = readJson(DISCOVERY_FILE);
  const changeHistory = readJson(CHANGE_HISTORY_FILE);

  const discoveryRows = Array.isArray(discovery.discovery_permits)
    ? discovery.discovery_permits
    : [];

  const events = Array.isArray(changeHistory.events)
    ? changeHistory.events
    : [];

  const eventMap = new Map();

  for (const event of events) {
    const permitId = clean(event.permit_id);

    if (!permitId) {
      continue;
    }

    if (!eventMap.has(permitId)) {
      eventMap.set(permitId, []);
    }

    eventMap.get(permitId).push(event);
  }

  const opportunities = discoveryRows
    .map(row => buildOpportunity(row, eventMap))
    .sort((a, b) =>
      String(b.issue_date).localeCompare(String(a.issue_date)) ||
      String(a.permit_id).localeCompare(String(b.permit_id))
    );

  const newCount = opportunities.filter(opportunity =>
    opportunity.signals.some(signal =>
      signal.type === 'NEW_OPPORTUNITY'
    )
  ).length;

  const changedCount = opportunities.filter(opportunity =>
    opportunity.signals.some(signal =>
      signal.type !== 'NEW_OPPORTUNITY'
    )
  ).length;

  const feed = {
    schema_version: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    source: SOURCE,
    summary: {
      opportunities: opportunities.length,
      new_opportunities: newCount,
      changed_opportunities: changedCount
    },
    opportunities
  };

  const errors = validateFeed(feed);

  if (errors.length) {
    throw new Error(
      `Customer feed validation failed:\n- ${errors.join('\n- ')}`
    );
  }

  const output = JSON.stringify(feed, null, 2) + '\n';

  const tempFile = `${OUTPUT_FILE}.tmp`;
  fs.writeFileSync(tempFile, output, 'utf8');
  fs.renameSync(tempFile, OUTPUT_FILE);

  console.log(`Created: ${OUTPUT_FILE}`);
  console.log(`Opportunities: ${opportunities.length}`);
  console.log(`New opportunities: ${newCount}`);
  console.log(`Changed opportunities: ${changedCount}`);
  console.log(`Monitor events available: ${events.length}`);
  console.log(`Customer feed validation: PASS`);
}

main();
