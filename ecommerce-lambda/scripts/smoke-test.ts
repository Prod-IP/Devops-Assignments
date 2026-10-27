/**
 * Post-deploy smoke checks.
 * Usage: API_BASE_URL=https://xxx.execute-api.../dev npm run smoke
 */
const base = process.env.API_BASE_URL || 'http://localhost:3000';

async function check(path: string, init?: RequestInit) {
  const res = await fetch(`${base}${path}`, init);
  if (!res.ok) {
    throw new Error(`${path} → ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

async function main() {
  console.log('Smoke against', base);
  await check('/v1/health');
  console.log('health ok');

  const products = await check('/v1/products');
  console.log('products', Array.isArray(products) ? products.length : products);

  console.log('Smoke passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
