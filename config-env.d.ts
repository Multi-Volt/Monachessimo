// The build config files read a few environment variables. Declaring
// `process` here avoids pulling Node's full type definitions into the project.
declare const process: { env: Record<string, string | undefined> };
