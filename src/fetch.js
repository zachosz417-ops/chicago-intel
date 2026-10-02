const fs = require('fs');
const path = require('path');

const BASE_URL =
  'https://data.cityofchicago.org/resource/ydr8-5enu.json';

const OUTPUT = path.join(
  __dirname,
  '..',
  'data',
  'raw',
  'permits.json'
);

const OVERLAP_DAYS = 7;
const LIMIT = 5000;

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function buildUrl() {
  const now = new Date();

  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - OVERLAP_DAYS);

  const startDate = formatDate(start);
  const endDate = formatDate(now);

  const params = new URLSearchParams({
    '$where':
      `issue_date >= '${startDate}T00:00:00' AND ` +
      `issue_date < '${endDate}T00:00:00'`,
    '$order': 'issue_date DESC',
    '$limit': String(LIMIT)
  });

  return {
    url: `${BASE_URL}?${params}`,
    startDate,
    endDate
  };
}

async function main() {
  const {
    url,
    startDate,
    endDate
  } = buildUrl();

  console.log('Fetching Chicago building permits...');
  console.log(`Issue-date window: ${startDate} through ${endDate}`);
  console.log(`Maximum records: ${LIMIT}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Chicago API returned HTTP ${response.status}`
    );
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    throw new Error('Chicago API response was not an array');
  }

  if (data.length === 0) {
    throw new Error(
      'Chicago API returned zero records; refusing to replace raw data'
    );
  }

  const missingPermitIds = data.filter(
    permit => !permit || !permit.permit_
  ).length;

  if (missingPermitIds > 0) {
    throw new Error(
      `Chicago API returned ${missingPermitIds} records without permit_`
    );
  }

  const seen = new Set();
  const deduped = [];

  for (const permit of data) {
    const permitId = String(permit.permit_);

    if (seen.has(permitId)) continue;

    seen.add(permitId);
    deduped.push(permit);
  }

  const dates = deduped
    .map(p => p.issue_date)
    .filter(Boolean)
    .sort();

  if (!dates.length) {
    throw new Error(
      'Chicago API response contains no issue_date values'
    );
  }

  fs.writeFileSync(
    OUTPUT,
    JSON.stringify(deduped, null, 2)
  );

  console.log(`Downloaded ${data.length} records.`);
  console.log(`Unique permit records: ${deduped.length}`);
  console.log(`Oldest issue_date: ${dates[0]}`);
  console.log(`Newest issue_date: ${dates.at(-1)}`);
  console.log(`Saved to ${OUTPUT}`);
}

main().catch(error => {
  console.error('');
  console.error('FETCH FAILED');
  console.error(error.message);
  process.exit(1);
});
