# College Placement Management Portal

A centralized digital platform designed to streamline campus recruitment for Students, Training & Placement Officers (TPO), and Recruiting Companies.

## 🌐 Live Deployment

- **Live URL:** [https://placement-frontend-o8cy.onrender.com](https://placement-frontend-o8cy.onrender.com)

---

## 🚀 Project Overview & Tech Stack

- **Backend:** Node.js, Express, MongoDB (Mongoose)
- **Frontend:** HTML5, CSS3, Bootstrap 5, Vanilla JavaScript
- **Security:** JWT stateless authentication, bcrypt password hashing, Email OTP verification (via Brevo API)
- **DevOps & Cloud:** Docker, Kubernetes, Prometheus, Grafana, k6, Render, GitHub Actions

---

## 🏁 Milestones

### Week 1: Foundation

- Core Express server + MongoDB connection established.
- User, ActivityLog, Student, and Company schemas implemented.
- 3-step Student Registration API (Email OTP Verification + Password Setting).
- Multi-role Login UI and Session Manager.

### Week 2: Core Features

- TPO Drive creation with academic eligibility criteria and multi-round timetables.
- Company registration and approval verification system.
- Student resume uploading using Multer disk storage.
- Dynamic shell layout engine powering student and TPO portal navigation.

### Week 3: Advanced Workflows

- Complete recruitment lifecycle state machine (Eligibility check -> Application -> Round-by-round advancement -> Selection).
- Real-time student notification feed with unread counter badges.
- Company recruitment portal with requirement submission and applicant review console.
- Admin governance dashboard with system performance metrics, user provisioning, and audit trail logs.
- Comprehensive end-to-end automated testing for backend REST APIs.

### Week 4: Validation & Containerization

- Added robust client-side and server-side validation rules.
- Implemented multi-stage Dockerfiles for both Frontend (Nginx) and Backend (Node.js).
- Created `docker-compose.yml` to orchestrate the Frontend, Backend, and MongoDB locally.
- Enforced ACID compliance for user registration (preventing half-registered accounts).

### 🚀 Week 5: DevOps Pipeline, Orchestration & Observability

- **Kubernetes:** Created Deployment, Service, PVC, and Secret manifests (`k8s/`) for a local `kind` cluster.
- **Monitoring:** Integrated Prometheus and Grafana. Exposed custom `/metrics` from the backend and used a `ServiceMonitor` to scrape Node.js telemetry.
- **Load Testing:** Wrote a k6 script (`load-test.js`) to simulate up to 200 concurrent users, validating a 100% success rate on the `/api/health` endpoint.
- **Production Email:** Bypassed cloud SMTP firewalls by integrating the Brevo API for real OTP delivery.
- **Evidence:** All dashboards and terminal proofs are saved in the `docs/` and `monitoring/` directories.

---

## 📦 Container Registry

We have successfully built and pushed production-ready images to both Docker Hub and the GitHub Container Registry (GHCR).

### Docker Hub

| Service      | Image Name                                   | Pull Command                                             |
| :----------- | :------------------------------------------- | :------------------------------------------------------- |
| **Backend**  | `utkarshgupta9549/placement-backend:latest`  | `docker pull utkarshgupta9549/placement-backend:latest`  |
| **Frontend** | `utkarshgupta9549/placement-frontend:latest` | `docker pull utkarshgupta9549/placement-frontend:latest` |

### GitHub Container Registry (GHCR)

| Service      | Image Name                                           |
| :----------- | :--------------------------------------------------- |
| **Backend**  | `ghcr.io/utkarshgupta9549/placement-backend:latest`  |
| **Frontend** | `ghcr.io/utkarshgupta9549/placement-frontend:latest` |

---

## 🛠️ Local Development Setup

### 1. Environment Variables

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and set JWT_SECRET, MONGO_URI, and BREVO_API_KEY
```
