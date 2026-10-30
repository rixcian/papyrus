# What do the library and reader screens look like?

Type: prototype
Status: resolved
Blocked by: 01, 02

## Question

Prototype the main screens with coss ui and the chosen reader engine to react to: the profile picker, the library (grid/list, filters by author/series/tag/shelf, search), Book detail (metadata, Files, edit, Share, mark Offline Book), the reader (chrome, TOC, typography/theme panel, search, Highlight + Note interaction, Bookmarks), and the mobile/PWA layout. Decide the navigation structure and which interactions are v1.


Note: [Reading-state model](08-reading-state-model.md) adds Read Status filters to the library (Currently reading / Finished, plus manual Mark as finished), a "Jump there?" toast for progress from another device, a picker for overlapping Highlights, and a per-Book panel inside the reader for Highlights, Notes and Bookmarks.

## Answer

Decided by the agent: on 2026-10-30 the user handed the remaining decisions to the agent (see map Notes). Resolved as a written screen outline instead of a code prototype. The outline is the prototype; the real UI is built straight from it.

**Navigation (routes)**
- `/welcome`: first-run "Create your first Profile". `/profiles`: the picker, with an "+ Add Profile" tile.
- `/`: the **library**. `/books/:bookId`: **Book detail**. `/read/:fileId`: the **reader**, full screen with no app chrome. `/settings`: Profile, Imports, This device.
- On mobile, a bottom bar has Library / Shelves / Settings. On desktop, the library has a collapsible left sidebar for filters and shelves.

**Library**
- **Top bar**: search across title, authors, series, tags and description; a sort control (recently added, title, author, series); a grid/list toggle; an Upload button. Dropping files anywhere on the library starts an upload. The Profile avatar menu has Switch Profile and Settings.
- **Filters**, in the sidebar on desktop or a sheet on mobile: Mine / Shared with me / All; Read Status (Unread, Reading, Finished); Authors, Series, Tags and Shelves (each a searchable list); Hidden.
- A **Continue reading** row at the top lists the Profile's Books with Read Status "reading", most recent first.
- **Grid**: cover, title, author, a progress bar and an Offline badge, virtualised. **List**: compact rows with series and index.
- A long press on mobile or a checkbox on desktop starts **multi-select**, with bulk actions: Add to shelf, Share (own Books only), Make available offline, Hide (Shared Books only), Delete (own Books only).
- Filtering by a series sorts by series index.
- An **upload tray** in the bottom corner shows each file's progress and result: "New Book", "Added to <Book>" or "Already in your library".

**Book detail**
- Cover, title, authors, series #index, tags, description, and "Shared by X" for Recipients.
- **Read** opens the File read most recently, or the preferred format (epub before azw3 before mobi). There is a Read Status control.
- **Files** list: format, size, Read, Download, and Remove/Split (owner only).
- **Owner actions**: Edit metadata (a form, plus "Find online"), Share (named Profiles or everyone, showing current targets), Merge into…, Delete.
- **Everyone**: Shelves, an Offline toggle, Export highlights (Markdown). **Recipient only**: Hide.

**Reader**
- **Chrome** toggles on a tap in the centre. The left and right edges turn pages, arrow keys turn pages, and swipe works in paginated mode.
- **Top bar**: back, title/chapter, TOC, search, bookmark toggle, Aa (typography and theme), and an annotations panel.
- **Bottom bar**: a progress slider with the chapter name and %.
- **Panels** open as a side sheet on desktop and a bottom drawer on mobile:
  - TOC.
  - Search: on demand, cancellable, streaming results, with a "Searching… x%" indicator.
  - Aa: font family, size, line spacing, margins, light/sepia/dark, paginated/scroll.
  - Annotations: Highlights with Notes and Bookmarks, tap to jump, with an Export button.
- **Selecting text** opens a popover: four colour swatches (yellow, green, blue, pink), Note, Copy. Tapping a Highlight opens the same popover with Delete. Overlapping Highlights show a small list first.
- **Toasts**: "Jump there?" for a newer position from another device, and offline/sync status.

**Settings**
- **Profile**: rename, colour, and delete with typed confirmation.
- **Imports**: this Profile's import folder path, recent results and failures.
- **This device**: Offline Books with the storage used, "Remove all offline", persistence state, install instructions for this platform, and the app version with "Update available — reload".

**Components**: coss ui for dialogs, sheets/drawers, menus, popovers, toasts, combobox and slider, plus `@tanstack/react-virtual` for the grid. The dropzone is a hand-written native drag-and-drop with `<input type=file multiple>`, so no extra library.
