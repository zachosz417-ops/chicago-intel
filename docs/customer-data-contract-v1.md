# Chicago-Intel Customer Data Contract v1

**Status:** Phase A — Productization  
**Version:** 1.0.0  
**Purpose:** Define the stable data boundary between Chicago-Intel's internal intelligence system and customer-facing applications.

---

## 1. Design Principle

The customer product consumes a dedicated customer feed.

It does **not** directly consume internal intelligence, scoring, monitoring fingerprints, search queries, or raw research artifacts.

Architecture:

    Chicago Building Permits
            ↓
    Frozen Intelligence Foundation
            ↓
    Discovery + Persistent Monitoring
            ↓
    Customer Feed
            ↓
    PWA / Email Alerts

---

## 2. Opportunity Record

Each customer-facing opportunity represents a qualifying construction opportunity derived from authoritative Chicago Building Permits data.

### Required fields

| Field | Type | Customer meaning |
|---|---|---|
| `opportunity_id` | string | Stable customer-facing opportunity identifier |
| `permit_id` | string | Chicago Building Permit identifier |
| `address` | string | Project address |
| `project_type` | enum | `NEW_CONSTRUCTION` or `RENOVATION` |
| `project_scale` | enum | `STANDARD`, `COMMERCIAL_SCALE`, or `LARGE_SCALE` |
| `permit_stage` | enum | Current permit stage |
| `issue_date` | ISO date | Permit issue date |
| `reported_cost` | number/null | Cost reported on the permit |
| `work_description` | string/null | Permit work description |
| `discovery_class` | enum | `CORE_PROJECT` or `SUPPORT_OR_SPECIAL_PURPOSE` |
| `source` | string | `CHICAGO_BUILDING_PERMITS` |
| `observed_at` | ISO timestamp | Last observation represented in the feed |

### Cost terminology

The customer interface MUST display:

> **Reported permit cost**

It MUST NOT describe this field as:

- contract value
- awarded value
- customer spend
- contractor revenue
- company backlog

The reported permit cost is a project-size signal, not proof of the participating company's contract value.

---

## 3. Participating Company Record

Each opportunity may contain one or more authoritative permit-listed participants.

`participating_companies[]`

Each record contains:

| Field | Type |
|---|---|
| `company_name` | string |
| `role` | string |
| `permit_id` | string |

Where available, location may also be included:

| Field | Type |
|---|---|
| `city` | string/null |
| `state` | string/null |
| `zipcode` | string/null |

### Interpretation

A participating company means the company is identified in the authoritative Chicago Building Permit data for the project.

The product MUST NOT state or imply that the company:

- won the project
- holds the entire project contract
- controls the project
- is currently seeking subcontractors
- is currently seeking vendors
- is the decision-maker

unless separate evidence explicitly establishes that fact.

---

## 4. Opportunity Signals

The customer feed may expose human-readable signals derived from persistent monitoring.

Supported signal types:

- `NEW_OPPORTUNITY`
- `STATUS_CHANGE`
- `MILESTONE_CHANGE`
- `COST_CHANGE`
- `DESCRIPTION_CHANGE`
- `PARTICIPANT_CHANGE`

A signal contains:

| Field | Type |
|---|---|
| `signal_id` | string |
| `type` | enum |
| `detected_at` | ISO timestamp |
| `description` | string |

Example:

    {
      "signal_id": "SIG-000001",
      "type": "STATUS_CHANGE",
      "detected_at": "2026-09-30T12:00:00.000Z",
      "description": "Permit status changed from ACTIVE to CLOSED."
    }

### Internal monitoring fields

The following MUST remain internal:

- state fingerprints
- raw fingerprint JSON
- internal comparison structures
- API batch information
- monitor miss diagnostics
- internal polling mechanics

---

## 5. Provenance

Every customer-facing opportunity must retain source provenance.

    provenance
    ├── source
    ├── permit_id
    └── observed_at

Example:

    {
      "source": "CHICAGO_BUILDING_PERMITS",
      "permit_id": "101088981",
      "observed_at": "2026-09-30T11:24:07.403Z"
    }

The PWA should provide a visible source/provenance section.

---

## 6. Customer Configuration

Customer-specific filtering will eventually be represented by:

    customer
    ├── customer_id
    ├── company_name
    ├── target_roles[]
    ├── target_project_types[]
    ├── target_scales[]
    ├── geography
    └── alert_frequency

### Project geography

Customer geography refers to the **project location**, derived from the authoritative
Chicago Building Permit record. It does not use the mailing address of a participating
company.

The current geography configuration supports:

- `wards[]` — Chicago ward numbers
- `community_areas[]` — Chicago community area numbers

An empty list means that dimension is not restricted. If both lists are empty,
geography does not filter the opportunity.

Example:

    {
      "customer_id": "demo-001",
      "company_name": "Example Electrical Contractor",
      "target_roles": [
        "CONTRACTOR-ELECTRICAL"
      ],
      "target_project_types": [
        "NEW_CONSTRUCTION",
        "RENOVATION"
      ],
      "target_scales": [
        "COMMERCIAL_SCALE",
        "LARGE_SCALE"
      ],
      "geography": {
        "wards": [
          "22",
          "25"
        ],
        "community_areas": []
      },
      "alert_frequency": "DAILY"
    }

---

## 7. Internal Intelligence Exclusions

The following are NOT part of Customer Data Contract v1.

### Internal scoring

Do not expose:

- internal project score
- internal priority
- ranking formulas
- candidate ranking
- internal qualification scores

### Search-derived people

Decision-maker candidates are not customer-confirmed project contacts.

The customer feed MUST NOT present a search-derived person as:

- confirmed project decision-maker
- project executive for this specific project
- confirmed sales contact
- confirmed buyer

unless future evidence explicitly establishes that relationship.

### Raw research artifacts

Do not expose by default:

- search queries
- search snippets
- internal evidence-ranking fields
- internal source-quality mechanics
- research queue data
- internal candidate classifications

---

## 8. Customer Feed Contract

The customer feed should eventually have this structure:

    {
      "schema_version": "1.0.0",
      "generated_at": "ISO-8601 timestamp",
      "source": "CHICAGO_INTEL_CUSTOMER_FEED",
      "summary": {
        "opportunities": 0,
        "new_opportunities": 0,
        "changed_opportunities": 0
      },
      "opportunities": [
        {
          "opportunity_id": "string",
          "permit_id": "string",
          "address": "string",
          "project_type": "string",
          "project_scale": "string",
          "permit_stage": "string",
          "issue_date": "ISO date",
          "reported_cost": null,
          "work_description": null,
          "discovery_class": "string",
          "participating_companies": [],
          "signals": [],
          "provenance": {
            "source": "CHICAGO_BUILDING_PERMITS",
            "permit_id": "string",
            "observed_at": "ISO timestamp"
          }
        }
      ]
    }

---

## 9. Product Presentation Rules

The PWA should make the following distinctions obvious.

### Authoritative

Information directly derived from Chicago Building Permits.

### Derived

Human-readable signals calculated from authoritative data and persistent monitoring.

### Excluded

Unsupported conclusions about project ownership, contract awards, decision-makers, purchasing intent, or willingness to buy.

---

## 10. Versioning Rule

Changes to this contract require a version change.

- Patch: wording/documentation clarification with no structural change.
- Minor: backward-compatible field addition.
- Major: field removal, semantic change, or incompatible structure change.

Current version:

`1.0.0`

---

## 11. Product Boundary

The customer-facing product is intended to answer:

> "Which Chicago construction opportunities involving companies in my target market should I pay attention to, and what has changed?"

It is not intended to claim:

> "Who is definitely buying?"

or:

> "Who definitely controls this project?"

Those questions require additional evidence beyond the authoritative permit data.
