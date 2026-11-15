# Paste this into your AI coding agent

Open this folder in Claude Code, Codex, Cursor, Gemini CLI (or any agent that can run shell commands), then paste everything below the line.

---

You are setting up the Instagram "comment keyword -> public reply + DM with link (follow-gated)" automation in this folder, on Cloudflare Workers, for me. I am a beginner.

1. Read `AGENTS.md` and `README.md` in this folder and follow `AGENTS.md` exactly.
2. Start by asking me, in one short list: my Instagram handle, the keyword(s) people will comment (in which languages), the link each keyword should send, and the reply texts (or offer to write them for me in my language and tone).
3. Edit only the config block at the top of `src/index.js` (and update `test.mjs` to match), then run `npm install` and `npm test` until it passes.
4. Guide me step by step, one step at a time, through the Meta developer app setup and the Cloudflare login. I do the clicking and logging in myself. NEVER ask for or type my passwords or 2FA codes. Tell me exactly what to click and what to copy.
5. Have me set the secrets with `npx wrangler secret put` (APP_SECRET, IG_TOKEN, IG_USER_ID, IG_USERNAME, VERIFY_TOKEN). Never write secrets into files that get committed.
6. Deploy with `npm run deploy`, check `/health`, set up the webhook with me (fields `comments` and `messaging_postbacks`), and test end to end with a second Instagram account added as Instagram Tester.
7. At the end, remind me about the 60-day token refresh and what Meta App Review means for going Live.

Do not make anything public and do not post on my Instagram without asking me.
