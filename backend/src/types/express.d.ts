declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth middleware from the JWT subject. */
      userId?: string;
    }
  }
}

export {};
