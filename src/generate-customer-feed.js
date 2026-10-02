const fs = require('fs');
const path = require('path');

const {
  validateCustomerConfig,
  filterFeed,
  loadFeed
} = require('./customer-profile');

const ROOT = path.join(__dirname, '..');

const SOURCE_FEED = path.join(
  ROOT,
  'data',
  'processed',
  'customer-feed.json'
);

const PROFILE_FILE = path.join(
  ROOT,
  'config',
  'customer-profile.json'
);

const OUTPUT_FILE = path.join(
  ROOT,
  'app',
  'data',
  'customer-feed.json'
);

function writeAtomically(filePath, data) {
  const tempPath = `${filePath}.tmp`;

  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  fs.writeFileSync(
    tempPath,
    JSON.stringify(data, null, 2)
  );

  fs.renameSync(tempPath, filePath);
}

function main() {
  if (!fs.existsSync(SOURCE_FEED)) {
    throw new Error(`Source feed not found: ${SOURCE_FEED}`);
  }

  if (!fs.existsSync(PROFILE_FILE)) {
    throw new Error(`Customer profile not found: ${PROFILE_FILE}`);
  }

  const feed = loadFeed(SOURCE_FEED);

  const rawConfig = JSON.parse(
    fs.readFileSync(PROFILE_FILE, 'utf8')
  );

  const config = validateCustomerConfig(rawConfig);

  const filteredFeed = filterFeed(
    feed,
    config
  );

  writeAtomically(
    OUTPUT_FILE,
    filteredFeed
  );

  console.log('=== CUSTOMER PRODUCT FEED GENERATED ===');
  console.log(`Customer: ${config.customer_id}`);
  console.log(`Source opportunities: ${feed.opportunities.length}`);
  console.log(`Customer opportunities: ${filteredFeed.opportunities.length}`);
  console.log(`New opportunities: ${filteredFeed.summary.new_opportunities}`);
  console.log(`Changed opportunities: ${filteredFeed.summary.changed_opportunities}`);
  console.log(`Output: ${OUTPUT_FILE}`);
}

try {
  main();
} catch (error) {
  console.error('CUSTOMER PRODUCT FEED FAILED');
  console.error(error.message);
  process.exit(1);
}
