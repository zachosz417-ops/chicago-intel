const TRADE_RULES = {
  ELECTRICAL: {
    descriptionTerms: [
      'electrical', 'wiring', 'electrical panel',
      'service upgrade', 'generator installation',
      'generator replacement', 'lighting installation',
      'lighting replacement'
    ],
    participantTerms: ['ELECTRICAL']
  },
  PLUMBING: {
    descriptionTerms: [
      'plumbing', 'water line', 'sewer line',
      'pipe installation', 'pipe replacement', 'pipe repair',
      'piping', 'drain installation', 'drain replacement',
      'drain repair', 'plumbing fixture', 'sprinkler system'
    ],
    participantTerms: ['PLUMB', 'PIPE', 'SPRINKLER']
  },
  HVAC: {
    descriptionTerms: [
      'hvac', 'heating system', 'cooling system',
      'ventilation', 'air conditioning', 'ductwork',
      'refrigeration', 'mechanical system',
      'mechanical equipment', 'mechanical work'
    ],
    participantTerms: ['VENTILATION', 'MECHANICAL', 'REFRIGERATION', 'HVAC']
  },
  GENERAL_CONTRACTING: {
    descriptionTerms: [
      'new construction', 'buildout', 'build-out',
      'addition', 'renovation', 'alteration',
      'interior remodel', 'tenant improvement'
    ],
    participantTerms: ['GENERAL CONTRACTOR']
  },
  ROOFING: {
    descriptionTerms: [
      'roofing', 'reroof', 're-roof',
      'roof replacement', 'roof repair',
      , 'roofing work',
      'roof coating', 'roof restoration', 'roof membrane',
      'roofing membrane', 'roof reconstruction',
      'reconstruction of roof', 'replace existing roof',
      'replacement of existing roof'
    ],
    participantTerms: ['ROOF']
  },
  MASONRY: {
    descriptionTerms: [
      'masonry work', 'masonry repair', 'masonry restoration',
      'masonry stack reconstruction', 'reconstruction of masonry stack',
      'remove existing face brick', 'replacing with new face brick',
      'replacement of lintels', 'replace existing lintels',
      'brickwork', 'brick repair', 'brick replacement',
      'brick installation', 'block wall construction',
      'block wall repair', 'stonework', 'tuckpoint',
      'tuckpointing', 'repoint', 'repointing'
    ],
    participantTerms: ['MASON']
  }
};

function normalize(value) {
  return String(value ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function includesTerm(text, term) {
  const paddedText = ` ${text} `;
  const needle = ` ${normalize(term)} `;
  const negations = new Set([
    'NO', 'NOT', 'WITHOUT', 'EXCLUDING', 'EXCLUDE', 'EXCEPT'
  ]);

  let index = paddedText.indexOf(needle);

  while (index !== -1) {
    const precedingWords = paddedText
      .slice(0, index)
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(-6);

    if (!precedingWords.some(word => negations.has(word))) {
      return true;
    }

    index = paddedText.indexOf(needle, index + needle.length);
  }

  return false;
}

function assessTradeRelevance(opportunity, customerProfile) {
  const trades = Array.isArray(customerProfile.business_trades)
    ? customerProfile.business_trades
    : [];

  const services = Array.isArray(customerProfile.business_services)
    ? customerProfile.business_services
    : [];

  const description = normalize(opportunity.work_description);

  const companies = Array.isArray(opportunity.participating_companies)
    ? opportunity.participating_companies
    : [];

  const participantRoles = companies.map(company =>
    normalize(company.role)
  );

  const assessments = [];

  for (const trade of trades) {
    const tradeKey = normalize(trade).replaceAll(' ', '_');
    const rule = TRADE_RULES[tradeKey];

    if (!rule) continue;

    const projectEvidence = [];
    const participantContext = [];

    for (const term of rule.descriptionTerms) {
      if (includesTerm(description, term)) {
        projectEvidence.push({
          source: 'PROJECT_DESCRIPTION',
          matched_term: term,
          evidence_level: 'PROJECT_TEXT'
        });
      }
    }

    for (const role of participantRoles) {
      for (const term of rule.participantTerms) {
        if (role.includes(normalize(term))) {
          participantContext.push({
            source: 'PARTICIPANT_ROLE',
            matched_term: term,
            evidence_level: 'REPORTED_PARTICIPANT_CONTEXT'
          });
        }
      }
    }

    if (projectEvidence.length) {
      assessments.push({
        trade,
        relevance: 'POTENTIAL_MATCH',
        evidence: projectEvidence,
        participant_context: participantContext
      });
    }
  }

  return {
    assessments,
    services_considered: services,
    disclaimer:
      'A potential match is based on project-description terms. Listed participants are context only. Neither establishes that work is available, required, or awarded.'
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    assessTradeRelevance,
    TRADE_RULES
  };
}

if (typeof window !== 'undefined') {
  window.ChicagoIntelTradeRelevance = {
    assessTradeRelevance,
    TRADE_RULES
  };
}
