// An error the API can show to the admin as-is, with its HTTP status code.
export class ServiceError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
