# AI renders (Tower Studio, research P13-M05)

The renders use **your own Codex CLI and ChatGPT plan**. Nothing runs until you start it.

## One click, when the app runs on this computer (3 Nov 2026)

When the app runs from `npm run dev` or `npm run preview`, the **Render** tab in Present does everything itself:
- Pick a frame and a style, press **Render with my ChatGPT plan**, and confirm.
- The local render helper (`tower-studio/render.plugin.ts`) puts the capture and its prompt file in `inbox/` and runs `tools/render.mjs` for that one item.
- The result comes back into the tab for review, and it is also saved in `outbox/` with its manifest and a line in `render-log.jsonl`.

The helper only answers the app on this computer, and the tab asks before every render. On the published website there is no helper, so use the steps below.

## By hand (published website, or without the helper)

1. **Prepare.** In Tower Design Toolkit, go to Present → *Render*. Pick a frame, a style and notes. Then press **Prepare the files**. Two files land in your Downloads folder: `tsr-<date>-<time>.png` (the capture) and `tsr-<date>-<time>.json` (the prompt file).
2. **Collect.** In a terminal in the `ARCH540 AI Studio` folder, run:
   ```
   node "tower-studio/tools/render.mjs" --collect
   ```
   This copies the pairs into `renders/inbox/`. The originals stay in Downloads.
3. **Check.** To see what would be sent, run:
   ```
   node "tower-studio/tools/render.mjs" --dry-run
   ```
   This sends nothing and doesn't use your plan.
4. **Render.** Run:
   ```
   node "tower-studio/tools/render.mjs"
   ```
   It asks before it uses your plan. Each result goes to `renders/outbox/` as `<id>.ai.png` plus `<id>.ai.json`, and each call adds one line to `render-log.jsonl`.
5. **Import.** In Present → *Render*, press **Import results** and pick the `.ai.png` and `.ai.json` files.
   - Each render joins the shot strip and the boards, always labelled *AI-generated* and linked to its capture.
   - Before you accept a render, tick its review checks: same massing, context towers, no invented marks, and the sun.

Every prompt keeps these lines, and you can't remove them:
- same massing, same camera, label nothing
- no text, logos, real people or imitation of Indigenous art

Each image is an unpublished design and goes to OpenAI under your ChatGPT plan's data settings.

The two older files here (`test_clay_tower_01.png`, `codex_last_message.txt`) are from the first Codex test on 21 Oct.
