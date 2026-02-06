# Developer & AI Agent Guide

Welcome to the Wildgate Stat Tracker codebase. This guide is designed to help you (or an AI agent) understand the architecture and conventions quickly.

## Architecture Overview

This is an **Electron** application with a **React** frontend. It uses a modular state management system powered by **Zustand**.

### 1. State Management (`/store`)
The store is split into slices to keep logic manageable:
- `DataSlice`: Handles matches, players, pilot registry, and favorites.
- `SettingsSlice`: User preferences (theme, language, audio).
- `UISlice`: Layouts, loading states, and active modes.
- `FormSlice`: Temporary state for match entry and editing.

**Persistence:** The store uses `zustand/middleware/persist` with a custom `StorageService` found in `utils/storage.ts`.

### 2. UI Components (`/components`)
- `DashboardLayout.tsx`: The main grid container using `react-grid-layout`.
- `recording/`: Contains panels for the active recording session (Squadron, Mission, etc.).
- `AnalyticsPanel.tsx`: Visualizations using `recharts`.

### 3. Key Utilities (`/utils`)
- `analytics.ts`: Logic for calculating win rates, trends, and performance metrics.
- `storage.ts`: Handles the underlying data saving (typically using Electron's `ipcRenderer` or local storage).
- `constants.ts`: Source of truth for game-specific data (modes, themes).

## Development Conventions

- **Types:** Always define types in `types.ts` or locally within slices.
- **Icons:** Use `lucide-react`.
- **Styling:** Primarily uses standard CSS classes defined in the components or a global stylesheet.
- **IPC:** Communication between Electron and React happens via the bridge defined in `electron/main.cjs`.

## Current Context

The user is transition to an agentic IDE (Google Antigravity). The goal is to continue building features while maintaining the modular structure of the state slices.
