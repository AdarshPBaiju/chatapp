export function getTimezoneOffsetHeaderValue(): string {
  return String(new Date().getTimezoneOffset());
}
