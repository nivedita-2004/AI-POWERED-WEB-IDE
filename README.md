# VibeCode Editor

VibeCode Editor is a browser-based development workspace for creating, editing, running, and previewing web projects. Authenticated users can start a playground from a template, edit its files in Monaco, ask a local AI coding assistant for help, and run the project in a browser-native WebContainer.

The application is built with Next.js, React, TypeScript, Prisma, MongoDB, Monaco Editor, WebContainers, and local Ollama models.

## What It Does

- Provides a dashboard for managing coding playgrounds.
- Creates projects from React, Next.js, Express, Vue, Hono, and Angular starter templates.
- Stores project metadata and edited file trees in MongoDB.
- Opens projects in a browser IDE with a file explorer, tabs, and Monaco Editor.
- Runs projects in the browser with `@webcontainer/api` and displays the live preview beside the editor.
- Provides an in-browser terminal with command history, search, copy, download, clear, and process interruption controls.
- Supports light and dark themes through `next-themes`.
- Uses Google and GitHub OAuth through NextAuth.

## Main Features

### Dashboard and projects

- Create a playground by searching and filtering templates by frontend, backend, or full-stack category.
- Set a project name and description during creation.
- Open projects in the current window or a new tab.
- Edit project metadata, duplicate projects, delete projects, copy project URLs, and mark projects as favorites.
- View recent and starred projects from the dashboard sidebar.

### Browser code editor

- File and folder explorer with add, rename, delete, and close operations.
- Multiple open-file tabs and unsaved-change indicators.
- Save the current file, save all files, or save with `Ctrl+S`.
- Resizable editor and preview panels.
- Toggle the live preview when more editor space is needed.
- Language detection for JavaScript, TypeScript, JSX, TSX, JSON, HTML, CSS, SCSS, Markdown, XML, YAML, Python, Java, C/C++, C#, PHP, Ruby, Go, Rust, shell, SQL, INI, and Dockerfile-style files.
- Custom Monaco editor theme and inline completion support.

### WebContainer runtime

When a playground is opened, the application can boot a WebContainer, mount the project files, install dependencies, and run the starter with `npm run start`. The preview listens for the WebContainer `server-ready` event and renders the resulting URL in an iframe.

The terminal runs commands inside the browser-side project environment. WebContainers require a compatible browser and cross-origin isolation; the application configures the required `Cross-Origin-Opener-Policy` and `Cross-Origin-Embedder-Policy` headers.

## AI Tools

AI features run against a local Ollama server. The application does not send code or chat messages to a hosted AI provider through these routes.

### Inline code completion

The Monaco editor can request contextual suggestions automatically or with `Ctrl+Space`. Requests can be triggered by cursor movement, new lines, and common coding characters such as `{`, `.`, `=`, `(`, `,`, `:`, and `;`.

The completion API:

- Receives the file content, cursor position, suggestion type, and optional filename.
- Examines up to ten lines before and after the cursor.
- Detects a likely language and framework.
- Checks for function/class context, comments, and incomplete patterns such as assignments, arrays, objects, and method calls.
- Asks Ollama for code-only output and removes Markdown fences before returning it to Monaco.
- Uses the local `codellama:7b` model with non-streaming generation.
- Returns a fallback comment when the AI service is unavailable.

### AI chat assistant

The playground includes an AI sidebar with these modes:

- Chat
- Code review
- Fix
- Optimize

The assistant supports Markdown, GitHub-flavored Markdown, syntax-highlighted code, and KaTeX math rendering. The chat UI also includes message search and filtering, JSON export, clear chat, auto-save and stream-response toggles, and a model selector.

The current chat API validates messages, keeps the latest ten user/assistant history entries, and sends them to a coding-assistant prompt. It uses the local `codellama:latest` model with non-streaming generation, temperature `0.7`, `top_p` `0.9`, and a maximum token setting of `1000`.

The chat model selector, streaming toggle, and chat auto-save controls are currently UI-level options. The backend always uses `codellama:latest` and non-streaming output, and chat messages are currently held in client state rather than persisted to the database.

## Authentication and Data

Authentication uses NextAuth with JWT sessions, a Prisma adapter, MongoDB, Google OAuth, and GitHub OAuth. User sessions expose the user ID, name, email, and role.

Prisma models include:

- `User` and `Account` for users and OAuth accounts.
- `Playground` for project metadata and template selection.
- `TemplateFile` for the saved project file tree as JSON.
- `StarMark` for favorite projects.
- `chatMessage` for the planned chat-message persistence model.

## API Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `/api/auth/[...nextauth]` | `GET`, `POST` | NextAuth authentication handlers. |
| `/api/chat` | `POST` | Generates a local Ollama coding-assistant response. |
| `/api/code-completion` | `POST` | Analyzes editor context and returns an inline completion. |
| `/api/template/[id]` | `GET` | Scans a configured starter directory and returns its file tree. |

## Requirements

- Node.js and npm.
- MongoDB.
- Google OAuth credentials.
- GitHub OAuth credentials.
- A local Ollama installation.
- Ollama models `codellama:latest` and `codellama:7b`.
- A browser that supports WebContainers and cross-origin isolation.

## Setup

Install dependencies:

```bash
npm install
```

Create a local environment file such as `.env.local` and provide the values used by the application:

```env
DATABASE_URL="your-mongodb-connection-string"
AUTH_SECRET="your-nextauth-secret"
GITHUB_CLIENT_ID="your-github-oauth-client-id"
GITHUB_CLIENT_SECRET="your-github-oauth-client-secret"
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
```

Start Ollama and install the required local models:

```bash
ollama serve
ollama pull codellama:latest
ollama pull codellama:7b
```

Start the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The current middleware protects the application routes, so sign in with Google or GitHub before using the dashboard.

## Scripts

```bash
npm run dev      # Start Next.js with Turbopack
npm run build    # Create a production build
npm run start    # Start the production server
npm run lint     # Run the configured lint command
```

## Project Layout

```text
app/                      Next.js routes, pages, layouts, and API handlers
components/               Shared UI components
hooks/                    Shared React hooks
lib/                      Database, template, and utility helpers
modules/                  Auth, dashboard, home, playground, AI chat, and WebContainer features
prisma/                   MongoDB schema
public/vibecode-starters/ Starter project collection used by playgrounds
```

## Current Limitations

- The AI backend requires Ollama at `http://localhost:11434`.
- WebContainer startup depends on the selected starter having a compatible `npm run start` script and browser-compatible dependencies.
- The configured Next.js template path is `vibecode-starters/nextjs-new`; that directory is not currently present in the repository and may need to be corrected before creating a Next.js playground.
- The dashboard's GitHub repository tile is currently presentational; repository import is not implemented.
- Project duplication copies project metadata but does not currently copy the associated saved file tree.
- The `/docs` and sign-up links are present in the route/navigation configuration but do not currently represent complete implemented workflows.
- Several project and template operations should receive stronger ownership checks before being exposed to untrusted users.

## Technology Stack

- Next.js 15 and React 19
- TypeScript
- Tailwind CSS 4 and shadcn/ui
- Monaco Editor
- `@webcontainer/api`
- Xterm.js
- NextAuth
- Prisma with MongoDB
- Ollama with Code Llama
- React Markdown, remark-gfm, rehype-katex, and remark-math
