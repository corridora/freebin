export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export class Redirect extends Error {
  status: number;
  location: string;
  constructor(status: number, location: string) {
    super("Redirect");
    this.status = status;
    this.location = location;
  }
}
export function error(status: number, message: string): never {
  throw new HttpError(status, message);
}
export function redirect(status: number, location: string): never {
  throw new Redirect(status, location);
}
export function isRedirect(value: unknown): value is Redirect {
  return value instanceof Redirect;
}
export function fail(status: number, data: Record<string, unknown>) {
  return { ...data, status };
}
