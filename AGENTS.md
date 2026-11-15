# AGENTS.md: set this up for the user, end to end

You are helping a (possibly non-technical) user run an Instagram "comment keyword -> public reply + DM with link, follow-gated" automation on Cloudflare Workers. The only code is `src/index.js` (config block at the top) and `test.mjs`. Read `README.md` first for the full flow, Meta steps and troubleshooting.

## Hard rules

- **Never ask for, type, or handle the user's passwords** (Instagram, Meta, Cloudflare), 2FA codes, or card details. The user does all logins and clicks in their own browser.
- Secrets (`APP_SECRET`, `IG_TOKEN`, `IG_USER_ID`, `IG_USERNAME`, `VERIFY_TOKEN`) go only into `wrangler secret put` or `.dev.vars`. Never into git, README, code, chat logs, or command history you echo back. Prefer having the user run the `secret put` commands themselves (it prompts for the value); if they paste a value to you, use it once and do not repeat it.
- Do not make the repo public, publish, or post anything on the user's Instagram without asking.
- Don't invent Meta permissions or fields. Use only: permissions `instagram_business_basic`, `instagram_business_manage_comments`, `instagram_business_manage_messages`; webhook fields `comments`, `messaging_postbacks`. If Meta's dashboard looks different from the README, say so and check Meta's current docs.
- Keep Instagram limits: button title max 20 characters, card title max 80, DM text max 1000.

## Steps

### 1. Gather requirements (ask the user, one short batch)
- Instagram handle (no `@`).
- For each offer: the **keyword(s)** people will comment (all spellings, English and/or Arabic), the **link** to send, and optionally the reply copy.
- Reply copy: 2-4 short public replies (random pick), card text, button text (<=20 chars), the DM text with the link. Offer to write them in the user's language and tone; show them and get approval.
- Whether a keyword must be a whole word (e.g. short words like "AI").

### 2. Edit the config
Edit only the config block at the top of `src/index.js`: `LINKS`, `KEYWORDS`, `WHOLE_WORD`, `COPY`. Remove the example `GUIDE`/`CHECKLIST` entries and anything pointing at example.com once real ones exist. Also update the expected values in `test.mjs` (it asserts the example copy/links) so tests cover the user's real keywords.

### 3. Test
```bash
npm install
npm test        # must print "all tests pass"
```
Fix failures before continuing.

### 4. Meta setup (user does the clicks, you guide)
Walk the user through `README.md` section 2, one step at a time, asking them to confirm each. They must: create a Business-type Meta app, add the Instagram product -> "API setup with Instagram login", add their professional account, generate a token, and copy: IG token, Instagram account ID, Instagram app secret. Remind them: the Instagram account must be Professional (Business/Creator). They invent a random `VERIFY_TOKEN` (you can generate one for them with `node -e "console.log(crypto.randomUUID())"`).

### 5. Cloudflare setup and secrets
- User runs `npx wrangler login` (browser opens; they log in).
- User runs `npx wrangler secret put <NAME>` for `APP_SECRET`, `IG_TOKEN`, `IG_USER_ID`, `IG_USERNAME`, `VERIFY_TOKEN`, pasting values when prompted.

### 6. Deploy and verify
```bash
npm run deploy
```
Note the printed `https://ig-comment-dm.<sub>.workers.dev` URL, then check:
- `GET <url>/health` -> `ok: true` and the right `username`. If not, the token/ID is wrong.
- `GET <url>/privacy` -> page loads.
- Handshake: `GET <url>/?hub.verify_token=<VERIFY_TOKEN>&hub.challenge=1` -> body `1` (the user can give you the token for this one check, or run it themselves). A wrong token must give 403.

### 7. Webhook (user does the clicks)
In Meta -> API setup with Instagram login -> Configure webhooks: Callback URL = Worker URL, Verify token = `VERIFY_TOKEN`, subscribe fields `comments` and `messaging_postbacks`, make sure the account is subscribed. Set Privacy Policy URL to `<url>/privacy`. Then re-check `/health`: `webhook_fields` includes both fields.

### 8. End-to-end test
Explain the app mode caveat: in Development mode only users with a role on the app (admin/developer/tester) trigger webhooks, so the user should add a second Instagram account as Instagram Tester and test with it. Have them comment a keyword; confirm they see the public reply + DM, tap the button, and get either the follow gate or the link. If anything fails, read Worker logs (`npx wrangler tail`) and use the README troubleshooting table.

### 9. Wrap up
Tell the user: tokens expire after ~60 days and how to refresh (README "Token expiry"); going Live for the public needs Meta App Review; how to add a keyword later. Offer to commit the work to their own private Git repo (never commit `.dev.vars`).

## Code map
- `matchKey(text)`: keyword match (case-insensitive, optional whole word).
- `validSig(raw, header, secret)`: constant-time `X-Hub-Signature-256` check.
- `default.fetch`: `/health`, `/privacy`, GET handshake, POST webhook (comments -> public reply + private-reply DM with postback button `GET:<KEY>`; postback -> `is_user_follow_business` -> link or follow gate).
- Own comments (`from.id == IG_USER_ID` or `from.username == IG_USERNAME`) are skipped to avoid loops.
