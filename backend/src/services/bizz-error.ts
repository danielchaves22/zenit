export class BizzError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
  }
}
