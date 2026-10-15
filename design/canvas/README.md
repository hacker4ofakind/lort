# Approved page designs

Copies of the artboards on the "Pages" page of the Lort design canvas
(https://claude.ai/artifact/EYjbK9CRgK2XvR1gFQov1v), taken when the designs were approved.
The canvas stays the live source; these files are for reading while implementing.

Each `.dc.html` is Claude Design markup: `<x-import component-from-global-scope="Lort.X" prop="{{value}}">`
mounts the design-system component `X` from `design/components/src` with those props,
`<sc-for>` repeats its children for a list, and the demo data lives in `renderVals()` at the bottom.
CSS variables are the tokens in `DESIGN.md`.

| Prefix | Meaning |
|---|---|
| `P-` | Public board pages (`P-Landing` is `/lort-landing`) |
| `D-` | Admin dashboard pages |
| `S-` | Loading skeletons |
| `L-` | Light-theme versions |
