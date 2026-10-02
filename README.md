# Chicago-Intel

Chicago-Intel is a permit-based commercial opportunity discovery system built around authoritative Chicago Building Permits data.

The public product layer turns qualifying permit activity into a customer-facing opportunity feed and mobile-friendly PWA.

## Architecture

The overall system has two layers.

### Private production pipeline

Chicago Building Permits
        |
        v
Permit Fetch
        |
        v
Project Discovery
        |
        v
Persistent Monitoring
        |
        v
Customer Feed
        |
        v
Customer Profile Filtering
        |
        v
PWA Dashboard

The production discovery, monitoring, intelligence, and customer-data generation workflow is maintained separately from the public repository boundary.

### Public product layer

Chicago Building Permits
        |
        v
Customer Feed
        |
        v
Customer Profile Filtering
        |
        v
PWA Dashboard

## Customer Data Boundary

The customer product is based on authoritative permit information.

A participating company means that the company is identified in the Chicago Building Permit record. It does not by itself establish that the company:

- won the project
- controls the project
- holds the entire project contract
- is seeking subcontractors
- is seeking vendors
- is the project decision-maker

Permit cost is displayed as **reported permit cost**. It is a project-size signal and must not be represented as contractor revenue, contract value, awarded value, or company backlog.

See `docs/customer-data-contract-v1.md` for the full customer data contract.

## Public Components

The reusable public product layer includes:

- Chicago permit fetching
- customer-feed generation
- customer-profile validation and filtering
- PWA dashboard
- local PWA development server
- customer data contract
- configuration templates

Private production components such as persistent monitoring, proprietary intelligence, internal reporting, and scheduled production workflows are intentionally outside the public product boundary.

The repository does not contain production customer data, raw permit datasets, private intelligence outputs, credentials, or internal research artifacts.

## Requirements

- Node.js
- npm
- Internet access to the Chicago Data Portal for permit data

The current implementation is designed to run locally and does not require a paid API.

## Installation

    npm install

## Configuration

The repository includes a customer-profile template for local product configuration:

    cp config/customer-profile.example.json config/customer-profile.json

Edit the customer-specific values locally when using the customer-profile filtering layer.

The customer profile is local configuration and is intentionally excluded from version control. The public demo commands do not require a production customer profile or private production data.

## Public Demo Workflow

The public repository provides the reusable application and data-contract components.

Fetch the latest Chicago permit data with:

    npm run fetch

Customer-specific production feeds are generated from the private production data layer and are not included in the public repository.

## Running the PWA Locally

    npm run dev

The local application is served from the `app/` directory.

## PWA

The dashboard is mobile-first and supports:

- opportunity summaries
- new-opportunity filtering
- changed-opportunity filtering
- search
- project-type filtering
- project-scale filtering
- sorting
- project detail views
- participating-company information
- opportunity signals
- source/provenance information
- PWA installation

Production customer data is not included in the public repository.

## Data Source

The system uses the City of Chicago Building Permits dataset available through the Chicago Data Portal.

Source:

https://data.cityofchicago.org/resource/ydr8-5enu.json

## Repository Boundary

This repository intentionally separates the customer product layer from proprietary internal intelligence.

Private/generated material includes:

- raw permit data
- production customer feeds
- internal intelligence records
- external-person research
- decision-maker research
- research evidence
- monitoring state
- customer-specific configuration
- generated reports
- backups
- local environment files

These are excluded through `.gitignore`.

## Status

The reusable customer-product foundation is operational locally.

Remaining production concerns include deployment automation, secure customer-specific hosting, authentication, multi-tenant isolation, notification delivery, billing, and customer demand validation.

## License

No open-source license has been selected yet.
