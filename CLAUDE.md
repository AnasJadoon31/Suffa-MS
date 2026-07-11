# OrderFlow System Rules & Tech Stack

## Core Constraints

- Mandate: No business data or copy may be hardcoded. Everything must be data-driven.
- Security: Tenant isolation must be handled via application-level scoping AND PostgreSQL Row-Level Security (RLS).
- Packages: Don't ignore any deprecation error. Fix all the package errors on the go.

## Documentation

- Document everything you have implemented in IMPLEMENTED.md file.
- Document everything remaining which you need to do in next steps in TO_IMPLEMENT.md file and keep cleaning it.
- Create a README.md file which should have the Overview of the whole project, its all models.

## References

- You will use the IMPLEMENTED.md and TO_IMPLEMENT.md

## Procedure

- Always make a plan before implementing anything major.
- As the application will be deployed on Coolify, so the app should be made according to its format using Dockerfile.
- Dockerfile should be efficient in means of caching.
- Always do work step by step, don't do all the work at once to avoid hallucination and get best results.
- Always break down the task into subtasks, and utilize as many agents as you want to keep the flow smooth and efficient.
- Create a dev container and work on the project inside it, and run all the test databases within it.
- Always mention the required environment variables in .env file and try to keep the project as controllable as possible by keeping things in .env file.
- Make professional Directory Tree of the project and keep every file organized.
- Setup and use PostgreSQL MCP server so that you don't have to write scripts to test database each time.
- Always recheck after completing the task for any mistakes.
- Keep searching for TypeScript errors
