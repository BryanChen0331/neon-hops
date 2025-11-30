# Neon Hops 🍺

**Neon Hops** is an interactive 3D brand activation platform developed for the collaboration between **Floating Brewing** and **Noise Fest**.

This project bridges the gap between craft beer culture and the indie music scene. It features an immersive WebGL experience, a generative 3D "Label Lab," and a high-concurrency ticketing system to drive user engagement and brand loyalty.

## 💡 Project Concept & User Journey

The goal is to transform passive viewers into active participants through digital interaction.

1.  **Immersive Storytelling:** Users enter a high-end 3D scrolling experience that visually merges the brewing process with sound waves.
2.  **The Label Lab (Generative Game):** Users design their own custom beer label using a 3D editor. The final design is generated as an image asset for social sharing.
3.  **Incentivized Conversion:** Users who save their label design gain exclusive access to the **"Time-Limited Free Ticket Giveaway"** for the Noise Fest.

## 🚀 Technical Architecture

This project adopts a **Hybrid Deployment Strategy** to optimize for both frontend performance (SEO/Edge) and backend reliability (Long-running processes).

### 🎨 Frontend: Immersive & Interactive

- **Engine:** **React Three Fiber (R3F)** ecosystem for declarative 3D scenes.
- **Performance:** Utilizes **Zustand** for transient state updates to maintain 60FPS during complex animations, avoiding unnecessary React re-renders.
- **Generative Art:** Implements custom shaders and canvas manipulation to generate unique user assets.
- **Deployment:** **Vercel** (Edge Network) for optimal content delivery and SEO.

### ⚡ Backend: High Concurrency & Reliability

- **Traffic Shaping:** Uses **RabbitMQ** to handle burst traffic during ticket giveaways, queuing requests to protect the database.
- **Concurrency Control:** Implements **Redis Distributed Locks** (Lua Scripts) to guarantee atomic inventory deduction and prevent overselling.
- **Data Integrity:** Built on **PostgreSQL** with **Prisma Transactions** to ensure ACID compliance for user data.
- **Deployment:** **Railway** (Docker Containerized) for stateful services and background workers.

## 🛠 Tech Stack

- **Monorepo:** Turborepo, pnpm
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, R3F, Zustand
- **Backend:** NestJS, Prisma, PostgreSQL, Redis, RabbitMQ
- **Validation:** Zod (Single Source of Truth shared between Web & API)
- **DevOps:** Docker, GitHub Actions, Vercel, Railway

## 📦 Project Structure

```bash
.
├── apps
│   ├── web/    # Next.js Application (Deployed on Vercel)
│   └── api/    # NestJS Application (Deployed on Railway)
└── packages    # Shared configurations (TS Types, Zod Schemas)
```

## 🔧 Getting Started

Ensure you have `Node.js (LTS)`, `pnpm`, and `Docker` installed.

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Start Infrastructure

Start PostgreSQL and Redis containers using Docker Compose:

```bash
docker-compose up -d
```

### 3. Setup Environment Variables

Copy the example environment files and configure them (Database URL, Redis Host, etc.):

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
```

### 4. Run Development Server

Start both Frontend and Backend in parallel:

```bash
pnpm dev
```

The applications will be available at:

- **Web:** <http://localhost:3000>
- **API:** <http://localhost:4000>

---

_Designed & Developed for Technical Showcase._
