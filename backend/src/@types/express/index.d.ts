import { User, Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user: (Partial<User> & {
        companyId: number;
      }) & {
        /**
         * When authenticated via JWT the middleware attaches the
         * decoded payload to `req.user`. The payload uses `userId`
         * instead of the Prisma `id` field, so we mirror that here
         * to keep TypeScript happy in controllers using
         * `req.user.userId`.
         */
        userId: number;
        role: Role;
      };
    }
  }
}