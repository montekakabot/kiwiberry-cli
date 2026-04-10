import { describe, test, expect, afterEach } from "bun:test";
import { spawnSync } from "child_process";
import { join } from "path";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync, mkdirSync, chmodSync } from "fs";
import { tmpdir } from "os";
import { createHash } from "crypto";

const SCRIPT = join(import.meta.dir, "..", "install.sh");

interface RunResult { stdout: string; stderr: string; status: number }

function runScript(args: string[], env: Record<string, string>): RunResult {
  const result = spawnSync("bash", [SCRIPT, ...args], {
    env: { ...process.env, ...env },
    encoding: "utf8"
  });
  return {
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    status: result.status ?? -1
  };
}

function printTarget(env: Record<string, string>): RunResult {
  return runScript(["--print-target"], env);
}

function printUrl(env: Record<string, string>): RunResult {
  return runScript(["--print-url"], env);
}

describe("install.sh --print-target", () => {
  test("darwin + arm64 → kiwiberry-darwin-arm64.tar.gz", () => {
    const { stdout, status } = printTarget({ KIWIBERRY_OS: "Darwin", KIWIBERRY_ARCH: "arm64" });
    expect(status).toBe(0);
    expect(stdout).toBe("kiwiberry-darwin-arm64.tar.gz");
  });

  test("darwin + x86_64 → kiwiberry-darwin-x64.tar.gz", () => {
    const { stdout, status } = printTarget({ KIWIBERRY_OS: "Darwin", KIWIBERRY_ARCH: "x86_64" });
    expect(status).toBe(0);
    expect(stdout).toBe("kiwiberry-darwin-x64.tar.gz");
  });

  test("linux + x86_64 → kiwiberry-linux-x64.tar.gz", () => {
    const { stdout, status } = printTarget({ KIWIBERRY_OS: "Linux", KIWIBERRY_ARCH: "x86_64" });
    expect(status).toBe(0);
    expect(stdout).toBe("kiwiberry-linux-x64.tar.gz");
  });

  test("linux + aarch64 → kiwiberry-linux-arm64.tar.gz", () => {
    const { stdout, status } = printTarget({ KIWIBERRY_OS: "Linux", KIWIBERRY_ARCH: "aarch64" });
    expect(status).toBe(0);
    expect(stdout).toBe("kiwiberry-linux-arm64.tar.gz");
  });

  test("linux + arm64 (alt naming) → kiwiberry-linux-arm64.tar.gz", () => {
    const { stdout, status } = printTarget({ KIWIBERRY_OS: "Linux", KIWIBERRY_ARCH: "arm64" });
    expect(status).toBe(0);
    expect(stdout).toBe("kiwiberry-linux-arm64.tar.gz");
  });

  test("unsupported OS exits non-zero with a helpful message", () => {
    const { stderr, status } = printTarget({ KIWIBERRY_OS: "FreeBSD", KIWIBERRY_ARCH: "x86_64" });
    expect(status).not.toBe(0);
    expect(stderr.toLowerCase()).toContain("unsupported");
    expect(stderr).toContain("FreeBSD");
  });

  test("unsupported arch exits non-zero with a helpful message", () => {
    const { stderr, status } = printTarget({ KIWIBERRY_OS: "Linux", KIWIBERRY_ARCH: "i386" });
    expect(status).not.toBe(0);
    expect(stderr.toLowerCase()).toContain("unsupported");
    expect(stderr).toContain("i386");
  });
});

describe("install.sh --print-url", () => {
  test("latest version points at the latest release redirect", () => {
    const { stdout, status } = printUrl({
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_VERSION: "latest"
    });
    expect(status).toBe(0);
    expect(stdout).toBe(
      "https://github.com/montekakabot/kiwiberry-cli/releases/latest/download/kiwiberry-darwin-arm64.tar.gz"
    );
  });

  test("pinned version points at the tagged download path", () => {
    const { stdout, status } = printUrl({
      KIWIBERRY_OS: "Linux",
      KIWIBERRY_ARCH: "x86_64",
      KIWIBERRY_VERSION: "v0.2.0"
    });
    expect(status).toBe(0);
    expect(stdout).toBe(
      "https://github.com/montekakabot/kiwiberry-cli/releases/download/v0.2.0/kiwiberry-linux-x64.tar.gz"
    );
  });
});

describe("install.sh install flow", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "kiwiberry-install-"));
    dirs.push(dir);
    return dir;
  }

  function buildFakeRelease(workDir: string, binaryContent: string): { tarballPath: string; checksum: string } {
    const stageDir = join(workDir, "stage");
    mkdirSync(stageDir, { recursive: true });
    const binPath = join(stageDir, "kiwiberry");
    writeFileSync(binPath, binaryContent);
    chmodSync(binPath, 0o755);

    const tarballPath = join(workDir, "kiwiberry-darwin-arm64.tar.gz");
    const tarResult = spawnSync("tar", ["-czf", tarballPath, "-C", stageDir, "kiwiberry"]);
    if (tarResult.status !== 0) throw new Error(`tar failed: ${tarResult.stderr.toString()}`);

    const checksum = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
    return { tarballPath, checksum };
  }

  test("downloads, verifies checksum, and installs binary into install dir", () => {
    const workDir = makeTempDir();
    const installDir = join(workDir, "bin");
    const { tarballPath, checksum } = buildFakeRelease(workDir, "#!/bin/sh\necho fake-kiwiberry\n");

    const result = runScript([], {
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_DOWNLOAD_URL: `file://${tarballPath}`,
      KIWIBERRY_SHA256: checksum,
      KIWIBERRY_INSTALL_DIR: installDir
    });

    expect(result.status).toBe(0);
    const installedPath = join(installDir, "kiwiberry");
    expect(existsSync(installedPath)).toBe(true);

    const run = spawnSync(installedPath, [], { encoding: "utf8" });
    expect(run.stdout.trim()).toBe("fake-kiwiberry");
  });

  test("aborts when checksum does not match", () => {
    const workDir = makeTempDir();
    const installDir = join(workDir, "bin");
    const { tarballPath } = buildFakeRelease(workDir, "real-payload");

    const result = runScript([], {
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_DOWNLOAD_URL: `file://${tarballPath}`,
      KIWIBERRY_SHA256: "0".repeat(64),
      KIWIBERRY_INSTALL_DIR: installDir
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr.toLowerCase()).toContain("checksum");
    expect(existsSync(join(installDir, "kiwiberry"))).toBe(false);
  });

  test("creates the install dir if it is missing", () => {
    const workDir = makeTempDir();
    const installDir = join(workDir, "nested", "bin");
    const { tarballPath, checksum } = buildFakeRelease(workDir, "#!/bin/sh\n");

    expect(existsSync(installDir)).toBe(false);

    const result = runScript([], {
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_DOWNLOAD_URL: `file://${tarballPath}`,
      KIWIBERRY_SHA256: checksum,
      KIWIBERRY_INSTALL_DIR: installDir
    });

    expect(result.status).toBe(0);
    expect(existsSync(join(installDir, "kiwiberry"))).toBe(true);
  });
});

describe("install.sh default checksum verification (no KIWIBERRY_SHA256 override)", () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
    dirs.length = 0;
  });

  function makeTempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), "kiwiberry-sumsverify-"));
    dirs.push(dir);
    return dir;
  }

  function buildFakeRelease(workDir: string, binaryContent: string): { tarballPath: string; checksum: string } {
    const stageDir = join(workDir, "stage");
    mkdirSync(stageDir, { recursive: true });
    const binPath = join(stageDir, "kiwiberry");
    writeFileSync(binPath, binaryContent);
    chmodSync(binPath, 0o755);

    const tarballPath = join(workDir, "kiwiberry-darwin-arm64.tar.gz");
    const tarResult = spawnSync("tar", ["-czf", tarballPath, "-C", stageDir, "kiwiberry"]);
    if (tarResult.status !== 0) throw new Error(`tar failed: ${tarResult.stderr.toString()}`);

    const checksum = createHash("sha256").update(readFileSync(tarballPath)).digest("hex");
    return { tarballPath, checksum };
  }

  test("fetches SHA256SUMS and installs when the entry matches", () => {
    const workDir = makeTempDir();
    const installDir = join(workDir, "bin");
    const { tarballPath, checksum } = buildFakeRelease(workDir, "#!/bin/sh\necho verified\n");

    const sumsPath = join(workDir, "SHA256SUMS");
    writeFileSync(
      sumsPath,
      [
        `${"a".repeat(64)}  kiwiberry-linux-x64.tar.gz`,
        `${checksum}  kiwiberry-darwin-arm64.tar.gz`,
        `${"b".repeat(64)}  kiwiberry-windows-x64.zip`
      ].join("\n") + "\n"
    );

    const result = runScript([], {
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_DOWNLOAD_URL: `file://${tarballPath}`,
      KIWIBERRY_SHA256SUMS_URL: `file://${sumsPath}`,
      KIWIBERRY_INSTALL_DIR: installDir,
      // explicitly unset to exercise the default path
      KIWIBERRY_SHA256: ""
    });

    expect(result.status).toBe(0);
    expect(existsSync(join(installDir, "kiwiberry"))).toBe(true);
  });

  test("aborts when the SHA256SUMS entry does not match the downloaded archive", () => {
    const workDir = makeTempDir();
    const installDir = join(workDir, "bin");
    const { tarballPath } = buildFakeRelease(workDir, "real-payload");

    const sumsPath = join(workDir, "SHA256SUMS");
    writeFileSync(sumsPath, `${"0".repeat(64)}  kiwiberry-darwin-arm64.tar.gz\n`);

    const result = runScript([], {
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_DOWNLOAD_URL: `file://${tarballPath}`,
      KIWIBERRY_SHA256SUMS_URL: `file://${sumsPath}`,
      KIWIBERRY_INSTALL_DIR: installDir,
      KIWIBERRY_SHA256: ""
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr.toLowerCase()).toContain("checksum");
    expect(existsSync(join(installDir, "kiwiberry"))).toBe(false);
  });

  test("aborts when the asset is missing from SHA256SUMS", () => {
    const workDir = makeTempDir();
    const installDir = join(workDir, "bin");
    const { tarballPath } = buildFakeRelease(workDir, "payload");

    const sumsPath = join(workDir, "SHA256SUMS");
    writeFileSync(
      sumsPath,
      [
        `${"a".repeat(64)}  kiwiberry-linux-x64.tar.gz`,
        `${"b".repeat(64)}  kiwiberry-windows-x64.zip`
      ].join("\n") + "\n"
    );

    const result = runScript([], {
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_DOWNLOAD_URL: `file://${tarballPath}`,
      KIWIBERRY_SHA256SUMS_URL: `file://${sumsPath}`,
      KIWIBERRY_INSTALL_DIR: installDir,
      KIWIBERRY_SHA256: ""
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(/sha256sums|checksum/);
    expect(existsSync(join(installDir, "kiwiberry"))).toBe(false);
  });

  test("aborts when SHA256SUMS cannot be fetched", () => {
    const workDir = makeTempDir();
    const installDir = join(workDir, "bin");
    const { tarballPath } = buildFakeRelease(workDir, "payload");

    const result = runScript([], {
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_DOWNLOAD_URL: `file://${tarballPath}`,
      KIWIBERRY_SHA256SUMS_URL: `file://${join(workDir, "does-not-exist", "SHA256SUMS")}`,
      KIWIBERRY_INSTALL_DIR: installDir,
      KIWIBERRY_SHA256: ""
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr.toLowerCase()).toMatch(/sha256sums|checksum/);
    expect(existsSync(join(installDir, "kiwiberry"))).toBe(false);
  });
});

describe("install.sh --print-sums-url", () => {
  test("latest version resolves to the GitHub latest SHA256SUMS", () => {
    const result = runScript(["--print-sums-url"], {
      KIWIBERRY_OS: "Darwin",
      KIWIBERRY_ARCH: "arm64",
      KIWIBERRY_VERSION: "latest"
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "https://github.com/montekakabot/kiwiberry-cli/releases/latest/download/SHA256SUMS"
    );
  });

  test("pinned version resolves to the tagged SHA256SUMS", () => {
    const result = runScript(["--print-sums-url"], {
      KIWIBERRY_OS: "Linux",
      KIWIBERRY_ARCH: "x86_64",
      KIWIBERRY_VERSION: "v0.2.0"
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      "https://github.com/montekakabot/kiwiberry-cli/releases/download/v0.2.0/SHA256SUMS"
    );
  });
});
