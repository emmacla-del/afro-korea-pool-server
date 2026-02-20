import { Pool, PoolClient, PoolConfig, QueryResult } from 'pg';

function getConnectionString(): string | null {
  const v = process.env.DATABASE_URL;
  if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  // Don't throw here; return null and let initDatabase handle absence gracefully
  return null;
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

  // CRITICAL FIX FOR RENDER: Accept self-signed certificates for Render PostgreSQL
  // For Render databases, default to false to accept self-signed certs
  // For other databases, default to true for security
  const isRenderDB = url.hostname.includes('render.com');
  const rejectUnauthorized = rejectUnauthorizedEnv ?? (isRenderDB ? false : true);

  console.log(`🔧 SSL Config: enabled=${enabled}, rejectUnauthorized=${rejectUnauthorized}, isRenderDB=${isRenderDB}`);

  return { rejectUnauthorized };
}

const connectionString = getConnectionString();

const createFallbackPool = () => ({
  query: async () => {
    throw new Error('Database not configured');
  },
  connect: async () => {
    throw new Error('Database not configured');
  },
  end: async () => Promise.resolve(),
  totalCount: 0,
  idleCount: 0,
  waitingCount: 0,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pool: any;

if (!connectionString) {
  console.error(`${new Date().toISOString()} - ⚠️ DATABASE_URL is not set. Database features will be disabled.`);
}

if (connectionString) {
  try {
    validateConnectionString(connectionString);

    // Log sanitized connection string for debugging (hide password)
    const sanitizedUrl = connectionString.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
    console.log(`${new Date().toISOString()} - 🔗 Database URL: ${sanitizedUrl}`);
    console.log(`${new Date().toISOString()} - 🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

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

    // Create pool
    pool = new Pool({
      connectionString,
      max: poolMax,
      idleTimeoutMillis,
      connectionTimeoutMillis,
      keepAlive: true,
      ssl: resolveSsl(connectionString),
    });

    // Set up listeners
    pool.on('connect', () => {
      console.log(`${new Date().toISOString()} - ✅ New database client connected`);
    });

    pool.on('error', (err: any) => {
      console.error(`${new Date().toISOString()} - [db] PostgreSQL pool error:`, err?.message ?? err);
    });

    pool.on('remove', () => {
      console.log(`${new Date().toISOString()} - ℹ️ Database client removed from pool`);
    });
  } catch (err: any) {
    console.error(`${new Date().toISOString()} - ❌ Error configuring database pool:`, err?.message ?? err);
    pool = createFallbackPool();
    console.log(`${new Date().toISOString()} - Using fallback DB stub`);
  }
} else {
  // Create a safe stub for `pool` API surface so imports won't crash.
  // The stub throws on query/connect to make failures explicit at runtime.
  pool = createFallbackPool();

  console.log(`${new Date().toISOString()} - ℹ️ Using fallback DB stub`);
}

export { pool };

export async function initDatabase(): Promise<void> {
  try {
    console.log(`${new Date().toISOString()} - 🔗 Testing database connection...`);
    const startTime = Date.now();

    // Test connection with timeout
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Database connection timeout (10s)')), 10000);
    });

    const testPromise = pool.query('SELECT 1 as ok, NOW() as time');
    const result = await Promise.race([testPromise, timeoutPromise]) as any;

    const duration = Date.now() - startTime;
    console.log(`${new Date().toISOString()} - ✅ Database connected successfully in ${duration}ms`);
    console.log(`${new Date().toISOString()} - 📊 Database time: ${result.rows[0].time}`);

    // Log pool stats
    const poolStats = {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount
    };
    console.log(`📈 Pool stats:`, poolStats);

    return;
  } catch (error: any) {
    console.error(`${new Date().toISOString()} - ❌ Database connection failed:`, error?.message ?? error);

    // Provide helpful debugging info (only when connectionString is present)
    console.log(`${new Date().toISOString()} - 🔧 Debug info:`);
    console.log(`   - NODE_ENV: ${process.env.NODE_ENV}`);
    if (connectionString) {
      try {
        const url = new URL(connectionString);
        console.log(`   - DATABASE_URL host: ${url.hostname}`);
        console.log(`   - Is Render DB: ${url.hostname.includes('render.com')}`);
        console.log(`   - SSL mode in URL: ${url.searchParams.get('sslmode')}`);
      } catch (uerr) {
        console.log(`   - DATABASE_URL: (invalid URL)`);
      }
    } else {
      console.log('   - DATABASE_URL: not provided');
    }
    console.log(`   - PG_SSL_REJECT_UNAUTHORIZED: ${process.env.PG_SSL_REJECT_UNAUTHORIZED}`);

    // Do NOT rethrow — allow the app to continue starting for debugging
    return;
  }
}

export async function closeDatabase(): Promise<void> {
  try {
    console.log('🛑 Closing database pool...');
    await pool.end();
    console.log('✅ Database pool closed');
  } catch (error: any) {
    console.error('❌ Error closing database pool:', error.message);
    throw error;
  }
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
    await client.query('BEGIN');
    try {
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
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

// Utility function to check database health
export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// Graceful shutdown handler
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing database pool...');
  await closeDatabase();
  process.exit(0);
});
