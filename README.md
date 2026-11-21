# CertiFlow — Certificate Management & Verification System

CertiFlow is a full-stack certificate management platform developed for a hackathon. It digitizes the process of candidate registration, multi-level certificate approvals, certificate generation, verification, and revocation.

## Problem Statement

Traditional certificate issuance involves manual data handling, multiple approval stages, delays, and difficulty verifying certificate authenticity.

## Our Solution

CertiFlow provides a centralized platform for training centres and government officers to manage certificate issuance through a secure, role-based approval workflow.

## Key Features

- JWT-based authentication and role-based access control
- Batch creation and Excel candidate uploads
- Multi-level approval workflow
- Two distinct district officer approvals
- Quality and state-level verification
- Automated PDF certificate generation
- QR-code-based certificate verification
- Public certificate verification page
- Certificate revocation with reason
- WhatsApp certificate verification-link sharing
- Batch tracking and management

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | React.js, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express.js, TypeScript |
| Database | PostgreSQL |
| ORM | Prisma |
| Cache / Infrastructure | Redis, Docker |
| Authentication | JWT |
| Certificate Generation | PDF and QR Code |
| Version Control | Git and GitHub |

## Application Workflow

1. Centre officer logs in and creates a batch.
2. Candidate information is uploaded through an Excel file.
3. The batch is submitted for district review.
4. Two distinct district officers approve the batch.
5. Batches requiring quality review are forwarded to the quality officer.
6. The state officer provides final approval.
7. PDF certificates with QR codes are generated for eligible candidates.
8. Certificates can be downloaded and their verification links shared through WhatsApp.
9. Anyone with a valid verification link can check certificate authenticity.
10. State officers can revoke certificates when necessary.

## User Roles

- **Centre Officer:** Creates batches, uploads candidates, and submits batches.
- **District Officer:** Reviews and approves submitted batches.
- **Quality Officer:** Performs quality review when required.
- **State Officer:** Grants final approval, generates certificates, and revokes certificates.

## Project Structure

```text
CertiFlow/
├── backend/
│   ├── prisma/
│   ├── src/
│   └── package.json
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
├── docker-compose.yml
└── README.md
```

## Local Setup

### Backend

```bash
cd backend
npm install
```

Configure the required environment variables for PostgreSQL, Redis, and JWT authentication.

Run Prisma migrations and start the backend using the scripts defined in `backend/package.json`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`.

## Security

- JWT authentication
- Role-based authorization
- Multi-level approval workflow
- Certificate verification tokens
- Certificate revocation support

## Future Improvements

- Automated WhatsApp notifications through an official messaging API
- Email certificate delivery
- Cloud deployment
- Analytics dashboard

## GitHub Repository

https://github.com/SHIVAaA275/CertiFlow

## Project Type

Hackathon Project — Full-Stack Web Application
