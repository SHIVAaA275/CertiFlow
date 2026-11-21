
import PDFDocument from "pdfkit";
import QRCode from "qrcode";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import prisma from "../config/prisma";

const certificateDirectory = path.resolve(
  process.cwd(),
  "storage",
  "certificates"
);

export async function generateCertificates(batchId: string) {
  const batch = await prisma.batch.findUnique({
    where: { id: batchId },
    include: {
      centre: true,
      candidates: {
        where: { passed: true },
        include: { certificate: true }
      }
    }
  });

  if (!batch || batch.status !== "APPROVED") {
    throw new Error("BATCH_NOT_APPROVED");
  }

  fs.mkdirSync(certificateDirectory, { recursive: true });

  const results = [];

  for (const candidate of batch.candidates) {
    let certificate = candidate.certificate;

    if (!certificate) {
      certificate = await prisma.certificate.create({
        data: {
          candidateId: candidate.id,
          certificateNumber: `CF-${crypto.randomUUID()}`,
          verificationToken: crypto.randomBytes(32).toString("hex")
        }
      });
    }

    if (certificate.revokedAt) {
      continue;
    }

    const verificationUrl =
      `${process.env.FRONTEND_URL}/verify/${certificate.verificationToken}`;

    const qrImage = await QRCode.toDataURL(verificationUrl);

    const pdfPath = path.join(
      certificateDirectory,
      `${certificate.id}.pdf`
    );

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({
        size: "A4",
        layout: "landscape",
        margin: 50
      });

      const stream = fs.createWriteStream(pdfPath);

      doc.pipe(stream);

      doc
        .fontSize(30)
        .text("CERTIFICATE OF COMPLETION", {
          align: "center"
        });

      doc.moveDown(2);

      doc
        .fontSize(18)
        .text("This certificate is awarded to", {
          align: "center"
        });

      doc.moveDown();

      doc
        .fontSize(28)
        .text(candidate.fullName, {
          align: "center"
        });

      doc.moveDown();

      doc
        .fontSize(16)
        .text(
          `For successfully completing ${batch.courseName}`,
          { align: "center" }
        );

      doc.moveDown();

      doc
        .fontSize(13)
        .text(`Training Centre: ${batch.centre.name}`, {
          align: "center"
        });

      doc.moveDown();

      doc
        .fontSize(11)
        .text(
          `Certificate Number: ${certificate.certificateNumber}`,
          { align: "center" }
        );

      doc.image(qrImage, 350, 400, {
        width: 100
      });

      doc.end();

      stream.on("finish", resolve);
      stream.on("error", reject);
      doc.on("error", reject);
    });

    await prisma.certificate.update({
      where: { id: certificate.id },
      data: { pdfPath }
    });

    results.push({
      candidate: candidate.fullName,
      certificateNumber: certificate.certificateNumber,
      verificationToken: certificate.verificationToken
    });
  }

  return results;
}
