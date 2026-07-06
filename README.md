# LexAI v2 - AI Legal Assistant Platform for Indian Law

LexAI v2 is a production-ready, modular, and robust AI-powered Legal Assistant platform designed for Indian law. Operating on the Google Gemini API (with resilient model fallbacks and exponential retry backoffs), the application features statutory legal advice, interactive trial simulation, contract clause auditing, and fallback capabilities for authentication and history persistence if MongoDB is offline.

---

## 1. Project Overview & Features

### Core Capabilities
*   **Legal Query & Advice**: Retrieve statutory legal advice based on Indian laws. Supports multiple languages (English, Hindi, Telugu, and Kannada).
*   **Courtroom Simulator**: Interactive trial sandbox that simulates petitioner/respondent counsel arguments, rebuttals, witness statements, evidence exhibits, and court verdicts.
*   **Document Analyzer**: Audits legal documents and agreements for key clauses, potential risks, and liability caps.
*   **User Authentication**: JWT-based secure user registration, login, and profile management with input validation.
*   **History Logs**: Retrieve past advice sessions, courtroom simulation outcomes, and audited documents from a secure history list.
*   **Resilience & Offline Fallback**: If MongoDB is unavailable, the application transparently falls back to local JSON-based persistence (`server/data/db_fallback.json`) for seamless offline operation.

---

## 2. Technology Stack

*   **Frontend**: Semantic HTML5, Vanilla CSS3 (custom HSL color palette, dark mode styles, courtroom micro-animations), Vanilla JavaScript (modules, local storage, Fetch API).
*   **Backend**: Node.js, Express, Mongoose (MongoDB ODM), JSON Web Token (JWT) auth, Helmet (security headers), CORS, rate-limiting, and Morgan logger.
*   **Database**: MongoDB (Production) with file-based JSON fallback (Development).
*   **AI Engine**: Google Gemini API via SDK with multi-model fallback chain (Gemini 2.5 Flash Lite, Flash, Pro, and 2.0).

---

## 3. Architecture & Folder Structure

The repository is organized with a clean separation between the static frontend assets and the Express backend server. Local development runs in a unified directory, and Vercel deploys the frontend and backend together serverlessly.

```text
lawyer-ai-v2/
├── client/                     # Frontend client assets
│   └── public/                 # Static public files
│       ├── favicon.ico         # App Favicon
│       ├── logo.png            # Navigation logo
│       ├── logo2.png           # Splash/Login logo
│       ├── index.html          # Main SPA interface (HTML5 markup & modals)
│       ├── style.css           # Custom HSL styles, animations, and typography
│       └── src/                # Frontend Javascript logic
│           ├── script.js       # Main DOM controller, guided tour, interactive UI
│           ├── lang/           # Multi-language translations
│           │   ├── en.json     # English translations
│           │   ├── hi.json     # Hindi (हिंदी) translations
│           │   ├── kn.json     # Kannada (ಕನ್ನಡ) translations
│           │   └── te.json     # Telugu (తెలుగు) translations
│           └── utils/
│               └── api.js      # Fetch wrapper utilities for backend routes
├── server/                     # Backend Express server
│   ├── config/
│   │   └── db.js               # MongoDB connection boot (fail-fast settings)
│   ├── data/
│   │   └── .gitkeep            # Persists directory in Git
│   ├── middleware/
│   │   └── auth.js             # JWT authentication guards and check
│   ├── models/                 # Mongoose schemas
│   │   ├── User.js             # User accounts schema
│   │   ├── Conversation.js     # Chat conversation schema
│   │   ├── CourtroomSession.js # Simulated trial courtroom schema
│   │   └── Document.js         # Audited document schema
│   ├── routes/                 # Express API routes
│   │   ├── auth.js             # Registration, login, and session checks
│   │   └── api.js              # Advice, trial, auditing, and history endpoints
│   ├── services/
│   │   ├── db.service.js       # Persistence manager (Mongo <-> Local JSON fallback)
│   │   └── gemini.js           # Gemini API SDK handler (fallbacks & retry limits)
│   ├── index.js                # Server entry point
│   ├── package.json            # Node backend dependencies
│   └── package-lock.json       # Strict package lockfile
├── api/
│   └── index.js                # Vercel Serverless Function entry point
├── .env.example                # Template for environment variables
├── .gitignore                  # Git exclusions for secrets and node_modules
├── package.json                # Root proxy scripts
└── vercel.json                 # Vercel deployment configuration
```

---

## 4. Environment Variables

The application requires specific environment variables to function in production. Create a `.env` file in the root or `server/` folder for local development:

```env
GEMINI_API_KEY=your_gemini_api_key_here
MONGODB_URI=mongodb://127.0.0.1:27017/lexai-v2
JWT_SECRET=your_super_secure_jwt_secret_token
CLIENT_URL=http://localhost:3000
```

*Note: Never commit `.env` files to git. Use `.env.example` as a template.*

---

## 5. Local Setup & Development

### Prerequisites
*   Node.js (v18.0.0 or higher)
*   npm (Node Package Manager)
*   MongoDB (Optional: Fallback database is used if MongoDB is offline)

### Step-by-Step Installation
1.  Clone the repository to your local machine.
2.  Navigate to the repository root and install backend dependencies:
    ```bash
    npm install --prefix server
    ```
3.  Create a `.env` file in the root directory using the variables listed in `.env.example`.
4.  Start local development:
    ```bash
    npm run dev
    ```
5.  Open your browser and navigate to `http://localhost:3000`.

---

## 6. API Endpoints

### Authentication (`/api/auth`)
*   `POST /api/auth/register`: Register new user account.
*   `POST /api/auth/login`: Authenticate credentials, return JWT.
*   `GET /api/auth/me` (Private): Fetch current profile info.

### Sandboxes (`/api`)
*   `POST /api/query` (Optional Auth): legal query statutory response or courtroom debate.
*   `POST /api/analyze-document` (Optional Auth): audit document clauses and highlight risks.

### History (`/api/history` - Private)
*   `GET /api/history/conversations`: Get recent advice history.
*   `GET /api/history/conversations/:id`: Retrieve full conversation message logs.
*   `DELETE /api/history/conversations/:id`: Delete an advice consultation log.
*   `GET /api/history/courtroom`: Retrieve recent trial list.
*   `GET /api/history/courtroom/:id`: Get full trial debate dialogue bubbles.
*   `GET /api/history/documents`: Retrieve audited document summaries.

---

## 7. GitHub & Vercel Deployment

### GitHub Preparation
1.  Initialize git, add your remote origin, and verify `.gitignore` excludes `.env` and `node_modules`.
2.  Stage and commit your codebase:
    ```bash
    git add .
    git commit -m "chore: prepare LexAI v2 for production deployment"
    ```
3.  Push to your GitHub repository.

### Vercel Deployment Steps
1.  Log into your dashboard on [Vercel](https://vercel.com).
2.  Click **Add New** → **Project**, and select your imported GitHub repository.
3.  Under **Build & Development Settings**, Vercel will automatically detect `vercel.json` and configure:
    *   **Install Command**: `npm install --prefix server`
    *   **Output Directory**: Managed serverless bundles
4.  Configure **Environment Variables** in Vercel settings:
    *   `GEMINI_API_KEY`: Google AI studio key.
    *   `MONGODB_URI`: Connection string (e.g. MongoDB Atlas).
    *   `JWT_SECRET`: Random 32+ character string.
    *   `CLIENT_URL`: Your Vercel domain (e.g., `https://lexai.vercel.app`).
5.  Click **Deploy**. Traffic will be serverlessly routed through the Express gateway in `api/index.js`.

---

## 8. Troubleshooting & FAQs

#### AI Features return quota errors
*   The free tier of the Google Gemini API has daily and per-minute request limits. The backend automatically steps down from `gemini-2.5-flash-lite` to fallback models if rate limits are hit. If all limits are exceeded, please wait a minute and retry.

#### JWT Token verification fails in production
*   Make sure `JWT_SECRET` is defined in Vercel. In production and Vercel environments, the app throws an error on startup if `JWT_SECRET` is missing to prevent token vulnerability.

#### History does not persist on Vercel
*   The file-based fallback database (`db_fallback.json`) is ephemeral in serverless environments. To persist user accounts and history in production, connect a cloud-based MongoDB database (such as MongoDB Atlas) by adding the `MONGODB_URI` environment variable.

---

## 9. License

This project is licensed under the MIT License - see the LICENSE file for details.
