# College Placement Management Portal

A full-stack, production-style placement management system built with **HTML/CSS/Bootstrap/JavaScript**
on the frontend and a **Node.js + Express + MongoDB (JWT-secured REST API)** backend.

Four roles — **Student, TPO (Placement Officer), Admin, Company** — collaborate through a realistic
placement workflow: a company submits a requirement → the TPO Cell sets eligibility criteria and
publishes the drive → eligible students are notified and apply → candidates move through
Aptitude → Technical Interview → HR Interview → Selected/Rejected, with every state transition
validated on the server.

---

## 1. Project Structure

```
college-placement-portal/
├── backend/                  Node.js + Express REST API
│   ├── config/db.js          MongoDB connection
│   ├── models/                Mongoose schemas (User, Student, Company, Drive, Application, ...)
│   ├── middleware/            JWT auth guard, role guard, resume upload (multer)
│   ├── controllers/           Business logic per role
│   ├── routes/                /api/auth, /api/student, /api/tpo, /api/admin, /api/company
│   ├── test/test.js           Mocha/Chai/Supertest test suite (in-memory MongoDB)
│   ├── Jenkinsfile            CI pipeline definition
│   ├── seed.js                Creates default Admin + TPO accounts
│   └── server.js              App entry point (also serves the frontend)
└── frontend/                  Static HTML / CSS / Bootstrap / vanilla JS
    ├── index.html             Interactive landing page (new visitors land here)
    ├── login.html             Sign-in (email/password + Google)
    ├── forgot-password.html   3-step email OTP password reset
    ├── register-student.html, register-company.html
    ├── student/  tpo/  admin/  company/     Role-specific dashboards
    ├── js/                                  Shared api.js, auth.js, ui.js, layout.js,
    │                                        config.js (Google Client ID), google-auth.js,
    │                                        landing.js, forgot-password.js
    └── css/style.css
```

The backend serves the frontend as static files, so **one running Node process is enough** to use
the whole application — no separate frontend server or build step is required.

---

## 2. Prerequisites

- **Node.js** v18+ and npm ([nodejs.org](https://nodejs.org))
- **MongoDB** running locally (v6+), OR a free MongoDB Atlas connection string
  - Local install: https://www.mongodb.com/docs/manual/administration/install-community/
  - Or use Docker: `docker run -d -p 27017:27017 --name placement-mongo mongo:7`

---

## 3. Setup & Run (Development)

```bash
# 1. Unzip the project and enter the backend folder
cd college-placement-portal/backend

# 2. Install dependencies
npm install

# 3. Configure environment variables
cp .env.example .env
# Edit .env if needed — defaults work for a local MongoDB on port 27017

# 4. Make sure MongoDB is running, then seed default Admin + TPO accounts
npm run seed
# Creates:
#   Admin -> admin@placement.edu / Admin@123
#   TPO   -> tpo@placement.edu   / Tpo@1234

# 5. Start the server
npm start
# or, for auto-restart on file changes during development:
npm run dev
```

Now open **http://localhost:5000** in your browser. You'll land on the **home page** first (an
interactive landing page introducing the platform) — click **Sign In** or **Get Started** to reach
the login/registration forms. That's it — frontend and backend are served from the same address.

### 3.1 Forgot Password (Email OTP)

Password reset works out of the box with **zero setup** — if `EMAIL_USER`/`EMAIL_PASS` are left
blank in `.env`, the 6-digit OTP is printed to the **server console** instead of emailed, so you
can test the whole flow locally without a mailbox. To send real emails instead:

1. Use a real SMTP account — for Gmail, create an **App Password**:
   https://myaccount.google.com/apppasswords (your normal Gmail password won't work here).
2. Fill in `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_USER`, `EMAIL_PASS`, `EMAIL_FROM` in `backend/.env`.
3. Restart the server. From now on, "Forgot password?" on the login page emails a real OTP.

### 3.2 Optional: Google Sign-In (Students)

Google Sign-In is **free** (no cost, no account cap — it's Google's standard OAuth flow) but does
require you to create your own free OAuth Client ID, since it's tied to the exact URL you run the
app on:

1. Go to https://console.cloud.google.com/apis/credentials (create a project if you don't have one).
2. **Create Credentials → OAuth client ID → Application type: Web application.**
3. Under **Authorized JavaScript origins**, add the URL you run this app on, e.g. `http://localhost:5000`.
4. Copy the generated Client ID (looks like `123...apps.googleusercontent.com`).
5. Paste it into **both**:
   - `backend/.env` → `GOOGLE_CLIENT_ID=...`
   - `frontend/js/config.js` → `const GOOGLE_CLIENT_ID = '...'`
6. Restart the server and refresh the login/student-registration pages — the "Continue with Google"
   button will appear automatically.

Until you configure it, the app works completely normally with plain email/password auth — the
Google button area simply shows a small "not configured" note instead of a button.

### Login credentials to try immediately
| Role    | Email                | Password    |
|---------|-----------------------|-------------|
| Admin   | admin@placement.edu   | Admin@123   |
| TPO     | tpo@placement.edu     | Tpo@1234    |
| Student | *(self-register)*     | via "Register as Student" |
| Company | *(self-register)*     | via "Register as Company" |

### Suggested demo flow
1. Register a **Company** → submit a placement requirement (job title, package, rounds).
2. Log in as **TPO** → *Companies* tab → approve the company → *Drives* tab → create/edit the
   drive with eligibility criteria → **Publish** (this notifies eligible students automatically).
3. Register a **Student** (try the **"Continue with Google"** button if you've configured it, or
   the normal form) → fill in academics on *My Profile* (CGPA, backlogs, 10th/12th %) so you match
   the eligibility criteria → *Placement Drives* → Apply.
4. Back as **TPO** → *Applicants & Rounds* → clear the candidate through Aptitude → Technical →
   HR → make the **Final Decision** (Select/Reject).
5. Log in as the **Student** again → *Results* shows the placement outcome; *Notifications* shows
   the alert.
6. Log in as **Admin** → *Manage Users* to activate/deactivate accounts or change roles;
   *Activity Logs* to see every action recorded above.
7. Try **"Forgot password?"** on the login page for the student account — check the server console
   for the OTP if you haven't configured real SMTP.

---

## 4. Running Automated Tests

The test suite (`backend/test/test.js`) uses **Mocha + Chai + Supertest** with
**mongodb-memory-server**, so it spins up its own in-memory MongoDB instance — you do **not**
need a real database running to execute it.

```bash
cd backend
npm test
```

It covers: health check, registration/login for every role, JWT/role-guard enforcement, drive
creation with eligibility + rounds, student eligibility checking, applying (incl. duplicate-apply
rejection), the full Aptitude → Technical → HR → Selected pipeline, admin user activation/
deactivation, and the company requirement/feedback flow.

### Running tests through Jenkins
A ready-to-use `backend/Jenkinsfile` is included.
1. In Jenkins, install the **NodeJS plugin** and configure a NodeJS tool named `NodeJS`
   (Manage Jenkins → Tools → NodeJS installations).
2. Create a **Pipeline** job pointing at this repository, with script path `backend/Jenkinsfile`.
3. Run the build — it will `npm install`, then `npm test` (Mocha), and report pass/fail in the
   console output. Because tests use an in-memory MongoDB, **no database service needs to be
   configured on the Jenkins agent**.

---

## 5. Deploying to Production (brief)

- Set real values in `backend/.env`: a long random `JWT_SECRET`, your production `MONGO_URI`
  (e.g. MongoDB Atlas), and `NODE_ENV=production`.
- Run `npm start` behind a process manager (PM2) or containerize with Docker.
- Since the backend already serves the frontend as static files, you only need to deploy the
  `backend/` folder (with `frontend/` alongside it, as in this repo) to a single Node host —
  no separate static hosting is required.

---

## 6. How This Maps to the Evaluation Rubric

Based on the CO-1 / CO-2 parameters shared for grading:

| Parameter | Where it's demonstrated |
|---|---|
| **Page Structure & Semantic HTML** | Every page uses semantic tags (`<nav>`, `<main>`, `<header>`, `<footer>`, `<aside>`, `<form>`, `<table>`, `<ul>/<li>`), proper `<label for>`/input pairing, and clean form structure (see `frontend/*/**.html`). |
| **Styling & Layout Design** | `frontend/css/style.css` — a custom design system (CSS variables, card shadows, badges, stat cards, the landing page's hero/feature/workflow sections) layered on top of Bootstrap 5 grid/utilities. |
| **Responsiveness / UI Consistency** | Bootstrap grid (`col-md-*`, `col-lg-*`) throughout; the landing page's navbar, hero and feature grid collapse gracefully on mobile; `dashboard-shell`/`sidebar` collapse to a stacked layout under 768px (see the `@media` queries in `style.css`); consistent navbar/sidebar generated by `js/layout.js` on every dashboard page. |
| **Event Handling** | `addEventListener` for form submits, button clicks, filter toggles, tab switches, file inputs, dropdown/role-change selects, the landing page's role tabs and smooth-scroll nav links — see e.g. `js/student/drives.js`, `js/tpo/applicants.js`, `js/landing.js`. |
| **DOM Manipulation** | Dynamic navbar/sidebar injection (`js/layout.js`), the landing page's animated stat counters and scroll-reveal (`js/landing.js`), the 3-step forgot-password wizard swapping form visibility (`js/forgot-password.js`), dynamically-built round-timetable rows (`js/tpo/drives.js`), live re-rendering of tables/cards/badges/timelines from JSON data (`js/student/applications.js`, `js/tpo/applicants.js`). |
| **AJAX / Asynchronous Data Handling** | All network I/O goes through the shared `fetch`-based wrapper in `js/api.js`; every page uses `async/await` to call the REST API and update the DOM once data resolves, with inline error handling instead of blocking `alert()`s. |

---

## 7. API Overview

All endpoints are prefixed with `/api` and (except register/login) require
`Authorization: Bearer <token>`.

- **Auth:** `POST /auth/register/student`, `POST /auth/register/company`, `POST /auth/login`,
  `GET /auth/me`, `POST /auth/logout`, `POST /auth/forgot-password`, `POST /auth/verify-otp`,
  `POST /auth/reset-password`, `POST /auth/google`
- **Student:** `/student/profile`, `/student/resume`, `/student/drives`,
  `/student/drives/:id/eligibility`, `/student/drives/:id/apply`, `/student/applications`,
  `/student/applications/:id/withdraw`, `/student/results`, `/student/notifications`
- **TPO:** `/tpo/companies`, `/tpo/drives`, `/tpo/drives/:id/publish`,
  `/tpo/drives/:id/eligible-students`, `/tpo/drives/:id/applicants`,
  `/tpo/applications/:id/round`, `/tpo/applications/:id/decision`, `/tpo/statistics`,
  `/tpo/notify`
- **Admin:** `/admin/users`, `/admin/users/:id/role`, `/admin/users/:id/status`,
  `/admin/system-info`, `/admin/activity-logs`
- **Company:** `/company/profile`, `/company/requirements`, `/company/drives/approved`,
  `/company/drives/:id/applicants`, `/company/applications/:id/feedback`,
  `/company/drives/:id/selected`, `/company/message-tpo`

---

## 8. Notes on Design Decisions

- **Application state machine:** `Applied → In Process → Selected | Rejected`, plus `Withdrawn`.
  Round-by-round progress is tracked in `roundResults[]`; only the TPO can officially clear/reject
  a round or make the final Selected/Rejected call — the company can add feedback but not change
  official status, mirroring a real TPO Cell's authority.
- **Eligibility engine** (`studentController.isEligible`) is shared logic used both when a student
  browses drives (to show an "eligible/not eligible" flag) and when they attempt to apply (hard
  server-side enforcement) — so the UI can never be bypassed by calling the API directly.
- **JWT auth** is stateless; role-based access is enforced per-route via the `authorize(...roles)`
  middleware, and deactivated accounts (`isActive: false`) are rejected at both login and on every
  subsequent authenticated request.
- **Activity logging** (`ActivityLog` model) captures registrations, logins, drive
  creation/publishing, round/decision updates, and admin actions, powering the Admin's
  "Monitor Administrative Activity" screen.
- **Forgot Password (Email OTP):** a 6-digit OTP is hashed (bcrypt) and stored with a 10-minute
  expiry and an attempt counter (max 5 tries) on the `User` document — never stored or transmitted
  in plaintext. Verifying the OTP issues a short-lived, single-purpose JWT (`purpose: 'password_reset'`,
  10-minute expiry) that the reset-password step must present — the client never gets to "just
  reset" a password without that server-verified token. `forgot-password` always returns a generic
  success message, whether or not the email is registered, to avoid leaking which emails have
  accounts.
- **Google Sign-In** uses Google Identity Services (free, uncapped) purely for **students** — a new
  Google sign-up creates the account instantly with placeholder roll number/branch/batch, and the
  student is routed straight to their profile page to fill in the real details. Existing accounts
  (by email) are simply logged in and linked to the Google ID going forward. The backend verifies
  every Google ID token server-side via `google-auth-library` before trusting it — never in the
  browser alone.
