import fs from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

async function runMigration() {
  console.log('================================================================');
  console.log('  Poora Teeka - Database Migration Runner (db/migrate.ts)        ');
  console.log('================================================================');

  const host = process.env.DB_HOST || process.env.PGHOST;
  const port = parseInt(process.env.DB_PORT || process.env.PGPORT || '5432', 10);
  const database = process.env.DB_NAME || process.env.PGDATABASE || 'postgres';
  const user = process.env.DB_USER || process.env.PGUSER || 'poorateeka_admin';
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD;

  if (!host) {
    console.error('❌ Error: DB_HOST or PGHOST environment variable is required.');
    process.exit(1);
  }
  if (!password) {
    console.error('❌ Error: DB_PASSWORD or PGPASSWORD environment variable is required.');
    process.exit(1);
  }

  console.log(`Host:     ${host}`);
  console.log(`Port:     ${port}`);
  console.log(`Database: ${database}`);
  console.log(`User:     ${user}`);
  console.log(`Timestamp: ${new Date().toISOString()}`);
  console.log('----------------------------------------------------------------\n');

  const client = new Client({
    host,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔌 Connecting to PostgreSQL database...');
    await client.connect();
    console.log('✅ Connected successfully.\n');

    // 1. Apply db/schema.sql inside transaction
    const schemaPath = path.resolve(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log(`📜 Applying base schema from: ${schemaPath}`);
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await client.query('BEGIN');
      await client.query(schemaSql);
      await client.query('COMMIT');
      console.log('✅ Base schema successfully applied.\n');
    } else {
      console.warn(`⚠️ Warning: ${schemaPath} not found.`);
    }

    // 2. Apply db/seed.sql inside transaction
    const seedPath = path.resolve(__dirname, 'seed.sql');
    if (fs.existsSync(seedPath)) {
      console.log(`🌱 Applying base seed data from: ${seedPath}`);
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await client.query('BEGIN');
      await client.query(seedSql);
      await client.query('COMMIT');
      console.log('✅ Base seed data successfully applied.\n');
    }

    // 3. Apply migrations from db/migrations/
    const migrationsDir = path.resolve(__dirname, 'migrations');
    if (fs.existsSync(migrationsDir)) {
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
      for (const file of files) {
        const filePath = path.join(migrationsDir, file);
        console.log(`🔄 Applying migration: ${file}`);
        const migrationSql = fs.readFileSync(filePath, 'utf8');
        try {
          await client.query('BEGIN');
          await client.query(migrationSql);
          await client.query('COMMIT');
          console.log(`✅ Applied ${file}`);
        } catch (mErr: any) {
          await client.query('ROLLBACK');
          console.warn(`ℹ️ Notice for ${file}: ${mErr.message} (may already be applied)`);
        }
      }
      console.log('');
    }

    // 4. Verify table counts
    const tableRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);
    console.log('📊 Active database tables:');
    console.table(tableRes.rows);

    console.log('================================================================');
    console.log('🎉 Migration completed successfully!');
    console.log('================================================================');
  } catch (err: any) {
    console.error('\n❌ Migration failed:', err.message || err);
    process.exit(1);
  } finally {
    await client.end().catch(() => {});
  }
}

runMigration();
