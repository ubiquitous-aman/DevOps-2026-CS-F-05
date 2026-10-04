# College Placement Management Portal
A centralized digital platform designed to streamline campus recruitment for Students, Training & Placement Officers (TPO), and Recruiting Companies.
## 1. Project Overview & Scope
- **Backend Architecture**: Node.js, Express, MongoDB (MERN Stack).
- **Security**: JWT stateless authentication and bcrypt password hashing.
- **Frontend**: Responsive UI using HTML5, CSS3, Bootstrap 5, and JavaScript.
## 2. Planned Modules
- **Authentication**: Multi-role login (Student, TPO, Admin, Company) with Email OTP verification.
- **TPO Module**: Company job posting review and drive scheduling.
- **Student Module**: Academic profiling and placement eligibility verification.
- **Recruitment Pipeline**: Multi-round applicant tracking and results publication.
## Week 1 Milestone Completed
- Core Express server + MongoDB connection established.
- User, ActivityLog, Student, and Company schemas implemented.
- 3-step Student Registration API (Email OTP Verification + Password Setting).
- Multi-role Login UI and Session Manager.
## Week 2 Milestone Completed
- TPO Drive creation with academic eligibility criteria and multi-round timetables.
- Company registration and approval verification system.
- Student resume uploading using Multer disk storage.
- Dynamic shell layout engine powering student and TPO portal navigation.
## Week 3 Milestone Completed
- Complete recruitment lifecycle state machine (Eligibility check -> Application -> Round-by-round advancement -> Selection).
- Real-time student notification feed with unread counter badges.
- Company recruitment portal with requirement submission and applicant review console.
- Admin governance dashboard with system performance metrics, user provisioning, and audit trail logs.
- Interactive institutional landing page with placement highlights and portal entrypoints.
- Comprehensive end-to-end automated testing for backend REST APIs and frontend client architecture.
---
## Week 4 Milestone Completed (Validation & Workflow Updates)

**Run**
```bash
cd backend
npm install
cp .env.example .env        # set JWT_SECRET, MONGO_URI
npm run seed                # admin@placement.edu / Admin@123 , tpo@placement.edu / Tpo@1234
npm start                   # http://localhost:5000
npm run test:all            # needs MongoDB (or TEST_MONGO_URI)
npm run reset-password -- email "NewStrong@123"   # emergency reset
