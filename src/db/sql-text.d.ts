// Bun's `with { type: "text" }` import attribute returns the file contents as
// a string. TypeScript does not know this by default, so declare it here.
declare module "*.sql" {
  const content: string;
  export default content;
}
