import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';

function getConnectionString(): string {
  const v = process.env.DATABASE_URL;
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  throw new Error(
    'Missing DATABASE_URL. Set DATABASE_URL to a PostgreSQL connection string, e.g. postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require',
  );
}

function validateConnectionString(raw: string): void {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      'Invalid database connection string (expected URL). Example: postgresql://USER:PASSWORD@HOST:5432/DB?sslmode=require',
    );
  }

  const protocol = url.protocol.replace(':', '').toLowerCase();
  if (protocol !== 'postgres' && protocol !== 'postgresql') {
    throw new Error(
      `Invalid database protocol "${url.protocol}". Expected "postgres://" or "postgresql://".`,
    );
  }

  if (!url.hostname) {
    throw new Error('Invalid database connection string: missing hostname.');
  }

  const dbName = url.pathname.replace(/^\//, '');
  if (!dbName) {
    throw new Error('Invalid database connection string: missing database name.');
  }
}

function isLocalHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase();
  return (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '::1' ||
    host.endsWith('.local')
  );
}

function parseBooleanEnv(value: string | undefined): boolean | undefined {
  if (value == null) return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'true' || v === '1' || v === 'yes' || v === 'y' || v === 'on') {
    return true;
  }
  if (v === 'false' || v === '0' || v === 'no' || v === 'n' || v === 'off') {
    return false;
  }
  return undefined;
}

function parseIntEnv(
  name: string,
  value: string | undefined,
): number | undefined {
  if (value == null || value.trim().length === 0) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${name}="${value}". Expected a positive integer.`);
  }
  return parsed;
}

function resolveSsl(connectionString: string): PoolConfig['ssl'] {
  const url = new URL(connectionString);

  const querySslMode = url.searchParams.get('sslmode')?.toLowerCase();
  const envSslMode = process.env.PGSSLMODE?.trim().toLowerCase();
  const sslMode = querySslMode ?? envSslMode;

  const forceSsl = parseBooleanEnv(process.env.DATABASE_SSL);
  const rejectUnauthorizedEnv = parseBooleanEnv(
    process.env.PG_SSL_REJECT_UNAUTHORIZED,
  );

  const defaultEnableSsl =
    process.env.NODE_ENV === 'production' && !isLocalHost(url.hostname);

  const enabled =
    forceSsl ??
    (sslMode === 'disable'
        ? false
        : sslMode === 'require' ||
            sslMode === 'verify-ca' ||
            sslMode === 'verify-full'
        ? true
        : defaultEnableSsl);

  if (!enabled) return false;

  const rejectUnauthorized = rejectUnauthorizedEnv ?? true;
  return { rejectUnauthorized };
}

const connectionString = getConnectionString();
validateConnectionString(connectionString);

const poolMax =
  parseIntEnv('PGPOOL_MAX', process.env.PGPOOL_MAX) ??
  (process.env.NODE_ENV === 'production' ? 10 : 5);
const idleTimeoutMillis =
  parseIntEnv('PGPOOL_IDLE_TIMEOUT_MS', process.env.PGPOOL_IDLE_TIMEOUT_MS) ??
  10_000;
const connectionTimeoutMillis =
  parseIntEnv(
    'PGPOOL_CONN_TIMEOUT_MS',
    process.env.PGPOOL_CONN_TIMEOUT_MS,
  ) ?? 5_000;

export const pool = new Pool({
  connectionString,
  max: poolMax,
  idleTimeoutMillis,
  connectionTimeoutMillis,
  keepAlive: true,
  ssl: resolveSsl(connectionString),
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err);
});

export async function initDatabase(): Promise<void> {
  await pool.query('select 1 as ok');
}

export async function closeDatabase(): Promise<void> {
  await pool.end();
}

export async function withClient<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await fn(client);
  } finally {
    client.release();
  }
}

export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withClient(async (client) => {
    await client.query('begin');
    try {
      const result = await fn(client);
      await client.query('commit');
      return result;
    } catch (err) {
      await client.query('rollback');
      throw err;
    }
  });
}

export async function queryOne<T extends Record<string, any>>(
  client: Pool | PoolClient,
  text: string,
  values: any[],
): Promise<T | null> {
  const res: QueryResult<T> = await client.query(text, values);
  return res.rows[0] ?? null;
}

export async function queryMany<T extends Record<string, any>>(
  client: Pool | PoolClient,
  text: string,
  values: any[],
): Promise<T[]> {
  const res: QueryResult<T> = await client.query(text, values);
  return res.rows;
}
