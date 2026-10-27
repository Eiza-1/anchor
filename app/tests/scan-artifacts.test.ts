import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const { scanText } = require("../scripts/scan-artifacts.js") as {
  scanText(text: string): { rule: string; match: string }[];
};

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (role: string) => `${b64({ alg: "HS256" })}.${b64({ role, iss: "supabase" })}.c2lnbmF0dXJl`;
const rules = (t: string) => scanText(t).map((f) => f.rule);

describe("scanText", () => {
  it("flags a service_role JWT", () => {
    expect(rules(`k = "${jwt("service_role")}"`)).toContain("service-role-jwt");
  });
  it("ignores an anon JWT", () => {
    expect(scanText(`k = "${jwt("anon")}"`)).toEqual([]);
  });
  it("flags Stripe keys", () => {
    expect(rules("sk_live_abcdef123456")).toContain("stripe-key");
    expect(rules("sk_test_abcdef123456")).toContain("stripe-key");
  });
  it("flags an AWS access key id", () => {
    expect(rules("AKIAABCDEFGHIJKLMNOP")).toContain("aws-access-key");
  });
  it("flags a private key block", () => {
    expect(rules("-----BEGIN RSA PRIVATE KEY-----\nabc")).toContain("private-key");
  });
  it("flags GitHub tokens", () => {
    expect(rules("ghp_abcdefghijklmnop")).toContain("github-token");
    expect(rules("github_pat_abcdefghijk")).toContain("github-token");
  });
  it("flags a postgres URL with credentials", () => {
    expect(rules("postgresql://user:pass@host/db")).toContain("postgres-url");
  });
  it("flags rawgKey", () => {
    expect(rules("const rawgKey = 1")).toContain("rawg-key");
  });
  it("flags a 32-hex value assigned to a key-like name", () => {
    expect(rules(`apiKey: "0123456789abcdef0123456789abcdef"`)).toContain("hex-secret");
  });
  it("redacts matches to 6 chars", () => {
    const [f] = scanText("ghp_abcdefghijklmnop");
    expect(f.match).toBe("ghp_ab");
  });
  it("ignores config.example.js", () => {
    const text = fs.readFileSync(path.join(__dirname, "..", "main", "config.example.js"), "utf8");
    expect(scanText(text)).toEqual([]);
  });
});

describe("scanText false positives", () => {
  it("ignores an AKIA-like run inside a longer base64 blob (binary data)", () => {
    expect(scanText("xxKAKIAABCDEFGHIJKLMNOPRxx")).toEqual([]);
  });
});
