
import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Role } from "@prisma/client";

export interface AuthRequest extends Request {
  user?: {
    id: string;
    role: Role;
    centreId: string | null;
  };
}

export function authenticate(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({
      message: "Authentication token required"
    });
    return;
  }

  const token = header.slice(7);

  try {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
      res.status(500).json({
        message: "Authentication configuration error"
      });
      return;
    }

    const decoded = jwt.verify(token, secret) as JwtPayload;

    if (
      typeof decoded.id !== "string" ||
      !Object.values(Role).includes(decoded.role as Role)
    ) {
      res.status(401).json({
        message: "Invalid token"
      });
      return;
    }

    req.user = {
      id: decoded.id,
      role: decoded.role as Role,
      centreId:
        typeof decoded.centreId === "string"
          ? decoded.centreId
          : null
    };

    next();
  } catch {
    res.status(401).json({
      message: "Invalid or expired token"
    });
  }
}

export function authorize(...roles: Role[]) {
  return (
    req: AuthRequest,
    res: Response,
    next: NextFunction
  ): void => {
    if (!req.user) {
      res.status(401).json({
        message: "Authentication required"
      });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        message: "Access denied"
      });
      return;
    }

    next();
  };
}
