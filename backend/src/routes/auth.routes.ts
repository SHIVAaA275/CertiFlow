
import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import prisma from "../config/prisma";
import { authenticate, AuthRequest } from "../middleware/auth";

const router = Router();

const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1)
});

router.post("/login", async (req, res) => {
  try {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
      res.status(400).json({
        message: "Valid email and password are required"
      });
      return;
    }

    const { email, password } = result.data;

    const user = await prisma.user.findUnique({
      where: {
        email: email.toLowerCase()
      }
    });

    if (!user) {
      res.status(401).json({
        message: "Invalid email or password"
      });
      return;
    }

    const passwordMatches = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!passwordMatches) {
      res.status(401).json({
        message: "Invalid email or password"
      });
      return;
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
      res.status(500).json({
        message: "Authentication configuration error"
      });
      return;
    }

    const token = jwt.sign(
      {
        id: user.id,
        role: user.role,
        centreId: user.centreId
      },
      secret,
      {
        expiresIn: "8h"
      }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        centreId: user.centreId
      }
    });
  } catch (error) {
    res.status(500).json({
      message: "Login failed"
    });
  }
});

router.get("/me", authenticate, async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user!.id
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        centreId: true
      }
    });

    if (!user) {
      res.status(401).json({
        message: "User no longer exists"
      });
      return;
    }

    res.json({ user });
  } catch (error) {
    res.status(500).json({
      message: "Failed to retrieve user"
    });
  }
});

export default router;
