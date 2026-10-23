# AI renders (Tower Studio, research P13-M05)

The renders use **your own Codex CLI and ChatGPT plan**. Nothing runs until you start it.

1. **Prepare.** In Tower Studio, go to Present → *AI render* and pick a view, a style and notes. Then press **Prepare AI render**. Two files land in your Downloads folder: `tsr-<date>-<time>.png` (the capture) and `tsr-<date>-<time>.json` (the prompt file).
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
5. **Import.** In Present → *AI render*, press **Import AI results** and pick the `.ai.png` and `.ai.json` files.
   - Each render joins the shot strip and the boards, always labelled *AI-generated* and linked to its capture.
   - Before you accept a render, tick its review checks: same massing, context towers, no invented marks, and the sun.

Every prompt keeps these lines, and you can't remove them:
- same massing, same camera, label nothing
- no text, logos, real people or imitation of Indigenous art

Each image is an unpublished design and goes to OpenAI under your ChatGPT plan's data settings.

The two older files here (`test_clay_tower_01.png`, `codex_last_message.txt`) are from the first Codex test on 21 Oct.
