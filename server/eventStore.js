import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_STORE_PATH = path.resolve(process.cwd(), 'data', 'event-store.json');

function ensureDirectory(filepath) {
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
}

export function getEventStorePath(env = process.env) {
  return env.EVENT_STORE_PATH
    ? path.resolve(process.cwd(), env.EVENT_STORE_PATH)
    : DEFAULT_STORE_PATH;
}

export function readEventStore(filepath) {
  try {
    if (!fs.existsSync(filepath)) {
      return null;
    }

    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    console.error(`Failed to read event store at ${filepath}:`, error.message);
    return null;
  }
}

export function writeEventStore(filepath, payload) {
  ensureDirectory(filepath);
  fs.writeFileSync(filepath, JSON.stringify(payload, null, 2), 'utf8');
}
