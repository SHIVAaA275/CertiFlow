
import { Router } from "express";
import { Role } from "@prisma/client";
import prisma from "../config/prisma";
import {
  authenticate,
  authorize,
  AuthRequest
} from "../middleware/auth";
import { generateCertificates } from "../services/certificate.service";

const router = Router();

router.post(
  "/batches/:batchId/generate-certificates",
  authenticate,
  authorize(Role.STATE),
  async (req: AuthRequest, res) => {
    try {
      const batchId = req.params.batchId as string;

      const certificates = await generateCertificates(batchId);

      res.json({
        message: "Certificates generated successfully",
        count: certificates.length,
        certificates
      });
    } catch (error) {
      if (
        error instanceof Error &&
        error.message === "BATCH_NOT_APPROVED"
      ) {
        res.status(409).json({
          message: "Batch must be approved first"
        });
        return;
      }

      console.error(error);

      res.status(500).json({
        message: "Certificate generation failed"
      });
    }
  }
);

router.get(
  "/verify/:token",
  async (req, res) => {
    const token = req.params.token as string;

    const certificate = await prisma.certificate.findUnique({
      where: { verificationToken: token },
      include: {
        candidate: {
          include: {
            batch: {
              include: { centre: true }
            }
          }
        }
      }
    });

    if (!certificate) {
      res.status(404).json({
        valid: false,
        message: "Certificate not found"
      });
      return;
    }

    if (certificate.revokedAt) {
      res.json({
        valid: false,
        status: "REVOKED",
        reason: certificate.revokedReason
      });
      return;
    }

    res.json({
      valid: true,
      status: "VALID",
      certificateNumber: certificate.certificateNumber,
      candidateName: certificate.candidate.fullName,
      courseName: certificate.candidate.batch.courseName,
      centreName: certificate.candidate.batch.centre.name,
      issuedAt: certificate.issuedAt
    });
  }
);

router.get(
  "/certificates/:id/download",
  authenticate,
  async (req: AuthRequest, res) => {
    const certificate = await prisma.certificate.findUnique({
      where: { id: req.params.id as string },
      include: {
        candidate: {
          include: { batch: true }
        }
      }
    });

    if (!certificate || !certificate.pdfPath) {
      res.status(404).json({
        message: "Certificate PDF not found"
      });
      return;
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      select: { role: true, centreId: true }
    });

    if (
      !user ||
      (user.role === Role.CENTRE &&
        user.centreId !== certificate.candidate.batch.centreId)
    ) {
      res.status(403).json({
        message: "Access denied"
      });
      return;
    }

    if (certificate.revokedAt) {
      res.status(410).json({
        message: "Certificate has been revoked"
      });
      return;
    }

    res.download(certificate.pdfPath);
  }
);


router.patch(
  "/certificates/:id/revoke",
  authenticate,
  authorize(Role.STATE),
  async (req: AuthRequest, res) => {
    const certificateId = req.params.id as string;
    const reason = req.body?.reason;

    if (
      typeof reason !== "string" ||
      reason.trim().length < 5
    ) {
      res.status(400).json({
        message: "Revocation reason must contain at least 5 characters"
      });
      return;
    }

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

        const certificate = await tx.certificate.findUnique({
          where: { id: certificateId },
          include: {
            candidate: true
          }
        });

        if (!certificate) {
          return {
            status: 404,
            message: "Certificate not found"
          };
        }

        if (certificate.revokedAt) {
          return {
            status: 409,
            message: "Certificate is already revoked"
          };
        }

        const updated = await tx.certificate.updateMany({
          where: {
            id: certificateId,
            revokedAt: null
          },
          data: {
            revokedAt: new Date(),
            revokedReason: reason.trim()
          }
        });

        if (updated.count !== 1) {
          return {
            status: 409,
            message: "Certificate is already revoked"
          };
        }

        await tx.auditLog.create({
          data: {
            actorId: officer.id,
            batchId: certificate.candidate.batchId,
            action: "CERTIFICATE_REVOKED",
            details: {
              certificateId,
              reason: reason.trim()
            }
          }
        });

        return {
          status: 200,
          message: "Certificate revoked successfully",
          certificateId
        };
      });

      res.status(result.status).json(result);
    } catch (error) {
      console.error("Certificate revocation error:", error);

      res.status(500).json({
        message: "Failed to revoke certificate"
      });
    }
  }
);


router.get(
  "/batches/:batchId/certificates",
  authenticate,
  async (req: AuthRequest, res) => {
    try {
      const batchId = req.params.batchId as string;

      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: {
          role: true,
          centreId: true
        }
      });

      if (!user) {
        res.status(401).json({
          message: "User not found"
        });
        return;
      }

      const batch = await prisma.batch.findUnique({
        where: { id: batchId },
        select: {
          id: true,
          title: true,
          status: true,
          centreId: true
        }
      });

      if (!batch) {
        res.status(404).json({
          message: "Batch not found"
        });
        return;
      }

      if (
        user.role === Role.CENTRE &&
        user.centreId !== batch.centreId
      ) {
        res.status(403).json({
          message: "Access denied"
        });
        return;
      }

      const certificates = await prisma.certificate.findMany({
        where: {
          candidate: {
            batchId
          }
        },
        select: {
          id: true,
          certificateNumber: true,
          verificationToken: true,
          issuedAt: true,
          revokedAt: true,
          revokedReason: true,
          candidate: {
            select: {
              fullName: true,
              enrollmentNo: true,
              passed: true
            }
          }
        },
        orderBy: {
          issuedAt: "asc"
        }
      });

      res.json({
        batch: {
          id: batch.id,
          title: batch.title,
          status: batch.status
        },
        count: certificates.length,
        certificates
      });
    } catch (error) {
      console.error("Certificate list error:", error);

      res.status(500).json({
        message: "Failed to fetch certificates"
      });
    }
  }
);


export default router;
