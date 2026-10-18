// Which GitHub Actions run may fetch the firmware images. Pure: no I/O, so it is tested with plain objects.
// Every rule is an allow-list; anything not listed is refused. The caller answers 403 with no detail.

export const ISSUER = "https://token.actions.githubusercontent.com";
export const AUDIENCE = "mdmm-rom";
export const REPOSITORY = "radekdymacz/mdmm";
export const REPOSITORY_ID = "1390624298";
export const ENVIRONMENT = "rom";
export const WORKFLOW_PREFIX = "radekdymacz/mdmm/.github/workflows/mdmm-firmware.yml@";
const EVENTS = new Set(["push", "workflow_dispatch", "schedule"]);
const CLOCK_SKEW_SECONDS = 60;

export type Claims = Readonly<Record<string, unknown>>;

export interface Summary {
	readonly repository: string;
	readonly ref: string;
	readonly event: string;
}

export type Verdict = { readonly ok: true; readonly summary: Summary } | { readonly ok: false; readonly why: string };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

const refAllowed = (ref: string): boolean =>
	ref === "refs/heads/main" || (ref.startsWith("refs/heads/release/") && ref.length > "refs/heads/release/".length);

/** Checks the claims of an already signature-verified token. `nowSeconds` is injected for tests. */
export function checkClaims(c: Claims, nowSeconds: number): Verdict {
	const no = (why: string): Verdict => ({ ok: false, why });
	const ref = str(c.ref);
	const event = str(c.event_name);

	if (c.iss !== ISSUER) return no("iss");
	const aud = c.aud;
	if (!(aud === AUDIENCE || (Array.isArray(aud) && aud.length === 1 && aud[0] === AUDIENCE))) return no("aud");
	if (typeof c.exp !== "number" || c.exp <= nowSeconds) return no("exp");
	if (typeof c.nbf === "number" && c.nbf > nowSeconds + CLOCK_SKEW_SECONDS) return no("nbf");
	if (typeof c.iat !== "number" || c.iat > nowSeconds + CLOCK_SKEW_SECONDS) return no("iat");
	if (str(c.repository) !== REPOSITORY) return no("repository");
	if (str(c.repository_id) !== REPOSITORY_ID) return no("repository_id");
	if (!refAllowed(ref) || str(c.ref_type) !== "branch") return no("ref");
	if (!EVENTS.has(event)) return no("event_name");
	if (str(c.environment) !== ENVIRONMENT) return no("environment");
	const wf = str(c.job_workflow_ref);
	if (!wf.startsWith(WORKFLOW_PREFIX) || wf !== `${WORKFLOW_PREFIX}${ref}`) return no("job_workflow_ref");
	if (str(c.runner_environment) !== "github-hosted") return no("runner_environment");

	return { ok: true, summary: { repository: str(c.repository), ref, event } };
}
