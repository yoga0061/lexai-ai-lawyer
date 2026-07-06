# ⚖️ LexAI v2 - AI Legal Assistant Platform for Indian Law

LexAI v2 is a production-ready, AI-powered legal assistant designed to help users understand Indian laws through intelligent legal guidance. Built with Google Gemini AI, the platform provides legal consultation, courtroom simulations, contract analysis, multilingual support, and secure user authentication.

The application is designed with a resilient architecture that automatically falls back to local storage when MongoDB is unavailable, ensuring uninterrupted functionality during development and testing.

---

# 🚀 Features

## 📖 AI Legal Consultation
- Get legal guidance based on Indian laws.
- AI-powered responses using Google Gemini.
- Context-aware conversations.
- Supports English, Hindi, Telugu, and Kannada.

## ⚖️ Courtroom Simulator
- Simulates courtroom proceedings.
- Generates petitioner and respondent arguments.
- Produces witness statements and evidence.
- Creates AI-generated judgments based on presented facts.

## 📄 Document Analyzer
- Upload legal agreements or contracts.
- Detect risky clauses.
- Identify missing sections.
- Highlight liabilities and legal concerns.
- Generate AI-powered legal summaries.

## 👤 Secure Authentication
- JWT-based authentication.
- User registration and login.
- Protected API routes.
- Secure password storage.
- Profile management.

## 📚 Conversation History
- Store previous legal consultations.
- Save courtroom simulations.
- Save analyzed legal documents.
- Retrieve previous sessions anytime.

## 🔄 Offline Database Fallback
If MongoDB is unavailable, LexAI automatically switches to a local JSON database, ensuring the application continues to function without interruption.

---

# 🛠 Technology Stack

## Frontend
- HTML5
- CSS3
- Vanilla JavaScript
- Fetch API
- Local Storage

## Backend
- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication
- Helmet
- CORS
- Morgan
- Express Rate Limiter

## AI
- Google Gemini API
- Automatic model fallback
- Retry mechanism with exponential backoff

## Deployment
- GitHub
- Vercel
- MongoDB Atlas

---

# 📁 Project Structure

```text
lexai-ai-lawyer/
│
├── client/
│   └── public/
│       ├── favicon.ico
│       ├── logo.png
│       ├── logo2.png
│       ├── index.html
│       ├── style.css
│       └── src/
│           ├── script.js
│           ├── lang/
│           │   ├── en.json
│           │   ├── hi.json
│           │   ├── kn.json
│           │   └── te.json
│           └── utils/
│               └── api.js
│
├── server/
│   ├── config/
│   ├── middleware/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── data/
│   ├── index.js
│   ├── package.json
│   └── package-lock.json
│
├── api/
│   └── index.js
│
├── .env.example
├── .gitignore
├── package.json
├── vercel.json
└── README.md
```

---

# 🔐 Environment Variables

Create a `.env` file inside the project root.

```env
GEMINI_API_KEY=your_gemini_api_key

MONGODB_URI=mongodb://127.0.0.1:27017/lexai-v2

JWT_SECRET=your_super_secure_secret

CLIENT_URL=http://localhost:3000
```

> Never commit your `.env` file to GitHub.

---

# 💻 Local Installation

## Prerequisites

- Node.js 18+
- npm
- MongoDB (optional)

## Clone Repository

```bash
git clone https://github.com/yoga0061/lexai-ai-lawyer.git

cd lexai-ai-lawyer
```

## Install Dependencies

Backend

```bash
npm install --prefix server
```

Frontend (if applicable)

```bash
npm install
```

## Start Development Server

```bash
npm run dev
```

Open your browser:

```
http://localhost:3000
```

---

# 📡 API Endpoints

## Authentication

### Register

```
POST /api/auth/register
```

### Login

```
POST /api/auth/login
```

### Current User

```
GET /api/auth/me
```

---

## AI Services

### Legal Query

```
POST /api/query
```

### Analyze Document

```
POST /api/analyze-document
```

---

## History

### Conversations

```
GET /api/history/conversations
```

### Conversation Details

```
GET /api/history/conversations/:id
```

### Delete Conversation

```
DELETE /api/history/conversations/:id
```

### Courtroom Sessions

```
GET /api/history/courtroom
```

### Courtroom Details

```
GET /api/history/courtroom/:id
```

### Documents

```
GET /api/history/documents
```

---

# 🚀 Deploying to Vercel

## 1. Push Project to GitHub

```bash
git add .

git commit -m "Production Ready"

git push origin main
```

## 2. Import into Vercel

- Login to Vercel
- Click **New Project**
- Import **lexai-ai-lawyer**
- Vercel automatically detects `vercel.json`

---

## 3. Add Environment Variables

```
GEMINI_API_KEY

MONGODB_URI

JWT_SECRET

CLIENT_URL
```

---

## 4. Deploy

Click **Deploy**.

Your application will be available on your Vercel domain.

---

# ❓ Troubleshooting

## Gemini Rate Limit

If the Gemini API quota is exceeded, LexAI automatically attempts fallback models. If all models reach their quota, wait a few minutes and try again.

---

## JWT Errors

Ensure the following environment variable exists:

```
JWT_SECRET
```

---

## Database Not Saving

When deployed on Vercel, local JSON storage is temporary.

For production deployments, configure:

- MongoDB Atlas
- MONGODB_URI

---

# 🔒 Security Features

- JWT Authentication
- Password Hashing
- Helmet Security Headers
- Rate Limiting
- Input Validation
- CORS Protection
- Environment Variable Protection

---

# 🌐 Supported Languages

- 🇬🇧 English
- 🇮🇳 Hindi
- 🇮🇳 Telugu
- 🇮🇳 Kannada

---

# 📌 Future Improvements

- Voice-based legal assistant
- OCR for legal document scanning
- PDF report generation
- AI legal citation support
- Real-time lawyer consultation
- Case recommendation system
- Legal news integration

---

# 📄 License

This project is licensed under the **MIT License**.

---

# 👨‍💻 Developer

**Yoganandha Banavathu**

GitHub: https://github.com/yoga0061

---

⭐ If you found this project useful, consider giving it a **Star** on GitHub!