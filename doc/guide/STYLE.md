# How the guide is written

The guide is the manual of the two editors. One file per chapter: `doc/guide/md/<nn-slug>.md` and `doc/guide/mm/<nn-slug>.md`, in the chapter order and with the section names of the Elektron manual. `scripts/mdmm-guide.mjs` makes the web pages and the print page from them; `scripts/mdmm-guide-pdf.sh` prints the PDFs. `scripts/mdmm-features-check.mjs` checks the files.

Every sentence is ours. Never copy text, pictures, the logo or the fonts of the Elektron manuals (`doc/manuals/`, local only). Copy their chapter order, their section names and their page layout, nothing else.

## Voice

The tone is that of the Elektron manuals: plain, technical, direct.

- Short declarative sentences. One fact per sentence.
- Second person: "you". Active voice. British English.
- Steps are imperative: "Press [SPACE]." "Click **Duplicate**."
- Name the control, then say what it does: "**Repeat** sets how many times the row plays."
- Say what you see happen after a step: "The cell reads HALT."
- Where the editor works differently from the machine, say so plainly: "On the machine you hold [FUNCTION]; in the editor you click **Duplicate**."
- A gap the reader would look for gets one plain sentence: "You cannot rename a song in the editor yet."
- NOTE paragraphs state facts. TIP paragraphs give one way of working.

Never write:

- waffle, marketing or enthusiasm; rhetorical questions; exclamation marks;
- the words "simply", "just", "easily", "seamless", "seamlessly", "powerful", "intuitive";
- "let's", "dive into", "whether you're", "it's worth noting", "in other words";
- the em dash or the en dash (U+2014, U+2013). Use a full stop, a comma, a colon or brackets. Ranges are written "1 to 64";
- status marks, row ids, journey names, code names or file names in the visible text.

`scripts/mdmm-features-check.mjs` fails on a dash, an exclamation mark or a banned word in a chapter.

## Markup

| Write | For | Shows as |
|---|---|---|
| `# 17. The song mode` | the chapter title, once, first line | the big number and title |
| `<!-- summary: ... -->` | one line under the title: what the chapter is for | the contents page |
| `## SONG EDITING` | a section, named as in the manual | a capital heading |
| `### Add patterns` | a part of a section | a smaller heading |
| `<!-- rows: MM-260 MM-261 -->` | after a heading: the feature rows the section covers | nothing (checked by the scripts; the manual page in the margin) |
| `1.` `2.` | the steps of a procedure | numbered steps |
| `-` | a list | bullets |
| `[SPACE]`, `[PLAY]` | a key, of the computer or the machine | **[SPACE]** |
| `<PLAY>` | a field on the LCD or a light | a coloured LCD word |
| `**Duplicate**` | a control on the screen | bold |
| `NOTE:` `TIP:` | at the start of a paragraph | a boxed note |
| `![The arrangement](shot:mm-song-arrangement)` | a screenshot, on its own line | the snapshot, or a placeholder with the caption until slice 5 makes it |
| a simple pipe table | a few lines that compare | a table |

Keys are written as on a Mac: [⌘] is [CTRL] on Windows and Linux.

A screenshot may sit between two steps: number the steps after it on from the ones before (`3.`), and the list goes on.
