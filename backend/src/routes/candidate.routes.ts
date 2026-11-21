
import { Router } from "express";
import multer from "multer";
import { readSheet } from "read-excel-file/node";
import { Role } from "@prisma/client";
import prisma from "../config/prisma";
import { authenticate, authorize, AuthRequest } from "../middleware/auth";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, callback) => {
    if (!file.originalname.toLowerCase().endsWith(".xlsx")) {
      callback(new Error("Only .xlsx files are allowed"));
      return;
    }

    callback(null, true);
  }
});

router.post(
  "/:batchId/upload",
  authenticate,
  authorize(Role.CENTRE),
  (req, res, next) => {
    upload.single("file")(req, res, (error) => {
      if (error) {
        res.status(400).json({ message: error.message });
        return;
      }

      next();
    });
  },
  async (req: AuthRequest, res) => {
    try {
      const user = await prisma.user.findUnique({
        where: { id: req.user!.id },
        select: { role: true, centreId: true }
      });

      if (!user || user.role !== Role.CENTRE || !user.centreId) {
        res.status(403).json({ message: "Access denied" });
        return;
      }

      const batchId = req.params.batchId as string;

      const batch = await prisma.batch.findUnique({
        where: { id: batchId }
      });

      if (!batch) {
        res.status(404).json({ message: "Batch not found" });
        return;
      }

      if (batch.centreId !== user.centreId) {
        res.status(403).json({ message: "This batch belongs to another centre" });
        return;
      }

      if (batch.status !== "DRAFT" && batch.status !== "RETURNED") {
        res.status(409).json({ message: "Batch cannot be modified in its current status" });
        return;
      }

      if (!req.file) {
        res.status(400).json({ message: "Excel file is required" });
        return;
      }

      const rows = await readSheet(req.file.buffer, 1);

      const expectedHeaders = [
        "fullName",
        "email",
        "phone",
        "enrollmentNo",
        "passed"
      ];

      const headers = rows[0];

      if (
        !headers ||
        headers.length !== expectedHeaders.length ||
        expectedHeaders.some((header, index) => headers[index] !== header)
      ) {
        res.status(400).json({
          message: "Invalid Excel headers",
          expectedHeaders
        });
        return;
      }

      const candidates: {
        batchId: string;
        fullName: string;
        email: string | null;
        phone: string;
        enrollmentNo: string;
        passed: boolean;
      }[] = [];

      const errors: string[] = [];
      const enrollmentNumbers = new Set<string>();

      for (let index = 1; index < rows.length; index++) {
        const row = rows[index];

            if (!row) {
                continue;
            }

            const rowNumber = index + 1;

        const fullName = String(row[0] ?? "").trim();
        const email = String(row[1] ?? "").trim();
        const phone = String(row[2] ?? "").trim();
        const enrollmentNo = String(row[3] ?? "").trim();
        const passedValue = row[4];

        if (fullName.length < 2) {
          errors.push(`Row ${rowNumber}: Invalid full name`);
        }

        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
          errors.push(`Row ${rowNumber}: Invalid email`);
        }

        if (!/^[0-9]{10}$/.test(phone)) {
          errors.push(`Row ${rowNumber}: Phone must contain 10 digits`);
        }

        if (!enrollmentNo) {
          errors.push(`Row ${rowNumber}: Enrollment number required`);
        }

        if (enrollmentNumbers.has(enrollmentNo)) {
          errors.push(`Row ${rowNumber}: Duplicate enrollment number`);
        }

        enrollmentNumbers.add(enrollmentNo);

        const passed =
          passedValue === true ||
          String(passedValue).toLowerCase() === "true";

        const validPassed =
          passedValue === true ||
          passedValue === false ||
          String(passedValue).toLowerCase() === "true" ||
          String(passedValue).toLowerCase() === "false";

        if (!validPassed) {
          errors.push(`Row ${rowNumber}: Passed must be TRUE or FALSE`);
        }

        candidates.push({
          batchId,
          fullName,
          email: email || null,
          phone,
          enrollmentNo,
          passed
        });
      }

      if (candidates.length === 0) {
        res.status(400).json({ message: "Excel file has no candidates" });
        return;
      }

      if (errors.length > 0) {
        res.status(400).json({
          message: "Upload rejected. No candidates were saved.",
          errors
        });
        return;
      }

      const result = await prisma.$transaction(async (tx) => {
        const currentBatch = await tx.batch.findUnique({
          where: { id: batchId }
        });

        if (
          !currentBatch ||
          currentBatch.centreId !== user.centreId ||
          !["DRAFT", "RETURNED"].includes(currentBatch.status)
        ) {
          throw new Error("Batch is no longer editable");
        }

        await tx.candidate.deleteMany({
          where: { batchId }
        });

        return tx.candidate.createMany({
          data: candidates
        });
      });

      res.status(201).json({
        message: "Candidates uploaded successfully",
        batchId,
        count: result.count
      });
    } catch (error) {
      console.error("Candidate upload error:", error);

      res.status(500).json({
        message: "Failed to upload candidates"
      });
    }
  }
);

export default router;
