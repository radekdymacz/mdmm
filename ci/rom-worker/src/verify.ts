import { jwtVerify, type JWTVerifyGetKey, type KeyLike, type JWTPayload } from "jose";
import { AUDIENCE, ISSUER, checkClaims, type Verdict } from "./claims";

type Keys = JWTVerifyGetKey | KeyLike | Uint8Array;

/** Signature (RS256 only), issuer, audience, exp/nbf by jose; then the repo-specific claims. Never throws. */
export async function verifyGithubToken(token: string, keys: Keys, nowSeconds: number): Promise<Verdict> {
	let payload: JWTPayload;
	try {
		const options = {
			algorithms: ["RS256"],
			issuer: ISSUER,
			audience: AUDIENCE,
			clockTolerance: 5,
			currentDate: new Date(nowSeconds * 1000),
		};
		// jwtVerify has an overload per key kind; one call site keeps the union out of the types
		({ payload } = await jwtVerify(token, keys as KeyLike, options));
	} catch {
		return { ok: false, why: "signature" };
	}
	return checkClaims(payload, nowSeconds);
}
