import { existsSync } from 'node:fs';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export async function localDatabase({ persistent = false, dataPath } = {}) {
  let systemBinary = process.env.MONGOMS_SYSTEM_BINARY;
  if (!systemBinary && process.platform === 'win32') {
    const directory = join(process.env.ProgramFiles || 'C:\\Program Files', 'MongoDB', 'Server');
    if (existsSync(directory)) {
      const versions = (await readdir(directory))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
        .reverse();
      systemBinary = versions
        .map((version) => join(directory, version, 'bin', 'mongod.exe'))
        .find(existsSync);
    }
  }
  const dbPath = persistent ? resolve(dataPath || '.data/mongodb') : undefined;
  if (dbPath) await mkdir(dbPath, { recursive: true });
  const version = systemBinary
    ? (await promisify(execFile)(systemBinary, ['--version'], { windowsHide: true })).stdout.match(
        /db version v([\d.]+)/,
      )?.[1]
    : undefined;
  return MongoMemoryServer.create({
    binary: {
      ...(systemBinary ? { systemBinary, version } : {}),
      downloadDir: resolve('.cache/mongodb'),
    },
    instance: {
      ip: '127.0.0.1',
      dbName: persistent ? 'forma' : 'forma_test',
      storageEngine: 'wiredTiger',
      ...(dbPath ? { dbPath, ...(!dataPath ? { port: 27018 } : {}) } : {}),
    },
  });
}
