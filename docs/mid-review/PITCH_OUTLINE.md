# Mid-review pitch outline (Fri 23 Oct, LRS 309)

Structure required by the brief (p.4): **Background, Problem, Opportunities AI can bring, Proposal, Methodology, Possible outcome.** Format is open. The suggestion is 8–10 slides, about 6 minutes, then a live demo. *Speaker text is yours to write; these are the claims and the evidence behind each one.*

| # | Slide | Key claims | Evidence / visual |
|---|---|---|---|
| 1 | **Title** | Working title (TBD), Ruijie Liu and Sinnie Choi | Clay test render (label: *AI-generated, illustrative*) |
| 2 | **Background**: the practice | Vancouver is rewriting its Higher Buildings Policy; VTC asks for 244–305 m towers. The jury weights human scale 40%, cultural context 30%, design 20%, urban integration 10% | VTC brief pp.14, 19, 33; toolbench photos |
| 3 | **Problem**: the as-is workflow | 10 steps across 5+ tools. Pain points: (a) authority and dates, (b) lost iteration, (c) option narrowing, (d) semantic transfer, (e) divergent versions, (f) false certainty, (g) responsibility | Your `01-as-is-workflow.svg` |
| 4 | **Problem**: where existing tools stop | Forma, TestFit and Rhino/GH/Ladybug don't know Vancouver's rules; your own tools each cover one step; *no tool covers City enquiry or decision* | Your `02-case-study.svg` (+ new Context Model row) |
| 5 | **Opportunities AI brings** | (1) Read policy PDFs and Council reports into *cited* parameters (19 false assumptions caught in one research packet); (2) critique loops by expert subagents; (3) renders from your own viewport; (4) write code for designers. **What AI does NOT do:** compute heights or shadows (that's deterministic code), decide compliance, or speak for Nations | Research logs `04 Tool Plan/research/`; FALSE ASSUMPTION flags |
| 6 | **Proposal**: one platform, web-first | Basic → Advanced → Present modes; Grasshopper-like node canvas; every node categorized; community uploads and comments; **Vancouver Context Model first**; your existing tools become nodes | Tool-logic diagram (updated); node-category list |
| 7 | **First attempt** (live) | View-cone height check on real City data: estimate, or *stop* with "no estimate" | Demo, or the backup recording |
| 8 | **What it showed** | City layer has empty height fields; about 80% of CBD lacks parameters; base-model north is 45° off. **Next:** City Request 0 | `FIRST_ATTEMPT_SPEC.md` findings |
| 9 | **Methodology** | Sources graded and cited; 3+ expert critique rounds per module; evaluation cases (typical, boundary, out-of-scope, repeated); user sessions with VTC entrants from 6 Nov; open source | Research round logs; evaluation table |
| 10 | **Possible outcome and timeline** | Nov 13: working core (Context Model + view cones + one evaluation node). Nov 27: install from the README (a URL). Dec 10: live tool with Present mode. Roadmap: desktop and Rhino panel later, same code | `PLAN.md` milestones |

## Questions to invite from reviewers

- Which height authority should win when the City data is incomplete: stop, or show a range?
- Is the community module model (uploads plus comments) credible for a studio, or should it be curated?
- Which VTC entrants could be the first users? (The user must be matched by 6 Nov.)

## Honesty checklist (assessment criteria, brief p.6)

- [ ] The as-is workflow and existing tools are shown on their own terms, including what stays a judgment.
- [ ] The diagram shows what is delegated: code, AI, person.
- [ ] Every number on the slides points to a source, or is labelled an estimate or assumption.
- [ ] AI images are labelled.
- [ ] Partner and classmate tools are credited (Sinnie's Downtown Massing Tool; Willem Girard's Solar Shading Explorer).
