// Creates an administrator account (SRS 2.7: the team creates administrators; there is no sign-up for them).
// Usage from the repository root: npm run seed:admin -- --email admin@example.com --password 'abcd1234'
// Optional: --language ar|en (default en). Uses DATABASE_URL from server/.env.
import { closePool } from './data/db.js';
import { SrsError } from './domain/errors.js';
import { createAdmin } from './services/account/accountService.js';

export interface SeedAdminArgs {
  email: string;
  password: string;
  language: string;
}

/** Reads --email, --password and --language; returns null when email or password is missing. */
export function parseSeedAdminArgs(argv: readonly string[]): SeedAdminArgs | null {
  const value = (flag: string) => {
    const index = argv.indexOf(flag);
    return index === -1 ? undefined : argv[index + 1];
  };
  const email = value('--email');
  const password = value('--password');
  if (email === undefined || password === undefined) return null;
  return { email, password, language: value('--language') ?? 'en' };
}

async function main(): Promise<void> {
  const args = parseSeedAdminArgs(process.argv.slice(2));
  if (args === null) {
    console.error('Usage: npm run seed:admin -- --email <email> --password <password> [--language ar|en]');
    process.exitCode = 1;
    return;
  }
  try {
    const admin = await createAdmin(args);
    // The password is never printed (NFR-09b).
    console.log(`Administrator created: ${args.email} (id ${admin.id})`);
  } catch (error) {
    if (error instanceof SrsError) {
      console.error(`Not created: ${JSON.stringify(error.body)}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    await closePool();
  }
}

// Run only when started as a script, not when a test imports parseSeedAdminArgs.
if (require.main === module) void main();
