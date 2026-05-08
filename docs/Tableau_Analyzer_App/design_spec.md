# Design Specification
- **Layout**: Fullscreen SPA. Header (Upload), Sidebar (Tree View), Main Canvas (React Flow), Detail Panel (Properties/Calc).
- **Colors**: Tableau 10 Palette (Primary: `#1f77b4`, Secondary: `#ff7f0e`, Success: `#2ca02c`, Danger: `#d62728`). Background: `#f8f9fa`.
- **Components**: `App` -> `Header` (FileUploader), `Sidebar` (Overview/Insights), `Workspace` (NetworkGraph/Toolbar), `DetailPanel`.
- **Graph (React Flow)**: Rounded nodes with icons. Bezier edges (Tableau Prep style).
