import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyGithubToken } from "../src/verify";
import app from "../src/index";

vi.mock("../src/verify", () => ({ verifyGithubToken: vi.fn() }));
const verify = vi.mocked(verifyGithubToken);
const allowed = { ok: true as const, summary: { repository: "radekdymacz/mdmm", ref: "refs/heads/main", event: "push" } };
const headers = { Authorization: "Bearer test.token.signature" };

describe("private downloads", () => {
	beforeEach(() => { vi.resetAllMocks(); });

	it.each([
		["/rom/md", "md.bin"], ["/rom/mm", "mm.bin"],
		["/sysex/md", "sysex/md.syx"], ["/sysex/mm", "sysex/mm.syx"],
	])("streams %s only after token verification", async (path, key) => {
		verify.mockResolvedValue(allowed);
		const get = vi.fn().mockResolvedValue({ body: new Uint8Array([1, 2, 3]), size: 3 });
		const result = await app.request(path, { headers }, { ROMS: { get } as unknown as R2Bucket });
		expect(verify).toHaveBeenCalledOnce();
		expect(get).toHaveBeenCalledWith(key);
		expect(result.status).toBe(200);
		expect(result.headers.get("Cache-Control")).toBe("no-store");
		expect(result.headers.get("Content-Length")).toBe("3");
		expect([...new Uint8Array(await result.arrayBuffer())]).toEqual([1, 2, 3]);
	});

	it.each(["/rom/md", "/sysex/md", "/sysex/mm"])("refuses missing or rejected credentials for %s", async (path) => {
		const get = vi.fn();
		const env = { ROMS: { get } as unknown as R2Bucket };
		expect((await app.request(path, {}, env)).status).toBe(403);
		expect(verify).not.toHaveBeenCalled();
		verify.mockResolvedValue({ ok: false, why: "signature" });
		const result = await app.request(path, { headers }, env);
		expect(result.status).toBe(403);
		expect(await result.text()).toBe("");
		expect(get).not.toHaveBeenCalled();
	});

	it.each(["/sysex/other", "/sysex/constructor", "/sysex/__proto__", "/rom/md.bin", "/sysex/md/extra", "/fixtures/md.syx"])("never reads an unlisted object for %s", async (path) => {
		verify.mockResolvedValue(allowed);
		const get = vi.fn();
		expect((await app.request(path, { headers }, { ROMS: { get } as unknown as R2Bucket })).status).toBe(403);
		expect(get).not.toHaveBeenCalled();
	});

	it("refuses writes and missing objects without exposing details", async () => {
		verify.mockResolvedValue(allowed);
		const get = vi.fn().mockResolvedValue(null);
		const env = { ROMS: { get } as unknown as R2Bucket };
		expect((await app.request("/sysex/md", { method: "PUT", headers }, env)).status).toBe(403);
		expect(get).not.toHaveBeenCalled();
		const result = await app.request("/sysex/md", { headers }, env);
		expect(result.status).toBe(403);
		expect(await result.text()).toBe("");
	});
});
