# Getting a node into Tower Design Toolkit

## Import it into your own Tower Design Toolkit (works today)

1. **Save the package** as a `.json` file, e.g. `tower-width.json`. If your assistant gave you a code block, copy it into a text editor and save it with the `.json` ending.
2. **Open Tower Design Toolkit** (run locally with `npm run dev`, then open http://localhost:5173).
3. In the **node library** on the left (Massing or Schematic stage), scroll to **My nodes** and click **Import node**. You can also open **Build your own node** at the bottom of the library and pick the **Import a node** tab.
4. **Choose the file**, drop it on the box, or paste the JSON (a ```json code block is fine). Click **Check package**.
5. **Read the report:**
   - **Problems to fix** (red): the node can't be added until they're fixed. Click **Copy problems for your AI** and paste them back to your assistant; it will send a corrected package.
   - **Worth a look** (amber): the node can still be added, e.g. a test whose expected value differs from what Tower Design Toolkit computes.
   - **Preview**: what each metric gives on the sample designs, with its flag. Check that the results make sense.
6. Click **Add to My nodes**. The node is switched on and selected; its results appear in **Results & evidence** on the right, marked **Community · Unverified until reviewed**.
7. In the results you can change the node's **parameters**, **download** the package again, or **remove** it.

Imported nodes live in this browser on this computer only (local storage). Clearing site data removes them, so keep your `.json` file. To update a node, import a new version with the same `id`: it replaces the old one and keeps your parameter edits.

## Share it with your team (works today)

Send the `.json` file. Each teammate imports it the same way. Nothing is uploaded anywhere.

## Submit it to the shared registry (coming, not open yet)

There is no registry or upload server yet, and Tower Design Toolkit never sends your node anywhere. The plan, so you can prepare:

1. **Pull request:** add your package as `registry/nodes/<id>/<version>.json` to the Tower Design Toolkit repository on GitHub (the link will be in the app when the repository is public).
2. **Automatic checks:** the same schema check and tests as the import, run on the pull request.
3. **Review:** a reviewer opens every source flagged *verified*, checks the page or clause, and corrects flags where needed. Reviewed nodes lose the *Unverified until reviewed* mark.
4. **Comments:** each registry node gets its own discussion thread, so users can report problems and suggest sources.
5. **Library:** merged nodes appear for everyone under *Community*, with their author, version, licence and review status.

Until then, the best preparation is a package with honest flags, a source for every threshold, and tests on the sample designs.
