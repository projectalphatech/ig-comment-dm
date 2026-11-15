// Offline tests: no network (fetch is mocked). Run: node test.mjs
import assert from "node:assert/strict";
import worker, { matchKey, validSig } from "./src/index.js";

const env = { APP_SECRET: "s3cret", IG_TOKEN: "t", IG_USER_ID: "1", IG_USERNAME: "me_account", VERIFY_TOKEN: "v" };
let calls = [], following = true;
globalThis.fetch = async (url, opt = {}) => {
  calls.push({ url: String(url), body: opt.body ? JSON.parse(opt.body) : null });
  const j = String(url).includes("is_user_follow_business") ? { is_user_follow_business: following } : { id: "x" };
  return new Response(JSON.stringify(j), { status: 200 });
};
const sign = async (raw, secret = env.APP_SECRET) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "sha256=" + [...new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)))].map((b) => b.toString(16).padStart(2, "0")).join("");
};
async function hit(payload) {
  const raw = JSON.stringify(payload);
  calls = [];
  const r = await worker.fetch(new Request("https://x/", { method: "POST", body: raw, headers: { "x-hub-signature-256": await sign(raw) } }), env);
  assert.equal(r.status, 200);
  return calls;
}
const comment = (text, id = "c1", from = { id: "99", username: "fan" }) => ({ entry: [{ changes: [{ field: "comments", value: { id, text, from, media: { id: "m1" } } }] }] });
const tap = (payload) => ({ entry: [{ messaging: [{ sender: { id: "99" }, postback: { payload } }] }] });
const card = (c) => c.find((x) => x.url.endsWith("/1/messages")).body.message.attachment.payload.elements[0];

// --- signature ---
const raw = '{"a":1}';
assert.equal(await validSig(raw, await sign(raw), env.APP_SECRET), true);
assert.equal(await validSig(raw, await sign(raw, "wrong"), env.APP_SECRET), false);
assert.equal(await validSig(raw, null, env.APP_SECRET), false);
assert.equal(await validSig(raw, "sha256=zz", env.APP_SECRET), false);
assert.equal(await validSig(raw, await sign(raw), undefined), false);
let r = await worker.fetch(new Request("https://x/", { method: "POST", body: raw, headers: { "x-hub-signature-256": "sha256=" + "0".repeat(64) } }), env);
assert.equal(r.status, 401);
r = await worker.fetch(new Request("https://x/", { method: "POST", body: raw }), env);
assert.equal(r.status, 401);

// --- webhook verification handshake ---
r = await worker.fetch(new Request("https://x/?hub.mode=subscribe&hub.verify_token=v&hub.challenge=abc"), env);
assert.equal(await r.text(), "abc");
r = await worker.fetch(new Request("https://x/?hub.verify_token=nope&hub.challenge=abc"), env);
assert.equal(r.status, 403);
r = await worker.fetch(new Request("https://x/?hub.verify_token=undefined"), { ...env, VERIFY_TOKEN: undefined });
assert.equal(r.status, 403);

// --- keyword matching ---
for (const t of ["GUIDE", "guide please", "Send me the Guide 🔥", "دليل", "عايز الدليل"]) assert.equal(matchKey(t), "GUIDE", t);
assert.equal(matchKey("تشيك ليست"), "CHECKLIST");
for (const t of ["hello", "great post", ""]) assert.equal(matchKey(t), null, t);

// --- comment -> public reply + DM card with postback button ---
let c = await hit(comment("GUIDE pls"));
assert.match(c[0].url, /\/c1\/replies$/);
assert.ok(["Sent you the guide in DMs 📩", "Check your inbox, the guide is there ✅"].includes(c[0].body.message));
assert.deepEqual(c[1].body.recipient, { comment_id: "c1" });
let el = card(c);
assert.equal(el.buttons[0].type, "postback");
assert.equal(el.buttons[0].payload, "GET:GUIDE");
c = await hit(comment("دليل"));
assert.equal(card(c).buttons[0].title, "Send me the guide");
c = await hit(comment("تشيك ليست"));
assert.match(c[0].body.message, /[؀-ۿ]/);
assert.equal(card(c).buttons[0].payload, "GET:CHECKLIST");
// unrelated and own comments do nothing
assert.equal((await hit(comment("nice"))).length, 0);
assert.equal((await hit(comment("GUIDE", "c2", { id: "1" }))).length, 0);
assert.equal((await hit(comment("GUIDE", "c3", { id: "5", username: "me_account" }))).length, 0);

// --- follow gate ---
following = true; c = await hit(tap("GET:GUIDE"));
assert.ok(c[0].url.includes("is_user_follow_business"));
assert.deepEqual(c[1].body.recipient, { id: "99" });
assert.ok(c[1].body.message.text.includes("https://example.com/free-guide"));
following = false; c = await hit(tap("GET:GUIDE"));
el = card(c);
assert.equal(c.some((x) => x.body?.message?.text), false, "link must not leak to non-followers");
assert.equal(el.title, "Follow first, then tap the button below 👇");
assert.deepEqual(el.buttons[0], { type: "web_url", title: "Open profile", url: "https://instagram.com/me_account" });
assert.deepEqual(el.buttons[1], { type: "postback", title: "I followed ✅", payload: "GET:GUIDE" });
following = true;
// unknown / foreign payloads are ignored
assert.equal((await hit(tap("GET:NOPE"))).length, 0);
assert.equal((await hit(tap("OTHER:GUIDE"))).length, 0);

// --- Instagram limits on button titles (max 20 chars) ---
for (const v of ["Send me the guide", "Send me the link", "ابعتلي التشيك ليست", "Open profile", "I followed ✅", "افتح البروفايل", "عملت Follow ✅"])
  assert.ok([...v].length <= 20, v);

// --- routes ---
r = await worker.fetch(new Request("https://x/privacy"), env);
assert.equal(r.status, 200);
assert.match(await r.text(), /me_account/);
r = await worker.fetch(new Request("https://x/health"), env);
assert.equal((await r.json()).ok, true);
console.log("all tests pass");
