import { describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair, exportJWK, createLocalJWKSet, type KeyLike } from "jose";
import { AUDIENCE, ISSUER, REPOSITORY, REPOSITORY_ID, checkClaims, type Claims } from "../src/claims";
import { verifyGithubToken } from "../src/verify";

const NOW = 1_800_000_000;
const good = (over: Claims = {}): Record<string, unknown> => ({
	iss: ISSUER,
	aud: AUDIENCE,
	exp: NOW + 300,
	nbf: NOW - 10,
	iat: NOW - 10,
	repository: REPOSITORY,
	repository_id: REPOSITORY_ID,
	ref: "refs/heads/main",
	ref_type: "branch",
	event_name: "push",
	environment: "rom",
	job_workflow_ref: "radekdymacz/mdmm/.github/workflows/mdmm-firmware.yml@refs/heads/main",
	runner_environment: "github-hosted",
	...over,
});
const ok = (over: Claims = {}): boolean => checkClaims(good(over), NOW).ok;

describe("checkClaims", () => {
	it("accepts the expected run", () => expect(ok()).toBe(true));
	it("accepts release branches and the other allowed events", () => {
		expect(ok({ ref: "refs/heads/release/0.8.0", job_workflow_ref: "radekdymacz/mdmm/.github/workflows/mdmm-firmware.yml@refs/heads/release/0.8.0" })).toBe(true);
		expect(ok({ event_name: "workflow_dispatch" })).toBe(true);
		expect(ok({ event_name: "schedule" })).toBe(true);
	});
	it.each([
		["pull_request", { event_name: "pull_request" }],
		["pull_request_target", { event_name: "pull_request_target" }],
		["no event", { event_name: undefined }],
		["other repo", { repository: "evil/mdmm" }],
		["fork with same name", { repository: "evil/mdmm", repository_id: "1" }],
		["wrong repo id", { repository_id: "42" }],
		["numeric repo id", { repository_id: 1390624298 }],
		["feature branch", { ref: "refs/heads/feat/x", job_workflow_ref: "radekdymacz/mdmm/.github/workflows/mdmm-firmware.yml@refs/heads/feat/x" }],
		["ref_type tag", { ref_type: "tag" }],
		["tag", { ref: "refs/tags/v1" }],
		["pull ref", { ref: "refs/pull/1/merge" }],
		["empty release", { ref: "refs/heads/release/" }],
		["lookalike release", { ref: "refs/heads/releases/1" }],
		["no environment", { environment: undefined }],
		["other environment", { environment: "prod" }],
		["other workflow", { job_workflow_ref: "radekdymacz/mdmm/.github/workflows/evil.yml@refs/heads/main" }],
		["other repo workflow", { job_workflow_ref: "evil/mdmm/.github/workflows/mdmm-firmware.yml@refs/heads/main" }],
		["workflow ref differs from ref", { job_workflow_ref: "radekdymacz/mdmm/.github/workflows/mdmm-firmware.yml@refs/heads/feat/x" }],
		["self-hosted", { runner_environment: "self-hosted" }],
		["wrong issuer", { iss: "https://evil.example" }],
		["wrong audience", { aud: "sts.amazonaws.com" }],
		["audience list", { aud: [AUDIENCE, "other"] }],
		["expired", { exp: NOW - 1 }],
		["no exp", { exp: undefined }],
		["not yet valid", { nbf: NOW + 3600 }],
		["issued in the future", { iat: NOW + 3600 }],
		["no iat", { iat: undefined }],
	])("refuses %s", (_name, over) => expect(ok(over as Claims)).toBe(false));
});

describe("verifyGithubToken", () => {
	const sign = async (claims: Record<string, unknown>, key: KeyLike, alg = "RS256", kid = "k1"): Promise<string> =>
		new SignJWT(claims).setProtectedHeader({ alg, kid }).sign(key);

	it("accepts a validly signed token and refuses a foreign key, HS256 and a tampered body", async () => {
		const mine = await generateKeyPair("RS256", { extractable: true });
		const other = await generateKeyPair("RS256");
		const jwk = { ...(await exportJWK(mine.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
		const jwks = createLocalJWKSet({ keys: [jwk] });

		const token = await sign(good(), mine.privateKey);
		expect((await verifyGithubToken(token, jwks, NOW)).ok).toBe(true);

		expect((await verifyGithubToken(await sign(good(), other.privateKey), jwks, NOW)).ok).toBe(false);

		const hs = await new SignJWT(good()).setProtectedHeader({ alg: "HS256", kid: "k1" }).sign(new TextEncoder().encode("x".repeat(32)));
		expect((await verifyGithubToken(hs, jwks, NOW)).ok).toBe(false);

		const none = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify(good()))}.`;
		expect((await verifyGithubToken(none, jwks, NOW)).ok).toBe(false);

		const [h, , s] = token.split(".");
		const forged = `${h}.${btoa(JSON.stringify(good({ ref: "refs/heads/feat/x" }))).replace(/=+$/, "")}.${s}`;
		expect((await verifyGithubToken(forged, jwks, NOW)).ok).toBe(false);

		expect((await verifyGithubToken("garbage", jwks, NOW)).ok).toBe(false);
	});

	it("refuses a signed token with a wrong claim", async () => {
		const k = await generateKeyPair("RS256", { extractable: true });
		const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(k.publicKey)), kid: "k1", alg: "RS256" }] });
		expect((await verifyGithubToken(await sign(good({ event_name: "pull_request" }), k.privateKey), jwks, NOW)).ok).toBe(false);
		expect((await verifyGithubToken(await sign(good({ exp: NOW - 100 }), k.privateKey), jwks, NOW)).ok).toBe(false);
	});
});
