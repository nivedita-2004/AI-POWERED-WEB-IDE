# VibeCode Editor: Project Guide

This guide explains the application as it is implemented in this repository. It is written for someone learning the codebase, so it starts with the big picture and then follows the files in the order the application uses them.

> Scope: the application code is described file by file in connected feature groups. `vibecode-starters/` is a separate collection of complete example projects, not the source code of the VibeCode editor itself; its role and all of its top-level starter folders are described in a separate section. Dependency folders such as `node_modules/` and generated build output are not application source.

## 1. What This Project Does

VibeCode Editor is a browser-based workspace for starting small web projects from templates, editing their files, running them, and viewing the result beside the code. A signed-in user can:

1. Sign in with Google or GitHub.
2. Create a playground by choosing one of the available templates.
3. Open the playground's file tree and edit a file in Monaco Editor.
4. Save edits to the project's stored file tree.
5. Run the project in a browser-side WebContainer, use its terminal, and see its web server in a preview frame.
6. Ask the AI chat assistant a question or request inline code completion.

The important idea is that this is not just a code editor screen. It connects project management, saved project data, an in-browser development environment, and AI features into one workflow.

## 2. The Idea Behind Building It

Many people have an idea for a web app but do not want to spend their first few minutes configuring a local development environment. VibeCode aims to shorten that first step: choose a starter, open a working browser IDE, make a change, and immediately see the running result.

The project combines a few kinds of tools that normally live in separate places:

- A dashboard keeps track of projects and templates.
- Monaco provides the editing experience familiar from desktop code editors.
- WebContainers run Node-based starter projects inside a compatible browser.
- Xterm.js gives the user a terminal-like window for those browser-side processes.
- Prisma and MongoDB store the account, project details, favorites, and saved files for the VibeCode service.
- AI endpoints provide chat responses and context-aware inline completion.

The app therefore has three different execution places. Keeping them separate makes the architecture easier to understand:

| Place | What runs there | Example |
| --- | --- | --- |
| Browser UI | React components, Monaco, file explorer, chat panel | `modules/playground/components/playground-editor.tsx` |
| VibeCode server | Next.js pages, route handlers, server actions, database calls, AI provider requests | `app/api/chat/route.ts`, `modules/playground/actions/index.ts` |
| User project runtime | The selected starter's files and its Node development server inside WebContainer | Started by `modules/webcontainers/components/webContainer-preview.tsx` |

The WebContainer runtime is not the Next.js server. It runs the user's selected project in their browser. The Next.js backend is responsible for login, project records, saved file data, template scanning, and proxying AI requests.

## 3. A Quick Walk Through the Main Flow

### Create a project

1. `/dashboard` calls `getAllPlaygroundForUser()` and displays the current user's projects.
2. `modules/dashboard/components/add-new.tsx` opens the template selector.
3. `modules/dashboard/components/template-selecting-model.tsx` lets the user choose React, Next.js, Express, Vue, Hono, or Angular and enter a project name.
4. The `createPlayground()` server action in `modules/dashboard/actions/index.ts` creates a `Playground` database record. At this point, it stores project metadata; it does not copy all starter files into MongoDB.
5. The browser navigates to `/playground/[id]`.

### Load files and start the project

1. `modules/playground/hooks/usePlayground.tsx` loads the project record and checks whether it already has saved `TemplateFiles` content.
2. If saved content exists, the hook parses it. Otherwise, it requests `/api/template/[id]`.
3. `app/api/template/[id]/route.ts` verifies the signed-in owner, maps the template enum to a directory using `lib/template.ts`, and scans that starter directory using `scanTemplateDirectory()` in `modules/playground/lib/path-to-json.ts`.
4. The browser stores the resulting nested file/folder tree in Zustand through `modules/playground/hooks/useFileExplorer.tsx`.
5. `modules/webcontainers/hooks/useWebContainer.ts` boots WebContainer. `webContainer-preview.tsx` converts the tree to WebContainer's mount format, mounts it, runs `npm install`, then runs `npm run start`.
6. When WebContainer reports `server-ready`, its local URL is shown in an iframe.

### Edit and save a file

1. Clicking a file in `playground-explorer.tsx` opens it through the Zustand file-explorer store.
2. `playground-editor.tsx` displays its content in Monaco. Changes update the open-file state and mark that file as unsaved.
3. Save in `/playground/[id]/page.tsx` finds the file's path, updates the saved tree, writes the content into WebContainer, and calls `saveTemplateData()`.
4. `SaveUpdatedCode()` in `modules/playground/actions/index.ts` checks ownership and upserts the file tree in MongoDB through Prisma.

### Ask AI for help

- Chat: `ai-chat-sidebarpanel.tsx` posts the typed message and recent chat history to `/api/chat`. The route calls `generateAIText()` in `lib/ai.ts` and returns a complete, non-streamed answer.
- Inline completion: the editor asks `useAISuggestion.tsx` to post the current file text and cursor position to `/api/code-completion`. The route examines nearby code, builds a prompt, calls the same AI helper, and returns a suggestion for Monaco to display.

## 4. Frontend and Backend: Where the Boundary Is

### Frontend / browser code

Files marked with `"use client"` run in the browser and can use React state, browser APIs, Monaco, WebContainer, and Xterm. Most feature UI is under `modules/`, with reusable visual building blocks under `components/ui/`.

Client code can call server actions imported from feature modules, or send HTTP requests to `/api/...`. It should not connect to MongoDB or hold provider secrets.

### Backend / server code

Next.js server components can load information before rendering. Route handlers under `app/api/` handle HTTP requests. Files beginning with `"use server"` export server actions that the UI can call for database operations.

The database client is created in `lib/db.ts`. Database reads and writes are performed by `modules/auth/actions/`, `modules/dashboard/actions/`, and `modules/playground/actions/`. AI provider calls are made from `lib/ai.ts` on the server, so `AI_API_KEY` is not exposed to browser code.

### The user's project is a third runtime

The selected starter is mounted into WebContainer and started inside the browser. It is separate both from the VibeCode frontend and from the VibeCode server. The iframe preview points at the URL WebContainer announces; it is not a page rendered by the VibeCode Next.js app.

## 5. Connected Files, Grouped by What They Do

### A. App shell, routes, and shared page setup

These files create the Next.js route structure and wrap the UI with shared providers.

| File | What it does |
| --- | --- |
| `app/layout.tsx` | Root layout. Loads global CSS and Geist fonts, reads the current auth session, and wraps every route in `SessionProvider`, `ThemeProvider`, and the Sonner toast container. |
| `app/globals.css` | Imports Tailwind CSS and animation utilities, defines light/dark color variables, and applies shared base styles. |
| `app/(root)/page.tsx` | Landing page content: hero image, short introduction, and a link to the dashboard. |
| `app/(root)/layout.tsx` | Landing-page layout with the shared home header/footer and decorative background. |
| `app/dashboard/layout.tsx` | Dashboard wrapper. Loads the user's projects for the sidebar and maps template names to icons. |
| `app/dashboard/page.tsx` | Dashboard page. Loads project records and connects create, edit, delete, duplicate, empty-state, and project-table UI. |
| `app/playground/[id]/layout.tsx` | Adds the sidebar provider around an individual playground route. |
| `app/playground/[id]/page.tsx` | Main IDE coordinator. Connects project loading, file-tree state, save operations, Monaco, AI controls, WebContainer preview, terminal, tabs, and split panels. |
| `app/(auth)/auth/layout.tsx` | Minimal centered layout for authentication pages. |
| `app/(auth)/auth/sign-in/page.tsx` | Sign-in page content with an image and the provider sign-in form. |
| `modules/home/header.tsx` | Site header with home link, docs/API links, theme control, and user menu. |
| `modules/home/footer.tsx` | Site footer and its social-link area. |
| `components/providers/theme-provider.tsx` | Small wrapper around `next-themes`, used by the root layout. |
| `hooks/use-mobile.ts` | Detects whether the viewport is below the shared mobile breakpoint; used by responsive sidebars. |
| `lib/utils.ts` | Defines `cn()`, which combines conditional class names and resolves Tailwind class conflicts. |

The `(root)` and `(auth)` folder names are Next.js route groups. Parentheses organize routes without adding those names to the URL. For example, `app/(root)/page.tsx` renders `/`, not `/(root)`.

### B. Sign-in, user identity, and access control

This group authenticates people and makes their identity available to pages and server actions.

| File | What it does |
| --- | --- |
| `auth.config.ts` | Registers GitHub and Google as the NextAuth providers using environment variables. |
| `auth.ts` | Builds the full NextAuth setup with JWT sessions, Prisma adapter, sign-in/account handling, and callbacks that put the user's ID and role into session/token data. |
| `middleware.ts` | Applies route access rules. It redirects signed-out users to `/auth/sign-in`, redirects signed-in users away from auth pages, and leaves the auth API route available to NextAuth. |
| `routes.ts` | Holds the public/auth route lists and redirect constants used by middleware. |
| `app/api/auth/[...nextauth]/route.ts` | Exposes NextAuth's GET and POST handlers at the standard auth API path. |
| `modules/auth/actions/index.ts` | Server-side identity helpers: look up a user by ID, find an account, and get the current authenticated user. |
| `modules/auth/types.ts` | Types the children accepted by the logout control. |
| `modules/auth/hooks/use-current-user.ts` | Reads the current user from the browser's NextAuth session. |
| `modules/auth/components/sign-in-form-client.tsx` | Renders Google and GitHub sign-in buttons. Its form actions call the server-side `signIn()` helper. |
| `modules/auth/components/user-button.tsx` | Displays the signed-in user's avatar/email and exposes the logout option. |
| `modules/auth/components/logout-button.tsx` | Calls NextAuth `signOut()` and refreshes the current route. |
| `next-auth.d.ts` | Extends NextAuth's session, user, and JWT TypeScript types with the app's role field. |

Access-control detail to remember: `routes.ts` currently defines `publicRoutes` as an empty list. Middleware therefore protects `/` as well as the dashboard and playground routes, even though the root route contains a landing page. Also, route middleware is not a replacement for checking ownership inside database operations; the data actions and template API make those checks themselves.

### C. Dashboard and project management

These files let a signed-in user choose a starter and manage project records.

| File | What it does |
| --- | --- |
| `modules/dashboard/types.ts` | Describes the user and project shapes expected by dashboard components. |
| `modules/dashboard/actions/index.ts` | Server actions for listing a user's playgrounds, creating/editing/deleting/duplicating projects, and adding/removing favorites. Operations use the authenticated user ID. |
| `modules/dashboard/components/add-new.tsx` | Opens the template selector, calls `createPlayground()`, then navigates to the new playground. |
| `modules/dashboard/components/template-selecting-model.tsx` | Two-step template picker: search/filter starter choices, choose one, and set a project name. It translates UI template IDs to the database enum. |
| `modules/dashboard/components/add-repo.tsx` | Presentational “Open GitHub Repository” tile. It does not currently import a repository or perform an action. |
| `modules/dashboard/components/project-table.tsx` | Lists projects and provides open, duplicate, edit, favorite, copy-URL, and delete controls. It calls the callbacks supplied by the dashboard page. |
| `modules/dashboard/components/marked-toggle.tsx` | Toggles a project's favorite state through `toggleStarMarked()` and refreshes the route. |
| `modules/dashboard/components/dashboard-sidebar.tsx` | Renders Home, Dashboard, Starred, and Recent navigation using project data passed by the dashboard layout. |
| `modules/dashboard/components/empty-state.tsx` | Empty-project message shown when a user has no playgrounds. |

Project creation saves metadata first. The file tree is generated from the matching starter the first time the playground loads, then stored when the user saves file changes. Duplicating a project copies metadata and an existing saved tree if one exists; it does not clone a Git repository.

### D. Playground file model, editor state, and file operations

This group represents project files in the browser and gives users the familiar explorer/editor workflow.

| File | What it does |
| --- | --- |
| `modules/playground/actions/index.ts` | Server actions to load an owned playground and save its tree. Saving uses an upsert for the one file-tree record attached to a playground. |
| `modules/playground/lib/path-to-json.ts` | Defines the recursive file/folder data types and scans a starter directory into that structure. It skips common dependency/build/secret files and replaces contents larger than 1 MB with a placeholder. |
| `modules/playground/lib/index.ts` | Finds a file's path in a nested tree and generates a path-based ID so same-named files in different folders remain distinct. |
| `modules/playground/hooks/usePlayground.tsx` | Loads the playground and either parses its stored file tree or fetches a fresh tree from `/api/template/[id]`; exposes a save callback to the UI. |
| `modules/playground/hooks/useFileExplorer.tsx` | Zustand store for the current project tree, active file, open tabs, unsaved state, and file/folder create, rename, and delete operations. |
| `modules/playground/components/playground-explorer.tsx` | Recursive file-tree sidebar. Selecting a file opens it; folder/file menus open the corresponding dialogs and call the supplied file-operation handlers. |
| `modules/playground/components/playground-editor.tsx` | Monaco React wrapper. Receives the active file content, reports edits, configures editor events, and integrates the AI inline completion display/acceptance flow. |
| `modules/playground/lib/editor-config.tsx` | Maps file extensions to Monaco languages; defines the custom dark theme, TypeScript/JavaScript editor defaults, and general editor options. |
| `modules/playground/components/loader.tsx` | Small loading-step indicator used while a playground is loading. |
| `modules/playground/components/dialogs/confirmation-dialog.tsx` | General-purpose confirm/cancel dialog. It is present as a reusable component but is not currently imported by the feature UI. |
| `modules/playground/components/dialogs/delete-dialog.tsx` | Confirmation dialog used before deleting a file or folder. |
| `modules/playground/components/dialogs/new-file-dialog.tsx` | Collects a new file name and extension. |
| `modules/playground/components/dialogs/new-folder-dialog.tsx` | Collects a new folder name. |
| `modules/playground/components/dialogs/rename-file-dialog.tsx` | Collects a replacement file name and extension. |
| `modules/playground/components/dialogs/rename-folder-dialog.tsx` | Collects a replacement folder name. |

The nested tree is the shared representation that connects three parts of the system: the explorer renders it, the editor opens file contents from it, and the WebContainer transformer turns it into a filesystem mount. The server persists that same logical tree as the project's saved file data.

### E. Monaco Editor and inline AI completion

Monaco is the actual editor engine in the browser, not a server-side code parser. The application configures it and connects it to a small custom AI endpoint.

| File | What it does |
| --- | --- |
| `modules/playground/components/playground-editor.tsx` | Creates the Monaco editor, sets the language, configures inline completion UI, requests suggestions after cursor movement/selected typing patterns, accepts them with Tab, and dismisses them with Escape. |
| `modules/playground/lib/editor-config.tsx` | Provides language detection based on extension, theme colors, diagnostics/compiler settings, and editor behavior such as line numbers, folding, wrapping, and suggestions. |
| `modules/playground/hooks/useAISuggestion.tsx` | Stores the current suggestion/loading/position state and posts editor contents plus cursor position to the code-completion API. |
| `modules/playground/components/toggle-ai.tsx` | Offers the AI enable/disable menu and opens the chat side panel. The enable switch gates inline suggestions through the hook. |
| `app/api/code-completion/route.ts` | Validates input, analyzes nearby lines and simple code patterns, detects a likely language/framework, creates a completion prompt, calls the AI helper, and returns suggestion text and context metadata. |
| `lib/ai.ts` | Shared server-side client for an OpenAI-compatible chat-completions endpoint. Reads endpoint, model, and key from environment variables and returns the first assistant message. |

The editor sends file text and cursor information to the server endpoint. The route includes up to ten lines around the cursor and simple heuristics such as likely function/class context, comments, and incomplete assignments or calls. Monaco presents the returned text as an inline suggestion. The AI library call happens on the VibeCode server; the editor itself runs in the browser.

The project declares `monacopilot` in its dependencies, but the current playground code wires completion through its own API route and Monaco inline-completion provider rather than using that package directly.

### F. WebContainer, live preview, and Xterm.js terminal

This group makes a selected starter runnable without starting it as a process on the VibeCode server.

| File | What it does |
| --- | --- |
| `modules/webcontainers/hooks/transformer.ts` | Converts the app's `{ filename, fileExtension, content }` tree into the `{ file: { contents } }` / `{ directory: ... }` shape expected by WebContainer's `mount()`. |
| `modules/webcontainers/hooks/useWebContainer.ts` | Boots a WebContainer instance, tracks loading/errors, writes files into its virtual filesystem, and exposes teardown behavior. |
| `modules/webcontainers/components/webContainer-preview.tsx` | Mounts project files, runs `npm install`, starts `npm run start`, listens for `server-ready`, and displays the resulting app in an iframe. It also renders setup progress and the terminal. |
| `modules/webcontainers/components/terminal.tsx` | Creates Xterm.js in the browser and attaches fit, link, and search add-ons. It displays WebContainer output and sends typed commands to `webContainerInstance.spawn()`. It includes command history, Ctrl+C process interruption, selected-text copy, search, download, and clear controls. |
| `next.config.ts` | Adds the cross-origin isolation response headers required by WebContainers and includes starter files in the API route's production output tracing. |

Xterm.js is the terminal display and keyboard-input surface. Commands are run by WebContainer, not by a shell process on the Next.js server. The current input handler splits a command on spaces before calling `spawn()`, so this is a lightweight command runner rather than a complete shell parser with full quoting and shell syntax.

WebContainer setup expects the selected starter to have a compatible `package.json` and `npm run start` script. A browser that supports WebContainers and the configured cross-origin isolation headers is also required.

### G. AI chat assistant

| File | What it does |
| --- | --- |
| `modules/ai-chat/components/ai-chat-sidebarpanel.tsx` | Chat interface with Chat/Review/Fix/Optimize modes, client-side message list, search/filter, Markdown/GFM/math rendering, export, copy, and prompt shortcuts. |
| `modules/playground/components/toggle-ai.tsx` | Hosts the chat panel and controls whether inline AI completion is enabled. |
| `app/api/chat/route.ts` | Validates the message and history, keeps up to ten history entries, adds the coding-assistant system prompt, calls the shared AI helper, and returns a complete answer. |
| `lib/ai.ts` | Sends the provider request with `stream: false`, configured model, and generation options, then extracts the response text. |
| `prisma/schema.prisma` | Defines a `chatMessage` model, but the current chat component does not call a persistence action for it. |

Important current behavior: chat messages are held in React state, not saved to MongoDB. Chat does not automatically read the active editor file; the user must include or paste relevant code in the chat message. The UI sends a selected model, a stream preference, and an auto-save preference, but the API currently ignores those fields: it always uses `lib/ai.ts` configuration and non-streamed responses. The chat modes change the text sent as the user prompt; they do not invoke separate server-side tools.

### H. Template endpoint and starter selection

| File | What it does |
| --- | --- |
| `lib/template.ts` | Maps the six supported database template values to starter directories: React, Next.js, Express, Vue, Hono, and Angular. |
| `app/api/template/[id]/route.ts` | Requires an authenticated user, checks that the playground belongs to them, finds its template directory, scans it into a nested tree, and returns that tree as JSON. |
| `modules/playground/lib/path-to-json.ts` | Recursively reads starter files and applies file/folder exclusions and a maximum included content size. |
| `next.config.ts` | Ensures files under `vibecode-starters/` are included when tracing the template API route for deployment. |
| `modules/dashboard/components/template-selecting-model.tsx` | Presents the six supported starter choices and maps UI names to database enum values. |

The starter scanner omits dependency/build folders and common local environment files. It does not copy `node_modules`; packages are installed later inside WebContainer with `npm install`. The exact project folder is selected from the `Playground.template` value, so creating a project does not mean every template in the repository is available in the UI.

### I. Database and persisted data: Prisma + MongoDB

Prisma is the application's database toolkit. MongoDB is the database engine. The browser does not connect directly to MongoDB.

| File | What it does |
| --- | --- |
| `prisma/schema.prisma` | Declares MongoDB as the datasource and defines the generated Prisma client plus User, Account, Playground, StarMark, TemplateFile, and chatMessage models. |
| `lib/db.ts` | Creates and exports a shared PrismaClient, reusing it on `globalThis` during development to reduce duplicate client instances during reloads. |
| `modules/auth/actions/index.ts` | Reads user/account records and resolves the current user for server-side feature code. |
| `modules/dashboard/actions/index.ts` | Uses Prisma to create and manage playground metadata and favorites, scoped to the current owner. |
| `modules/playground/actions/index.ts` | Loads an owned project and reads/writes its saved file-tree record. |
| `auth.ts` | Configures the Prisma adapter and manually handles user/account creation and session callbacks during sign-in. |

The main data relationships are:

- A `User` can own many `Playground` records.
- A playground can have one saved `TemplateFile` tree. Its `playgroundId` is unique.
- `StarMark` joins a user and a playground to record a favorite.
- `Account` stores an OAuth provider account linked to a user.
- `chatMessage` describes a possible chat-history collection, but it is not currently used by the chat UI/API flow.

The `DATABASE_URL` environment variable supplies the MongoDB connection string. `TemplateFile.content` is a Prisma JSON field. The save action currently serializes the tree with `JSON.stringify`, so the stored JSON value is a string; the client checks for a string and parses it again when loading.

### J. Shared UI building blocks

The files under `components/ui/` are reusable controls and layout primitives, mostly styled wrappers around Radix/Base UI behavior. Feature modules compose them into screens. A component existing here does not necessarily mean a current screen uses it. The most visible examples are `button.tsx`, `dialog.tsx`, `sidebar.tsx`, `tabs.tsx`, `resizable.tsx`, and `tooltip.tsx`; Sonner is the toast system mounted in `app/layout.tsx`.

| File | Purpose |
| --- | --- |
| `components/ui/accordion.tsx` | Expand/collapse content sections. |
| `components/ui/alert-dialog.tsx` | Accessible modal confirmation/alert controls. |
| `components/ui/alert.tsx` | Inline informational, warning, or error message container. |
| `components/ui/aspect-ratio.tsx` | Keeps content at a chosen width-to-height ratio. |
| `components/ui/attachment.tsx` | Attachment display/input building block. |
| `components/ui/avatar.tsx` | Avatar image, fallback, and layout. |
| `components/ui/badge.tsx` | Small status/category label. |
| `components/ui/breadcrumb.tsx` | Hierarchical location navigation. |
| `components/ui/bubble.tsx` | Message-bubble presentation primitive. |
| `components/ui/button-group.tsx` | Groups related buttons together. |
| `components/ui/button.tsx` | Shared button variants, sizes, and optional child-slot behavior. |
| `components/ui/calendar.tsx` | Calendar/date selection UI. |
| `components/ui/card.tsx` | Card container, header, content, and footer primitives. |
| `components/ui/carousel.tsx` | Carousel/slide navigation. |
| `components/ui/chart.tsx` | Chart wrappers and chart styling helpers. |
| `components/ui/checkbox.tsx` | Checkbox control. |
| `components/ui/collapsible.tsx` | Expandable/collapsible region. |
| `components/ui/combobox.tsx` | Searchable option selector. |
| `components/ui/command.tsx` | Command palette and command-list primitives. |
| `components/ui/context-menu.tsx` | Right-click/context menu. |
| `components/ui/dialog.tsx` | Modal dialog primitives used by template and file dialogs. |
| `components/ui/direction.tsx` | Right-to-left/left-to-right direction context. |
| `components/ui/drawer.tsx` | Drawer-style modal panel. |
| `components/ui/dropdown-menu.tsx` | Triggered action/option menu. |
| `components/ui/empty.tsx` | Reusable empty-content presentation. |
| `components/ui/field.tsx` | Form field layout and label/help/error composition. |
| `components/ui/form.tsx` | React Hook Form integration and accessible form state/message helpers. |
| `components/ui/hover-card.tsx` | Content panel shown on hover/focus. |
| `components/ui/input-group.tsx` | Groups an input with related controls or labels. |
| `components/ui/input-otp.tsx` | One-time-password input slots. |
| `components/ui/input.tsx` | Shared text input. |
| `components/ui/item.tsx` | Generic list/item layout primitive. |
| `components/ui/kbd.tsx` | Keyboard-key label. |
| `components/ui/label.tsx` | Form label primitive. |
| `components/ui/marker.tsx` | Text/content marker primitive. |
| `components/ui/menubar.tsx` | Application-style menu bar. |
| `components/ui/message-scroller.tsx` | Scrollable message-list helper. |
| `components/ui/message.tsx` | Message layout/presentation primitive. |
| `components/ui/native-select.tsx` | Styled browser-native select control. |
| `components/ui/navigation-menu.tsx` | Navigation menu primitives. |
| `components/ui/pagination.tsx` | Page navigation controls. |
| `components/ui/popover.tsx` | Floating anchored content panel. |
| `components/ui/progress.tsx` | Progress bar. |
| `components/ui/radio-group.tsx` | Mutually exclusive option controls. |
| `components/ui/resizable.tsx` | Resizable panels/handles, used to divide editor and preview. |
| `components/ui/scroll-area.tsx` | Styled scrollable region. |
| `components/ui/select.tsx` | Styled accessible select menu. |
| `components/ui/separator.tsx` | Visual divider. |
| `components/ui/sheet.tsx` | Side/bottom sheet used by responsive UI. |
| `components/ui/sidebar.tsx` | Sidebar provider, state, navigation, and responsive sidebar primitives. |
| `components/ui/skeleton.tsx` | Loading placeholder shape. |
| `components/ui/slider.tsx` | Range slider control. |
| `components/ui/spinner.tsx` | Loading spinner primitive. |
| `components/ui/switch.tsx` | On/off switch control. |
| `components/ui/table.tsx` | Table, row, header, and cell primitives used by project listing. |
| `components/ui/tabs.tsx` | Tab navigation and tab panels used by open files and template/chat modes. |
| `components/ui/textarea.tsx` | Shared multiline text input. |
| `components/ui/theme-toggle.tsx` | Theme switch control used in the site header. |
| `components/ui/toast.tsx` | Toast primitives; feature notifications currently use Sonner instead. |
| `components/ui/toggle-group.tsx` | Grouped toggle controls. |
| `components/ui/toggle.tsx` | Single pressed/unpressed toggle. |
| `components/ui/tooltip.tsx` | Tooltip provider, trigger, and content. |

### K. Static assets

Files under `public/` are served directly by Next.js; they are not imported as executable code.

- `public/hero.svg`, `public/logo.svg`, and `public/login.svg` are used by the landing, header, and sign-in UI.
- `public/react.svg`, `public/nextjs-icon.svg`, `public/expressjs-icon.svg`, `public/vuejs-icon.svg`, `public/hono.svg`, and `public/angular-2.svg` identify template choices.
- `public/add-new.svg`, `public/github.svg`, `public/empty-state.svg`, and `public/empty-state1.svg` support dashboard tiles and empty states.
- `public/file.svg`, `public/globe.svg`, `public/next.svg`, `public/vercel.svg`, and `public/window.svg` are generic or scaffold assets; some may not currently appear in the active UI.
- `app/favicon.ico` supplies the browser tab icon.

## 6. The Starter Projects Are Separate Projects

`vibecode-starters/` contains independent starter-project files. The VibeCode application reads selected starter folders, turns their text files into a JSON tree, and mounts that tree into WebContainer. Their React/Vue/Angular/etc. source code is the user's starting workspace, not the code that implements the VibeCode dashboard or editor.

The current template map and creation UI connect these six folders:

| UI/database template | Starter directory |
| --- | --- |
| React | `vibecode-starters/react-ts/` |
| Next.js | `vibecode-starters/nextjs/` |
| Express | `vibecode-starters/express-simple/` |
| Vue | `vibecode-starters/vue/` |
| Hono | `vibecode-starters/hono-nodejs-starter/` |
| Angular | `vibecode-starters/angular/` |

The repository also contains these other starter folders, which are not in the current six-option map: `astro-shadcn/`, `bolt-expo/`, `bolt-qwik/`, `bolt-remotion/`, `bolt-slides/`, `bolt-vite-react-ts/`, `bootstrap-5/`, `egg/`, `graphql/`, `gsap-next/`, `gsap-nuxt/`, `gsap-react/`, `gsap-svelte/`, `gsap-sveltekit/`, `gsap-vue/`, `js/`, `json-graphql-server/`, `json-server/`, `koa/`, `node/`, `nodemon/`, `quasar/`, `react/`, `revealjs/`, `rxjs/`, `slidev/`, `static/`, `sveltekit/`, `test/`, `tres/`, `tutorialkit/`, `typescript/`, `vite-shadcn/`, and `web-platform/`.

At the collection root, `vibecode-starters/README.md` describes the upstream starter collection, `LICENSE` records its license, `package.json` provides formatting/package-check/test scripts for that collection, `_scripts/package-lock-sync.mjs` supports package-lock maintenance, and `vitest.config.ts` configures its tests. Each individual starter folder has its own app code, package metadata, and dependencies. The collection's `node_modules/` is not part of the VibeCode server code.

## 7. Root Configuration and Project Support Files

| File | What it does |
| --- | --- |
| `package.json` | Declares the Next.js app scripts and runtime/development dependencies, including Monaco, WebContainer, Xterm, NextAuth, Prisma, React, and Tailwind. |
| `package-lock.json` | Locks the root application's npm dependency versions. |
| `tsconfig.json` | Configures TypeScript, strict checking, Next.js integration, and the `@/*` import alias to the repository root. It excludes bundled starter source from the app's TypeScript project. |
| `next.config.ts` | Configures image hosts, template-file tracing for deployment, and cross-origin isolation headers required by WebContainers. |
| `eslint.config.mjs` | Enables Next.js/TypeScript lint rules and excludes generated output and starter templates. |
| `postcss.config.mjs` | Registers Tailwind CSS 4's PostCSS plugin. |
| `components.json` | shadcn/ui component-generation configuration, including aliases and the global CSS path. |
| `prisma.config.ts.bk` | Backup Prisma config for the schema, migration directory, and `DATABASE_URL`; the `.bk` extension means it is not the standard active `prisma.config.ts` filename. |
| `AGENTS.md` | Repository instruction for contributors: this project uses a Next.js version with breaking changes, so consult the installed Next.js docs before changing Next.js code. |
| `CLAUDE.md` | Points to `AGENTS.md` for shared repository instructions. |
| `.gitignore` | Excludes dependencies, Next.js build output, environment files, TypeScript build info, and generated files from Git. |
| `skills-lock.json` | Tooling/skill metadata; it is not part of the user-facing runtime flow. |
| `next-env.d.ts` | Next.js-generated TypeScript declarations. |
| `tsconfig.tsbuildinfo` | TypeScript incremental-build cache. |

There is no active application code under `app/docs/`, `modules/test/`, or `output/` in the current workspace; those directories are empty. The root `README.md` is also present and gives setup and feature notes, but where it disagrees with the implementation, use the source files described here.

## 8. Technology Integrations, in Plain Language

### Monaco Editor

Monaco is the browser code editor. The React adapter `@monaco-editor/react` mounts it in `playground-editor.tsx`. The editor receives the selected file's content as a value and reports text changes back to the playground state. `editor-config.tsx` selects a language from the filename extension, sets the theme and editor options, and enables JavaScript/TypeScript diagnostics. The playground page owns tabs and saving; Monaco itself does not save files to MongoDB.

### WebContainer

WebContainer provides a small Node-compatible environment inside a supported browser. VibeCode turns the starter's nested file tree into WebContainer's filesystem format, mounts it, installs dependencies, and starts the template. The WebContainer server's ready URL is placed in an iframe. Edits are written into that virtual filesystem on save, which is why the preview can reflect saved changes without starting a local Node server on the VibeCode backend.

### Xterm.js

Xterm.js draws the terminal in the browser. Its fit/search/web-link add-ons improve the terminal display and resizing. The terminal component reads keyboard data, maintains a small command history, and passes entered commands to WebContainer's `spawn()` method. WebContainer process output is piped back into Xterm. Xterm is not itself the shell and does not run commands on MongoDB or the Next.js server.

### Prisma and MongoDB

MongoDB stores VibeCode service data. Prisma gives the server typed model operations such as `db.playground.findMany()` and `db.templateFile.upsert()`. The schema says which collections and relationships exist; `lib/db.ts` creates the shared client; server actions call that client. A user's starter app is mounted in WebContainer separately. Its own database configuration, if it has one, is not automatically connected to VibeCode's MongoDB.

### AI integration

The shared helper in `lib/ai.ts` sends a standard chat-completions request to `AI_API_URL` with a bearer key from `AI_API_KEY`, using `AI_MODEL` or a default model when no model is provided. Both chat and completion call this helper from server-side API routes. Responses are non-streamed. This implementation is provider-compatible rather than tied to a particular local model runtime.

The code's default endpoint is the OpenAI-compatible `/v1/chat/completions` endpoint, and the default model is `gpt-4o-mini`. The current source does not invoke Ollama directly. Configure an OpenAI-compatible endpoint, API key, and model for the actual code path. Keep the API key in server environment configuration; do not put it in a client component.

## 9. Environment and Local Setup

The principal environment values referenced in application code are:

| Variable | Used for |
| --- | --- |
| `DATABASE_URL` | MongoDB connection string consumed by Prisma. |
| `AUTH_SECRET` | NextAuth JWT/session signing secret. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth sign-in. |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub OAuth sign-in. |
| `AI_API_URL` | OpenAI-compatible chat-completions endpoint. If unset, code defaults to OpenAI's endpoint. |
| `AI_API_KEY` | Server-side provider key; required before AI routes can generate text. |
| `AI_MODEL` | Model name sent to the configured provider; defaults in code to `gpt-4o-mini`. |

Typical commands from the application root:

```bash
npm install
npm run dev
```

The app's `build` script runs `prisma generate` before `next build`; `npm run lint` runs ESLint. The browser project runtime separately runs `npm install` and `npm run start` inside WebContainer. MongoDB, OAuth provider credentials, an AI provider configuration, and a WebContainer-capable browser are needed for all corresponding features.

## 10. Current Implementation Notes and Gaps

These are observations from the current source, not intended behavior promises:

- The existing `README.md` describes local Ollama and a different model setup in places. The current `lib/ai.ts` is the source of truth: it calls an OpenAI-compatible endpoint, uses the `AI_*` variables, and defaults to `gpt-4o-mini`.
- The chat API uses the typed message and up to ten history entries, but the chat UI does not persist those messages. The Prisma `chatMessage` model is currently unused.
- Chat does not automatically include the active editor buffer. Include the code in the message when requesting code-specific review or help.
- Chat model selection, stream response, and auto-save controls are sent or stored in UI state but do not alter the backend behavior today. Responses are always non-streamed and use the server-configured model.
- Only React, Next.js, Express, Vue, Hono, and Angular are wired from the template picker to `lib/template.ts`. Other folders in `vibecode-starters/` are not selectable through the current creation screen.
- The GitHub repository tile is visual only; no repository import flow is connected.
- Some file operations update the stored tree but are not all mirrored as filesystem operations into an already-running WebContainer. Saving file contents does explicitly write the file into WebContainer.
- The project table's favorite control is connected; a local `handleMarkasFavorite()` stub in the table is not the active path. The active favorite behavior is in `marked-toggle.tsx` and the dashboard server action.
- `publicRoutes` is empty, so the middleware currently requires a session for the root landing page as well as the workspace routes.
- `ConfirmationDialog` is a reusable dialog component but currently has no feature-level import. Several UI primitives are likewise a shared component library rather than proof of a live feature.
- `app/docs/`, `modules/test/`, and `output/` are currently empty; they do not contain a docs route, application tests, or generated template output in this workspace state.

## 11. A Simple Mental Model

When following a change through this repository, ask which of these four things it affects:

1. **What the user sees:** a route page or feature component under `app/` and `modules/`.
2. **What the app remembers:** a server action and Prisma model, persisted in MongoDB.
3. **What the user's code does:** the file tree transformed and mounted into WebContainer.
4. **What AI suggests:** a browser request to a Next.js API route, then a server-side provider call.

For example, typing into Monaco changes browser state. Saving sends the updated tree to the server action and MongoDB, and writes that file into WebContainer. The preview displays the app served by WebContainer. If inline completion is enabled, editor context is sent to the completion API and the returned text is displayed in Monaco. Those are separate steps, connected by the playground page and its hooks.