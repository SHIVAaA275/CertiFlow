
import { Router } from "express";
import { Role } from "@prisma/client";
import { z } from "zod";
import prisma from "../config/prisma";
import {
  authenticate,
  authorize,
  AuthRequest
} from "../middleware/auth";

const router = Router();

const createBatchSchema = z.object({
  title: z.string().trim().min(3),
  courseName: z.string().trim().min(3)
});

router.post(
  "/",
  authenticate,
  authorize(Role.CENTRE),
  async (req: AuthRequest, res) => {
    try {
      const result = createBatchSchema.safeParse(req.body);

      if (!result.success) {
        res.status(400).json({
          message: "Valid batch title and course name are required"
        });
        return;
      }

      const user = await prisma.user.findUnique({
        where: {
          id: req.user!.id
        },
        select: {
          id: true,
          role: true,
          centreId: true
        }
      });

      if (!user || user.role !== Role.CENTRE || !user.centreId) {
        res.status(403).json({
          message: "Only authorized training centres can create batches"
        });
        return;
      }

      const batch = await prisma.batch.create({
        data: {
          title: result.data.title,
          courseName: result.data.courseName,
          centreId: user.centreId,
          createdById: user.id,
          status: "DRAFT"
        }
      });

      res.status(201).json({
        message: "Batch created successfully",
        batch
      });
    } catch (error) {
      console.error("Create batch error:", error);

      res.status(500).json({
        message: "Failed to create batch"
      });
    }
  }
);


router.post(
  "/:batchId/submit",
  authenticate,
  authorize(Role.CENTRE),
  async (req: AuthRequest, res) => {
    try {
      const batchId = req.params.batchId as string;

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          id: true,
          role: true,
          centreId: true
        }
      });

      if (!user || user.role !== Role.CENTRE || !user.centreId) {
        res.status(403).json({
          message: "Only authorized training centres can submit batches"
        });
        return;
      }

      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        include: {
          _count: {
            select: { candidates: true }
          }
        }
      });

      if (!batch) {
        res.status(404).json({
          message: "Batch not found"
        });
        return;
      }

      if (batch.centreId !== user.centreId) {
        res.status(403).json({
          message: "You do not own this batch"
        });
        return;
      }

      if (!["DRAFT", "RETURNED"].includes(batch.status)) {
        res.status(409).json({
          message: "Batch has already been submitted or cannot be submitted"
        });
        return;
      }

      if (batch._count.candidates === 0) {
        res.status(400).json({
          message: "Upload candidates before submitting"
        });
        return;
      }

      const updatedBatch = await prisma.$transaction(async (tx) => {
        const updated = await tx.batch.updateMany({
          where: {
            id: batchId,
            centreId: user.centreId!,
            status: batch.status,
            submissionVersion: batch.submissionVersion
          },
          data: {
            status: "DISTRICT_REVIEW",
            submissionVersion: {
              increment: 1
            },
            submittedAt: new Date(),
            returnedReason: null
          }
        });

        if (updated.count !== 1) {
          throw new Error("SUBMISSION_CONFLICT");
        }

        await tx.auditLog.create({
          data: {
            actorId: user.id,
            batchId,
            action: "BATCH_SUBMITTED",
            details: {
              previousStatus: batch.status,
              submissionVersion: batch.submissionVersion + 1
            }
          }
        });

        return tx.batch.findUniqueOrThrow({
          where: { id: batchId }
        });
      });

      res.json({
        message: "Batch submitted for district review",
        batch: updatedBatch
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "SUBMISSION_CONFLICT"
      ) {
        res.status(409).json({
          message: "Batch was already modified or submitted"
        });
        return;
      }

      console.error("Batch submission error:", error);

      res.status(500).json({
        message: "Failed to submit batch"
      });
    }
  }
);
router.get("/", authenticate, async (req, res) => {
  try {
    const user = (req as AuthRequest).user;

    if (!user) {
      return res.status(401).json({
        message: "Unauthorized"
      });
    }

    const batches = await prisma.batch.findMany({
      where:
        user.role === "CENTRE"
          ? { centreId: user.centreId! }
          : {},
      select: {
        id: true,
        title: true,
        courseName: true,
        status: true,
        createdAt: true,
        _count: {
          select: {
            candidates: true
          }
        }
      },
      orderBy: {
        createdAt: "desc"
      }
    });

    res.json({ batches });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Failed to fetch batches"
    });
  }
});

export default router;
