import { ProductsService } from '../src/products.service';

const store = new Map<string, any>();

jest.mock('@ecommerce/db', () => ({
  Repository: class {
    async put(item: any) {
      store.set(`${item.PK}|${item.SK}`, item);
      return item;
    }
    async get(pk: string, sk: string) {
      return store.get(`${pk}|${sk}`) || null;
    }
    async delete(pk: string, sk: string) {
      store.delete(`${pk}|${sk}`);
    }
    async query({ IndexName }: any) {
      const all = Array.from(store.values());
      if (IndexName === 'GSI1') return all.filter((i) => i.GSI1PK);
      return all;
    }
    async scan() {
      return Array.from(store.values());
    }
    async update(pk: string, sk: string, _ue: string, names: any, values: any) {
      const item = { ...store.get(`${pk}|${sk}`) };
      for (const [k, v] of Object.entries(values)) {
        const key = k.replace(':', '');
        const nameKey = Object.keys(names).find((n) => names[n] === key || n === `#${key}`);
        const field = nameKey ? names[nameKey].replace?.('#', '') || names[nameKey] : key;
        const clean = typeof field === 'string' ? field.replace(/^#/, '') : key;
        item[clean] = v;
      }
      // simpler merge for tests
      if (values[':stock'] !== undefined) item.stock = values[':stock'];
      if (values[':updatedAt']) item.updatedAt = values[':updatedAt'];
      if (values[':name']) item.name = values[':name'];
      store.set(`${pk}|${sk}`, item);
      return item;
    }
  },
}));

jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://upload.example'),
}));
jest.mock('@aws-sdk/client-s3', () => ({
  S3Client: class {},
  PutObjectCommand: class {},
}));

describe('ProductsService', () => {
  const svc = new ProductsService();

  beforeEach(() => store.clear());

  it('creates, lists, updates, removes', async () => {
    const p = await svc.create({ name: 'Widget', price: 5, stock: 10, category: 'gadgets' });
    expect(p.stock).toBe(10);
    const listed = await svc.list();
    expect(listed.length).toBe(1);
    const byCat = await svc.list('gadgets');
    expect(byCat.length).toBe(1);
    const updated = await svc.update(p.productId, { name: 'Widget2' });
    expect(updated.name).toBe('Widget2');
    await svc.decrementStock(p.productId, 3);
    const got = await svc.get(p.productId);
    expect(got.stock).toBe(7);
    const url = await svc.createUploadUrl(p.productId, 'image/png');
    expect(url.uploadUrl).toContain('https://');
    await svc.remove(p.productId);
    await expect(svc.get(p.productId)).rejects.toMatchObject({ statusCode: 404 });
  });
});
