import { Hono } from "hono";
import { createRemoteJWKSet } from "jose";
import { ISSUER } from "./claims";
import { verifyGithubToken } from "./verify";

interface Env {
	readonly ROMS: R2Bucket;
}

const KEYS: Readonly<Record<string, string>> = {
	"/rom/md": "md.bin",
	"/rom/mm": "mm.bin",
	"/sysex/md": "sysex/md.syx",
	"/sysex/mm": "sysex/mm.syx",
};

// Module-scope on purpose: the JWKS is cached for the life of the isolate (jose refetches on an unknown kid, rate-limited).
const jwks = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`), { cooldownDuration: 30_000, cacheMaxAge: 600_000 });

const deny = (): Response => new Response(null, { status: 403, headers: { "Cache-Control": "no-store" } });

const app = new Hono<{ Bindings: Env }>();

app.on("GET", ["/rom/:model", "/sysex/:model"], async (c) => {
	const header = c.req.header("Authorization") ?? "";
	const match = /^Bearer ([A-Za-z0-9._-]+)$/.exec(header);
	const path = c.req.path;
	const key = Object.hasOwn(KEYS, path) ? KEYS[path] : undefined;
	if (!match || !match[1] || !key) return deny();

	const verdict = await verifyGithubToken(match[1], jwks, Math.floor(Date.now() / 1000));
	if (!verdict.ok) {
		console.log(JSON.stringify({ decision: "deny", why: verdict.why }));
		return deny();
	}
	const object = await c.env.ROMS.get(key);
	if (!object) {
		console.log(JSON.stringify({ decision: "allow-missing", ...verdict.summary, key }));
		return deny();
	}
	console.log(JSON.stringify({ decision: "allow", ...verdict.summary, key }));
	return new Response(object.body, {
		headers: {
			"Content-Type": "application/octet-stream",
			"Content-Length": String(object.size),
			"Cache-Control": "no-store",
		},
	});
});

app.all("*", () => deny());

export default app;
