import { describe, test, expect, afterEach } from "bun:test";
import { rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getDatabase } from "../src/db";
import { getConfig, setConfig } from "../src/services/config";

function makeTempDir(): string {
  return join(tmpdir(), `kiwiberry-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

describe("ConfigService", () => {
  const tempDirs: string[] = [];

  function setupDb() {
    const dataDir = makeTempDir();
    tempDirs.push(dataDir);
    return getDatabase(dataDir);
  }

  afterEach(() => {
    for (const dir of tempDirs) {
      rmSync(dir, { recursive: true, force: true });
    }
    tempDirs.length = 0;
  });

  test("getConfig returns default value for max-pages", () => {
    const db = setupDb();
    expect(getConfig(db, "max-pages")).toBe("2");
  });

  test("getConfig throws for unknown key", () => {
    const db = setupDb();
    expect(() => getConfig(db, "no-such-key")).toThrow("Unknown config key: no-such-key");
  });

  test("setConfig stores a value and getConfig retrieves it", () => {
    const db = setupDb();
    setConfig(db, "max-pages", "5");
    expect(getConfig(db, "max-pages")).toBe("5");
  });

  test("setConfig overwrites an existing value", () => {
    const db = setupDb();
    setConfig(db, "max-pages", "5");
    setConfig(db, "max-pages", "10");
    expect(getConfig(db, "max-pages")).toBe("10");
  });
});
