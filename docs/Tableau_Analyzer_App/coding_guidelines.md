# Coding Guidelines
- **Lang/Tech**: TS (Strict), React (Vite), TailwindCSS v4.
- **Naming**: `PascalCase` for components/types, `camelCase` for variables/functions, `UPPER_SNAKE` for constants.
- **Components**: Functional only. Logic in hooks. Clear Prop types.
- **Events**: Use `e.stopPropagation()`. Avoid double-triggering. Audit old handlers on refactor.
- **Styling**: Tailwind only. No inline styles except dynamic values.
- **Testing**: Vitest + RTL. Colocation (`*.test.ts`). Web Workers logic must pass in `node` env.
- **Architecture**: `components/`, `hooks/`, `utils/`, `workers/`, `types/`.
- **State**: `useState` for local, Context/Zustand for global.
- **Errors**: Throw in logic, catch in UI with user notifications.
