
import { Router } from "express";
import { Prisma, Role, BatchStatus } from "@prisma/client";
import { z } from "zod";
import prisma from "../config/prisma";
import {
  authenticate,
  authorize,
  AuthRequest
} from "../middleware/auth";

const router = Router();

const decisionSchema = z.object({
  decision: z.enum(["APPROVED", "RETURNED", "REJECTED"]),
  reason: z.string().trim().optional()
}).refine(
  (data) =>
    data.decision === "APPROVED" ||
    Boolean(data.reason),
  {
    message: "Reason is required for return or rejection"
  }
);

const QUALITY_THRESHOLD = 100;

router.post(
  "/:batchId/decisions",
  authenticate,
  authorize(Role.DISTRICT),
  async (req: AuthRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid decision or missing reason"
      });
      return;
    }

    const batchId = req.params.batchId as string;
    const { decision, reason } = parsed.data;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await prisma.$transaction(
          async (tx) => {
            const officer = await tx.user.findUnique({
              where: { id: req.user!.id },
              select: { id: true, role: true }
            });

            if (!officer || officer.role !== Role.DISTRICT) {
              return {
                status: 403,
                message: "District officer access required"
              };
            }

            const batch = await tx.batch.findUnique({
              where: { id: batchId },
              include: {
                _count: {
                  select: { candidates: true }
                }
              }
            });

            if (!batch) {
              return {
                status: 404,
                message: "Batch not found"
              };
            }

            if (batch.status !== "DISTRICT_REVIEW") {
              return {
                status: 409,
                message: "Batch is not awaiting district review"
              };
            }

            const existingApproval = await tx.approval.findUnique({
              where: {
                batchId_submissionVersion_officerId: {
                  batchId,
                  submissionVersion: batch.submissionVersion,
                  officerId: officer.id
                }
              }
            });

            if (existingApproval) {
              return {
                status: 409,
                message: "You have already reviewed this submission"
              };
            }

            await tx.approval.create({
              data: {
                batchId,
                officerId: officer.id,
                submissionVersion: batch.submissionVersion,
                decision,
                reason: reason || null
              }
            });

            const approvalCount = await tx.approval.count({
              where: {
                batchId,
                submissionVersion: batch.submissionVersion,
                decision: "APPROVED"
              }
            });

            let nextStatus: BatchStatus = batch.status;

            if (decision === "RETURNED") {
              nextStatus = "RETURNED";
            } else if (decision === "REJECTED") {
              nextStatus = "REJECTED";
            } else if (approvalCount >= 2) {
              nextStatus =
                batch._count.candidates >= QUALITY_THRESHOLD
                  ? "QUALITY_REVIEW"
                  : "STATE_REVIEW";
            }

            if (nextStatus !== batch.status) {
              await tx.batch.update({
                where: { id: batchId },
                data: {
                  status: nextStatus,
                  returnedReason:
                    decision === "RETURNED" ? reason : null
                }
              });
            }

            await tx.auditLog.create({
              data: {
                actorId: officer.id,
                batchId,
                action: `DISTRICT_${decision}`,
                details: {
                  decision,
                  reason: reason || null,
                  submissionVersion: batch.submissionVersion,
                  approvalCount,
                  nextStatus
                }
              }
            });

            return {
              status: 200,
              message: "District decision recorded",
              decision,
              approvalCount,
              nextStatus
            };
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable
          }
        );

        res.status(result.status).json(result);
        return;
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2034" &&
          attempt < 2
        ) {
          continue;
        }

        console.error("District decision error:", error);

        res.status(500).json({
          message: "Failed to record district decision"
        });
        return;
      }
    }
  }
);


router.post(
  "/:batchId/state-decision",
  authenticate,
  authorize(Role.STATE),
  async (req: AuthRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid decision or missing reason"
      });
      return;
    }

    const batchId = req.params.batchId as string;
    const { decision, reason } = parsed.data;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const officer = await tx.user.findUnique({
          where: { id: req.user!.id },
          select: { id: true, role: true }
        });

        if (!officer || officer.role !== Role.STATE) {
          return {
            status: 403,
            message: "State officer access required"
          };
        }

        const batch = await tx.batch.findUnique({
          where: { id: batchId }
        });

        if (!batch) {
          return {
            status: 404,
            message: "Batch not found"
          };
        }

        if (batch.status !== "STATE_REVIEW") {
          return {
            status: 409,
            message: "Batch is not awaiting state review"
          };
        }

        const updated = await tx.batch.updateMany({
          where: {
            id: batchId,
            status: "STATE_REVIEW",
            submissionVersion: batch.submissionVersion
          },
          data: {
            status:
              decision === "APPROVED"
                ? "APPROVED"
                : decision === "RETURNED"
                  ? "RETURNED"
                  : "REJECTED",
            approvedAt:
              decision === "APPROVED" ? new Date() : null,
            returnedReason:
              decision === "RETURNED" ? reason : null
          }
        });

        if (updated.count !== 1) {
          throw new Error("STATE_CONFLICT");
        }

        await tx.approval.create({
          data: {
            batchId,
            officerId: officer.id,
            submissionVersion: batch.submissionVersion,
            decision,
            reason: reason || null
          }
        });

        await tx.auditLog.create({
          data: {
            actorId: officer.id,
            batchId,
            action: `STATE_${decision}`,
            details: {
              submissionVersion: batch.submissionVersion,
              decision,
              reason: reason || null
            }
          }
        });

        return {
          status: 200,
          message: "State decision recorded",
          decision,
          nextStatus:
            decision === "APPROVED"
              ? "APPROVED"
              : decision === "RETURNED"
                ? "RETURNED"
                : "REJECTED"
        };
      });

      res.status(result.status).json(result);
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "STATE_CONFLICT"
      ) {
        res.status(409).json({
          message: "Batch has already been reviewed"
        });
        return;
      }

      console.error("State approval error:", error);

      res.status(500).json({
        message: "Failed to record state decision"
      });
    }
  }
);

router.post(
  "/:batchId/quality-decision",
  authenticate,
  authorize(Role.QUALITY),
  async (req: AuthRequest, res) => {
    const parsed = decisionSchema.safeParse(req.body);

    if (!parsed.success) {
      res.status(400).json({
        message: "Invalid decision or missing reason"
      });
      return;
    }

    const batchId = req.params.batchId as string;
    const { decision, reason } = parsed.data;

    try {
      const result = await prisma.$transaction(
        async (tx) => {
          const officer = await tx.user.findUnique({
            where: { id: req.user!.id },
            select: { id: true, role: true }
          });

          if (!officer || officer.role !== Role.QUALITY) {
            return {
              status: 403,
              message: "Quality officer access required"
            };
          }

          const batch = await tx.batch.findUnique({
            where: { id: batchId }
          });

          if (!batch) {
            return {
              status: 404,
              message: "Batch not found"
            };
          }

          if (batch.status !== "QUALITY_REVIEW") {
            return {
              status: 409,
              message: "Batch is not awaiting quality review"
            };
          }

          const nextStatus =
            decision === "APPROVED"
              ? "STATE_REVIEW"
              : decision === "RETURNED"
                ? "RETURNED"
                : "REJECTED";

          const updated = await tx.batch.updateMany({
            where: {
              id: batchId,
              status: "QUALITY_REVIEW",
              submissionVersion: batch.submissionVersion
            },
            data: {
              status: nextStatus,
              returnedReason:
                decision === "RETURNED" ? reason : null
            }
          });

          if (updated.count !== 1) {
            return {
              status: 409,
              message: "Batch was already reviewed"
            };
          }

          await tx.approval.create({
            data: {
              batchId,
              officerId: officer.id,
              submissionVersion: batch.submissionVersion,
              decision,
              reason: reason || null
            }
          });

          await tx.auditLog.create({
            data: {
              actorId: officer.id,
              batchId,
              action: `QUALITY_${decision}`,
              details: {
                submissionVersion: batch.submissionVersion,
                reason: reason || null,
                nextStatus
              }
            }
          });

          return {
            status: 200,
            message: "Quality decision recorded",
            decision,
            nextStatus
          };
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable
        }
      );

      res.status(result.status).json(result);
    } catch (error) {
      console.error("Quality decision error:", error);

      res.status(500).json({
        message: "Failed to record quality decision"
      });
    }
  }
);


export default router;
