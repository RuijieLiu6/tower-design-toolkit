# Evidence flags

Tower Design Toolkit shows a flag next to every result, always as an icon **and** a word, so a reader can tell a sourced limit from a guess at a glance. A node is only as trustworthy as its weakest flag, so be strict.

| Flag | In the package | Use it when | Shown as |
|---|---|---|---|
| **Verified** | `"verified"` | Someone opened the source, and you can say where the number is: page, clause, table or a quoted sentence. Needs `source.page` or `source.url`. | Green, check badge |
| **Team assumption** | `"team_assumption"` | The designer or team chose the value (a preset, a design target, a reasonable default). Write who, when and why in the source label: `Team assumption: R. Liu, 22 Oct 2026, typical Vancouver office depth`. | Amber, people icon |
| **Unverified** | `"unverified"` | The number comes from somewhere specific, but nobody has opened and checked it: recalled from a course, a summary, a secondary source, or your own memory. Say so in the source. | Grey hatched, question shield |
| **Unresolved** | `"unresolved"` | Nobody knows the number yet. Give no `good` or `bad`; the source says what was searched or who could answer. The node shows the value with **Unknown**. | Olive, dashed circle |
| **False assumption** | in `falseAssumptions` | Something believed to be true turned out wrong. Keep the claim, its correction and the source of the correction. | **Magenta**, octagon: always visible |

## Rules

1. **Never upgrade a flag to make a node look better.** If in doubt, pick the weaker flag.
2. **You (the assistant) can't make something verified from memory.** A number you recall is `unverified` until the designer or a document in this conversation confirms page and clause.
3. **A sourced number from the designer is verified only if they give the page or clause.** "It's in the CDDG somewhere" is `unverified`.
4. **Team assumptions are fine, and honest.** Many good design tools run on presets. The point is to label them so they can be changed.
5. **No threshold is better than an invented one.** Use `unresolved` and say what is missing.
6. **A false assumption is never deleted.** When a correction arrives, move the old belief into `falseAssumptions` and give the corrected value its own flag.
7. **Fail needs a sourced limit.** Without a sourced `bad` value, a node can say *Check* but not *Fail*.

## Community nodes are unverified until reviewed

Tower Design Toolkit marks every imported node **Community · Unverified until reviewed**. A threshold the author flags `verified` is shown as *Unverified* with the note "author: verified" until a reviewer has opened the source. This is not a judgment of the author; it means no one can import a green result without review. When the shared registry opens, review will check every verified claim against its page or clause.
