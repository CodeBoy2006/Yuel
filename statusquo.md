## [2026-06-27 20:39] Yuel MV3 Scaffold
- **Changes:** Initialized a WXT/React MV3 extension with Tailwind, Dexie storage schema, content-script reading event collection, background message routing, Pack validation, UI shells, tests, and documentation.
- **Status:** Completed
- **Next Steps:** Build the runtime whitelist flow and replace starter-site static matching with user-controlled optional host permission registration.
- **Context:** Use `CI=true` with pnpm commands in this environment. The generated manifest keeps broad hosts in `optional_host_permissions`; current static content-script matches cover only starter reading sites.
