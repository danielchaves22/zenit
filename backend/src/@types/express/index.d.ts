import { User } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user: User & { 
        companyId?: number  // Substituímos companyIds[] por um único companyId
      };
    }
  }
}