/** CSS Modules resolve to their hashed class map. */
declare module '*.module.css' {
  const classes: Record<string, string>
  export default classes
}
