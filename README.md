<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# Wildgate Stat Tracker

A specialized stat tracking and analytics application for **Artifact Brawl** and **Fleet Battle**, built as a high-performance desktop application.

## 🚀 Overview

Wildgate Stat Tracker provides real-time tracking, match history, and deep analytics for competitive players. It features a customizable dashboard layout, automated log recording, and Discord Rich Presence integration.

## 🛠️ Technology Stack

- **Core Framework:** [React 18](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/)
- **Desktop Wrapper:** [Electron](https://www.electronjs.org/)
- **Build Tool:** [Vite](https://vitejs.dev/)
- **State Management:** [Zustand](https://github.com/pmndrs/zustand) (with persistent storage)
- **UI & Visualization:** 
  - [Lucide React](https://lucide.dev/) for iconography
  - [Recharts](https://recharts.org/) for analytics
  - [React Grid Layout](https://github.com/react-grid-layout/react-grid-layout) for the dashboard
- **Styling:** Custom CSS with theme support (Twilight, Ocean, etc.)

## 📦 Project Structure

- `/components`: UI building blocks (Dashboard, Analytics, etc.)
- `/electron`: Main process and window management logic.
- `/hooks`: Custom React hooks for Discord RPC, sound effects, and shortcuts.
- `/store`: Zustand state slices (Data, UI, Settings, Forms).
- `/utils`: Utility functions for analytics, storage, and translations.

## ⚙️ Development Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Run Web Dev Server:**
   ```bash
   npm run dev
   ```

3. **Run Desktop App (Electron):**
   ```bash
   npm run electron:dev
   ```

4. **Build for Production:**
   ```bash
   npm run electron:build
   ```

## 📝 Roadmap & Tasks

See [TODO.md](TODO.md) for current progress and upcoming features.
