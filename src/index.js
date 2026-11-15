// Instagram comment -> keyword -> public reply + private DM with a button -> link (only if the person follows you).
// Secrets (set with `npx wrangler secret put <NAME>`): APP_SECRET, IG_TOKEN, IG_USER_ID, IG_USERNAME, VERIFY_TOKEN

// ============================ CONFIG: EDIT THIS BLOCK ============================
// 1) key -> the link people receive. One entry per offer.
const LINKS = {
  GUIDE: "https://example.com/free-guide",
  CHECKLIST: "https://example.com/checklist",
};

// 2) words people type in a comment -> key. Case-insensitive. Add English, Arabic, spelling variants...
const KEYWORDS = {
  GUIDE: "GUIDE",
  "دليل": "GUIDE",
  "الدليل": "GUIDE",
  CHECKLIST: "CHECKLIST",
  "تشيك ليست": "CHECKLIST",
};

// 3) keys that must stand alone as a whole word (so "AREA" does not trigger "REA"). Optional.
const WHOLE_WORD = new Set([]); // example: new Set(["GUIDE"])

// 4) message texts per key. Anything missing falls back to `default`.
//    Instagram limits: button titles max 20 characters, card title max 80, DM text max 1000.
const COPY = {
  default: {
    replies: ["Check your DMs 📩", "Sent! Look in your inbox 🙌", "Done, it's in your DMs ✅"], // one is picked at random
    card: "Here's your free resource 👇",
    button: "Send me the link",
    gate: "Follow first, then tap the button below 👇",
    follow: "Open profile",
    followed: "I followed ✅",
    done: (link) => `Here you go 🎁 ${link}`,
  },
  GUIDE: {
    replies: ["Sent you the guide in DMs 📩", "Check your inbox, the guide is there ✅"],
    card: "Your free guide is ready 📘",
    button: "Send me the guide",
    done: (link) => `Here's the guide 🎁 ${link}\n\nEnjoy! Reply here if you get stuck.`,
  },
  CHECKLIST: {
    replies: ["بعتلك التشيك ليست على الخاص 📩", "شيك على الـ DM ✅"],
    card: "التشيك ليست جاهزة ✅",
    button: "ابعتلي التشيك ليست",
    gate: "دوس Follow الأول، وبعدين دوس الزرار تحت 👇",
    follow: "افتح البروفايل",
    followed: "عملت Follow ✅",
    done: (link) => `اتفضل 🎁 ${link}`,
  },
};
// ================================ END CONFIG =====================================

const G = "https://graph.instagram.com/v21.0";

const copy = (key) => ({ ...COPY.default, ...(COPY[key] || {}) });
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// first KEYWORDS entry found in the comment -> its key (or null). Whole-word keys need a non-letter/digit on both sides.
export function matchKey(text) {
  const T = String(text).toUpperCase();
  for (const [word, key] of Object.entries(KEYWORDS)) {
    const W = word.toUpperCase();
    const hit = WHOLE_WORD.has(key) ? new RegExp(`(^|[^\\p{L}\\p{N}])${esc(W)}($|[^\\p{L}\\p{N}])`, "u").test(T) : T.includes(W);
    if (hit) return key;
  }
  return null;
}

// X-Hub-Signature-256 = "sha256=" + HMAC-SHA256(raw body, APP_SECRET). subtle.verify compares in constant time.
export async function validSig(raw, header, secret) {
  if (!header || !secret || !/^sha256=[0-9a-f]{64}$/i.test(header)) return false;
  const sig = Uint8Array.from(header.slice(7).match(/../g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("HMAC", key, sig, new TextEncoder().encode(raw));
}

const card = (title, buttons) => ({
  attachment: { type: "template", payload: { template_type: "generic", elements: [{ title, buttons }] } },
});

async function api(env, path, body) {
  const r = await fetch(G + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.IG_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) console.log("IG error", path, await r.text()); // visible in Workers logs
  return r;
}
const sendDM = (env, recipient, message) => api(env, `/${env.IG_USER_ID}/messages`, { recipient, message });

async function isFollower(env, userId) {
  const r = await fetch(`${G}/${userId}?fields=is_user_follow_business`, { headers: { Authorization: `Bearer ${env.IG_TOKEN}` } });
  const j = await r.json();
  if (!r.ok) console.log("IG profile error", JSON.stringify(j));
  return j.is_user_follow_business === true;
}

const PRIVACY = (u) => `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>Privacy Policy</title>
<style>body{font:16px/1.6 system-ui,sans-serif;max-width:680px;margin:40px auto;padding:0 16px;color:#222}</style></head><body>
<h1>Privacy Policy</h1>
<p>This is an automation for the Instagram account @${u}. When you comment a keyword on one of our posts, it replies to your comment and sends you a direct message with a link.</p>
<h2>What we use</h2>
<ul><li>Your Instagram-scoped user ID and username, and the text of your comment.</li>
<li>Whether you follow our account, to decide whether to send the link.</li></ul>
<h2>What we store</h2>
<p>We do not store your data. It is processed only to send the reply and is not sold or shared with third parties.</p>
<h2>Data deletion</h2>
<p>We keep no personal data. To ask about deletion, send us a DM on Instagram saying "DELETE MY DATA". You can also delete the conversation from your own inbox at any time.</p>
<h2>Contact</h2>
<p>Instagram: @${u}</p>
</body></html>`;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // token check without exposing it: account username, subscribed webhook fields, configured keys
    if (url.pathname === "/health") {
      const h = { headers: { Authorization: `Bearer ${env.IG_TOKEN}` } };
      const r = await fetch(`${G}/me?fields=username`, h);
      const j = await r.json();
      const s = await (await fetch(`${G}/me/subscribed_apps`, h)).json();
      return Response.json({ ok: r.ok, username: j.username ?? null, error: j.error?.message ?? null, keys: Object.keys(LINKS),
        webhook_fields: s.data?.flatMap((a) => a.subscribed_fields ?? []) ?? null, webhook_error: s.error?.message ?? null });
    }

    if (url.pathname === "/privacy")
      return new Response(PRIVACY(env.IG_USERNAME ?? "our_account"), { headers: { "Content-Type": "text/html; charset=utf-8" } });

    // Meta webhook verification handshake
    if (req.method === "GET") {
      return env.VERIFY_TOKEN && url.searchParams.get("hub.verify_token") === env.VERIFY_TOKEN
        ? new Response(url.searchParams.get("hub.challenge"))
        : new Response("no", { status: 403 });
    }

    const raw = await req.text();
    if (!(await validSig(raw, req.headers.get("x-hub-signature-256"), env.APP_SECRET)))
      return new Response("bad sig", { status: 401 });

    let body;
    try { body = JSON.parse(raw); } catch { return new Response("bad json", { status: 400 }); }

    for (const entry of body.entry ?? []) {
      // 1) someone commented
      for (const ch of entry.changes ?? []) {
        if (ch.field !== "comments") continue;
        const { id: commentId, text = "", from } = ch.value;
        // skip our own replies (avoids loops); check both id and username, webhook id format can differ
        if (from?.id === env.IG_USER_ID || from?.username === env.IG_USERNAME) continue;
        const key = matchKey(text);
        if (!key || !LINKS[key]) continue;
        const c = copy(key);
        await api(env, `/${commentId}/replies`, { message: pick(c.replies) });
        await sendDM(env, { comment_id: commentId }, card(c.card, [
          { type: "postback", title: c.button, payload: `GET:${key}` },
        ]));
      }

      // 2) someone tapped a button in the DM
      for (const m of entry.messaging ?? []) {
        const p = m.postback?.payload;
        if (!p?.startsWith("GET:")) continue;
        const key = p.slice(4);
        const userId = m.sender.id;
        if (!LINKS[key]) continue;
        const c = copy(key);
        if (await isFollower(env, userId)) {
          await sendDM(env, { id: userId }, { text: c.done(LINKS[key]) });
        } else {
          await sendDM(env, { id: userId }, card(c.gate, [
            { type: "web_url", title: c.follow, url: `https://instagram.com/${env.IG_USERNAME}` },
            { type: "postback", title: c.followed, payload: p },
          ]));
        }
      }
    }
    return new Response("ok");
  },
};
