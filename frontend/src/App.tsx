
import { useEffect, useState, type FormEvent } from "react";
import axios from "axios";
import api from "./api";

type User = {
  id: string;
  name: string;
  email: string;
  role: string;
};

type Batch = {
  id: string;
  title: string;
  courseName: string;
  status: string;
  createdAt: string;
  _count: {
    candidates: number;
  };
};

type Certificate = {
  id: string;
  certificateNumber: string;
  verificationToken: string;
  revokedAt: string | null;
  candidate: {
    fullName: string;
    enrollmentNo: string;
  };
};

type VerificationResult = {
  valid: boolean;
  status: string;
  candidateName?: string;
  courseName?: string;
  centreName?: string;
  certificateNumber?: string;
  reason?: string;
  message?: string;
};

const inputClass = "w-full rounded border p-3";

const blueButton =
  "rounded bg-blue-700 px-5 py-3 text-white disabled:opacity-50";

const greenButton =
  "rounded bg-green-700 px-5 py-3 text-white disabled:opacity-50";

const cardClass = "mt-6 rounded-lg bg-white p-6 shadow";

function getError(error: unknown, fallback: string) {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.message || fallback;
  }

  return fallback;
}

async function fetchVerification(
  token: string
): Promise<VerificationResult> {
  try {
    const response = await api.get(
      `/verify/${encodeURIComponent(token)}`
    );

    return response.data;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const data = error.response?.data;

      if (data && typeof data.status === "string") {
        return {
          valid: data.valid === true,
          status: data.status,
          candidateName: data.candidateName,
          courseName: data.courseName,
          centreName: data.centreName,
          certificateNumber: data.certificateNumber,
          reason: data.reason,
          message: data.message,
        };
      }

      if (error.response?.status === 404) {
        return {
          valid: false,
          status: "NOT FOUND",
        };
      }
    }

    throw error;
  }
}

function VerificationDetails({
  result,
}: {
  result: VerificationResult;
}) {
  return (
    <div className="mt-4 space-y-2 rounded bg-gray-100 p-4">
      <p
        className={`font-bold ${
          result.valid
            ? "text-green-700"
            : "text-red-600"
        }`}
      >
        Status: {result.status}
      </p>

      <p>
        <strong>Candidate:</strong>{" "}
        {result.candidateName || "N/A"}
      </p>

      <p>
        <strong>Course:</strong>{" "}
        {result.courseName || "N/A"}
      </p>

      <p>
        <strong>Centre:</strong>{" "}
        {result.centreName || "N/A"}
      </p>

      {result.certificateNumber && (
        <p>
          <strong>Certificate Number:</strong>{" "}
          {result.certificateNumber}
        </p>
      )}

      {result.reason && (
        <p>
          <strong>Reason:</strong> {result.reason}
        </p>
      )}

      {result.message && <p>{result.message}</p>}
    </div>
  );
}

function PublicVerificationPage({
  token,
}: {
  token: string;
}) {
  const [result, setResult] =
    useState<VerificationResult | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    async function verify() {
      setLoading(true);
      setError("");

      try {
        const data = await fetchVerification(token);

        if (active) {
          setResult(data);
        }
      } catch (err: unknown) {
        if (active) {
          setError(
            getError(err, "Unable to verify certificate")
          );
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void verify();

    return () => {
      active = false;
    };
  }, [token]);

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-700 p-5 text-white">
        <h1 className="text-center text-2xl font-bold">
          CertiFlow
        </h1>
      </header>

      <main className="mx-auto mt-12 max-w-xl p-4">
        <div className="rounded-lg bg-white p-8 shadow">
          <h2 className="text-center text-2xl font-bold">
            Certificate Verification
          </h2>

          <p className="mt-2 text-center text-gray-500">
            Official certificate verification result
          </p>

          {loading && (
            <p className="mt-6 text-center">
              Verifying certificate...
            </p>
          )}

          {error && (
            <p className="mt-6 text-red-600">
              {error}
            </p>
          )}

          {result && (
            <VerificationDetails result={result} />
          )}
        </div>
      </main>
    </div>
  );
}

function Dashboard() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState("");

  const [title, setTitle] = useState("");
  const [courseName, setCourseName] = useState("");

  const [batchId, setBatchId] = useState("");
  const [batchStatus, setBatchStatus] = useState("");

  const [batches, setBatches] = useState<Batch[]>([]);
  const [loadingBatches, setLoadingBatches] =
    useState(false);

  const [file, setFile] = useState<File | null>(null);

  const [decision, setDecision] = useState("APPROVED");
  const [reason, setReason] = useState("");

  const [revokeReasons, setRevokeReasons] = useState<
    Record<string, string>
  >({});

  const [certificates, setCertificates] =
    useState<Certificate[]>([]);

  const [verificationToken, setVerificationToken] =
    useState("");

  const [verificationResult, setVerificationResult] =
    useState<VerificationResult | null>(null);

  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function loadBatches() {
    setLoadingBatches(true);

    try {
      const response = await api.get("/batches");

      setBatches(response.data.batches || []);
    } catch (err: unknown) {
      setMessage(
        getError(err, "Failed to load batches")
      );
    } finally {
      setLoadingBatches(false);
    }
  }

  async function handleLogin(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setError("");
    setBusy(true);

    try {
      const response = await api.post("/auth/login", {
        email,
        password,
      });

      localStorage.setItem(
        "certiflow_token",
        response.data.token
      );

      setUser(response.data.user);
      setPassword("");
      setMessage("");

      try {
        const result = await api.get("/batches");

        setBatches(result.data.batches || []);
      } catch {
        setBatches([]);
      }
    } catch (err: unknown) {
      setError(getError(err, "Login failed"));
    } finally {
      setBusy(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem("certiflow_token");

    setUser(null);
    setBatches([]);
    setBatchId("");
    setBatchStatus("");
    setCertificates([]);
    setVerificationToken("");
    setVerificationResult(null);
    setMessage("");
    setDecision("APPROVED");
    setReason("");
    setRevokeReasons({});
    setFile(null);
  }

  function selectBatch(batch: Batch) {
    setBatchId(batch.id);
    setBatchStatus(batch.status);
    setCertificates([]);
    setVerificationToken("");
    setVerificationResult(null);
    setMessage(`Selected: ${batch.title}`);
  }

  async function createBatch(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    setBusy(true);
    setMessage("");

    try {
      const response = await api.post("/batches", {
        title,
        courseName,
      });

      setBatchId(response.data.batch.id);
      setBatchStatus(response.data.batch.status);

      setTitle("");
      setCourseName("");
      setFile(null);
      setCertificates([]);

      await loadBatches();

      setMessage("Batch created successfully!");
    } catch (err: unknown) {
      setMessage(
        getError(err, "Failed to create batch")
      );
    } finally {
      setBusy(false);
    }
  }

  async function uploadCandidates(
    e: FormEvent<HTMLFormElement>
  ) {
    e.preventDefault();

    if (!batchId.trim() || !file) {
      setMessage(
        "Select a batch and an Excel file"
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const formData = new FormData();

      formData.append("file", file);

      const response = await api.post(
        `/batches/${batchId.trim()}/upload`,
        formData
      );

      await loadBatches();

      setMessage(
        `${response.data.count} candidates uploaded successfully!`
      );
    } catch (err: unknown) {
      setMessage(
        getError(err, "Excel upload failed")
      );
    } finally {
      setBusy(false);
    }
  }

  async function submitBatch() {
    if (!batchId.trim()) {
      setMessage("Select a batch");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await api.post(
        `/batches/${batchId.trim()}/submit`
      );

      setBatchStatus(response.data.batch.status);

      await loadBatches();

      setMessage(
        "Batch submitted for district review!"
      );
    } catch (err: unknown) {
      setMessage(
        getError(err, "Failed to submit batch")
      );
    } finally {
      setBusy(false);
    }
  }

  async function reviewBatch() {
    if (!batchId.trim() || !user) {
      setMessage("Select a batch");
      return;
    }

    if (
      decision !== "APPROVED" &&
      !reason.trim()
    ) {
      setMessage("Enter a reason");
      return;
    }

    let endpoint = "";

    if (user.role === "DISTRICT") {
      endpoint =
        `/batches/${batchId.trim()}/decisions`;
    } else if (user.role === "QUALITY") {
      endpoint =
        `/batches/${batchId.trim()}/quality-decision`;
    } else if (user.role === "STATE") {
      endpoint =
        `/batches/${batchId.trim()}/state-decision`;
    } else {
      setMessage(
        "Your role cannot review batches"
      );
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await api.post(endpoint, {
        decision,
        ...(decision !== "APPROVED"
          ? { reason: reason.trim() }
          : {}),
      });

      const nextStatus =
        response.data.nextStatus ||
        response.data.batch?.status ||
        "";

      setBatchStatus(nextStatus);

      const approvalText =
        response.data.approvalCount !== undefined
          ? ` District approvals: ${response.data.approvalCount}.`
          : "";

      await loadBatches();

      setMessage(
        `${response.data.message || "Decision submitted"}.${approvalText} Status: ${nextStatus}`
      );

      setReason("");
    } catch (err: unknown) {
      setMessage(getError(err, "Review failed"));
    } finally {
      setBusy(false);
    }
  }

  async function loadCertificates() {
    if (!batchId.trim()) {
      setMessage("Select a batch");
      return;
    }

    setBusy(true);

    try {
      const response = await api.get(
        `/batches/${batchId.trim()}/certificates`
      );

      setCertificates(
        response.data.certificates || []
      );

      setMessage(
        `${response.data.count} certificates found`
      );
    } catch (err: unknown) {
      setMessage(
        getError(err, "Failed to load certificates")
      );
    } finally {
      setBusy(false);
    }
  }

  async function generateBatchCertificates() {
    if (!batchId.trim()) {
      setMessage("Select a batch");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const response = await api.post(
        `/batches/${batchId.trim()}/generate-certificates`
      );

      const listResponse = await api.get(
        `/batches/${batchId.trim()}/certificates`
      );

      setCertificates(
        listResponse.data.certificates || []
      );

      setMessage(
        `${response.data.count} certificates generated successfully!`
      );
    } catch (err: unknown) {
      setMessage(
        getError(
          err,
          "Certificate generation failed"
        )
      );
    } finally {
      setBusy(false);
    }
  }

  async function downloadCertificate(
    certificate: Certificate
  ) {
    setBusy(true);

    try {
      const response = await api.get(
        `/certificates/${certificate.id}/download`,
        { responseType: "blob" }
      );

      const url = URL.createObjectURL(
        response.data
      );

      const link = document.createElement("a");

      link.href = url;
      link.download =
        `${certificate.candidate.fullName}-certificate.pdf`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setMessage(
        getError(
          err,
          "Certificate download failed"
        )
      );
    } finally {
      setBusy(false);
    }
  }

  // WHATSAPP SHARING
  function shareOnWhatsApp(
    certificate: Certificate
  ) {
    if (certificate.revokedAt) {
      setMessage(
        "Revoked certificates cannot be shared"
      );
      return;
    }

    if (!certificate.verificationToken) {
      setMessage(
        "Verification token is missing"
      );
      return;
    }

    const candidateName =
      certificate.candidate.fullName;

    const certificateNumber =
      certificate.certificateNumber;

    const verificationLink =
      `${window.location.origin}/verify/` +
      encodeURIComponent(
        certificate.verificationToken
      );

    const message = `🎓 Congratulations ${candidateName}!

Your certificate has been issued successfully through CertiFlow.

👤 Candidate: ${candidateName}
📜 Certificate Number: ${certificateNumber}

🔗 Verify your certificate:
${verificationLink}

Issued through CertiFlow Certificate Management System.`;

    const whatsappUrl =
      `https://wa.me/?text=${encodeURIComponent(message)}`;

    window.open(
      whatsappUrl,
      "_blank",
      "noopener,noreferrer"
    );
  }

  async function verifyCertificate(
    token?: string
  ) {
    const selectedToken =
      (token || verificationToken).trim();

    if (!selectedToken) {
      setMessage(
        "Verification token is missing"
      );
      return;
    }

    setVerificationToken(selectedToken);
    setBusy(true);
    setVerificationResult(null);
    setMessage("");

    try {
      const result = await fetchVerification(
        selectedToken
      );

      setVerificationResult(result);
    } catch (err: unknown) {
      setMessage(
        getError(
          err,
          "Certificate verification failed"
        )
      );
    } finally {
      setBusy(false);
    }
  }

  function selectCertificateForVerification(
    certificate: Certificate
  ) {
    if (!certificate.verificationToken) {
      setMessage(
        "This certificate has no verification token"
      );
      return;
    }

    void verifyCertificate(
      certificate.verificationToken
    );

    document
      .getElementById("verification-section")
      ?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
  }

  async function revokeCertificate(
    certificateId: string
  ) {
    if (user?.role !== "STATE") {
      setMessage(
        "Only STATE officers can revoke certificates"
      );
      return;
    }

    const revokeReason =
      revokeReasons[certificateId]?.trim();

    if (!revokeReason) {
      setMessage(
        "Please enter a revocation reason"
      );
      return;
    }

    if (
      !window.confirm(
        "Are you sure? This certificate will become invalid."
      )
    ) {
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      await api.patch(
        `/certificates/${certificateId}/revoke`,
        { reason: revokeReason }
      );

      const response = await api.get(
        `/batches/${batchId.trim()}/certificates`
      );

      setCertificates(
        response.data.certificates || []
      );

      setRevokeReasons((previous) => ({
        ...previous,
        [certificateId]: "",
      }));

      setVerificationResult(null);

      setMessage(
        "Certificate revoked successfully!"
      );
    } catch (err: unknown) {
      setMessage(
        getError(
          err,
          "Certificate revocation failed"
        )
      );
    } finally {
      setBusy(false);
    }
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-100 p-4">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm rounded-lg bg-white p-8 shadow"
        >
          <h1 className="text-center text-3xl font-bold text-blue-700">
            CertiFlow
          </h1>

          <p className="mt-2 text-center text-gray-500">
            Certificate Management System
          </p>

          <label className="mt-8 block font-medium">
            Email
          </label>

          <input
            type="email"
            required
            placeholder="Enter email"
            value={email}
            onChange={(e) =>
              setEmail(e.target.value)
            }
            className={`mt-2 ${inputClass}`}
          />

          <label className="mt-4 block font-medium">
            Password
          </label>

          <input
            type="password"
            required
            placeholder="Enter password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            className={`mt-2 ${inputClass}`}
          />

          {error && (
            <p className="mt-3 text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className={`mt-6 w-full ${blueButton}`}
          >
            {busy ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-blue-700 p-5 text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <h1 className="text-2xl font-bold">
            CertiFlow
          </h1>

          <button
            onClick={handleLogout}
            className="rounded bg-white px-4 py-2 text-blue-700"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-5xl p-6">
        <h2 className="text-2xl font-bold">
          Welcome, {user.name}
        </h2>

        <p className="mt-2 text-gray-600">
          Role: {user.role}
        </p>

        {/* MY BATCHES */}
        <div className={cardClass}>
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold">
              My Batches
            </h3>

            <button
              onClick={loadBatches}
              disabled={loadingBatches}
              className={blueButton}
            >
              {loadingBatches
                ? "Loading..."
                : "Refresh"}
            </button>
          </div>

          {batches.length === 0 ? (
            <p className="text-gray-500">
              No batches found. Click Refresh.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border p-3">
                      Batch
                    </th>

                    <th className="border p-3">
                      Candidates
                    </th>

                    <th className="border p-3">
                      Status
                    </th>

                    <th className="border p-3">
                      Action
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {batches.map((batch) => (
                    <tr key={batch.id}>
                      <td className="border p-3">
                        <p className="font-semibold">
                          {batch.title}
                        </p>

                        <p className="text-sm text-gray-500">
                          {batch.courseName}
                        </p>
                      </td>

                      <td className="border p-3">
                        {batch._count?.candidates ?? 0}
                      </td>

                      <td className="border p-3">
                        <span className="rounded bg-blue-100 px-3 py-1 text-sm text-blue-800">
                          {batch.status}
                        </span>
                      </td>

                      <td className="border p-3">
                        <button
                          onClick={() =>
                            selectBatch(batch)
                          }
                          className={greenButton}
                        >
                          Select Batch
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* SELECTED BATCH */}
        <div className={cardClass}>
          <h3 className="mb-3 text-xl font-bold">
            Selected Batch
          </h3>

          <p className="break-all text-sm">
            <strong>Batch ID:</strong>{" "}
            {batchId || "No batch selected"}
          </p>

          <p className="mt-2">
            <strong>Status:</strong>{" "}
            {batchStatus || "Not selected"}
          </p>
        </div>

        {/* CENTRE DASHBOARD */}
        {user.role === "CENTRE" && (
          <>
            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div className="rounded-lg bg-white p-6 shadow">
                <h3 className="mb-4 text-xl font-bold">
                  Create Batch
                </h3>

                <form onSubmit={createBatch}>
                  <label className="mb-1 block">
                    Batch Title
                  </label>

                  <input
                    type="text"
                    placeholder="Web Development Batch"
                    value={title}
                    onChange={(e) =>
                      setTitle(e.target.value)
                    }
                    required
                    minLength={3}
                    className={`mb-4 ${inputClass}`}
                  />

                  <label className="mb-1 block">
                    Course Name
                  </label>

                  <input
                    type="text"
                    placeholder="Full Stack Development"
                    value={courseName}
                    onChange={(e) =>
                      setCourseName(e.target.value)
                    }
                    required
                    minLength={3}
                    className={`mb-4 ${inputClass}`}
                  />

                  <button
                    type="submit"
                    disabled={busy}
                    className={blueButton}
                  >
                    Create Batch
                  </button>
                </form>
              </div>

              <div className="rounded-lg bg-white p-6 shadow">
                <h3 className="mb-4 text-xl font-bold">
                  Upload Candidates
                </h3>

                <form onSubmit={uploadCandidates}>
                  <label className="mb-1 block">
                    Batch ID
                  </label>

                  <input
                    type="text"
                    placeholder="Select or enter batch ID"
                    value={batchId}
                    onChange={(e) => {
                      setBatchId(e.target.value);
                      setBatchStatus("");
                      setCertificates([]);
                    }}
                    required
                    className={`mb-4 ${inputClass}`}
                  />

                  <label className="mb-1 block">
                    Excel File (.xlsx)
                  </label>

                  <input
                    type="file"
                    accept=".xlsx"
                    onChange={(e) =>
                      setFile(
                        e.target.files?.[0] || null
                      )
                    }
                    required
                    className={`mb-4 ${inputClass}`}
                  />

                  <button
                    type="submit"
                    disabled={busy}
                    className={greenButton}
                  >
                    Upload Excel
                  </button>
                </form>
              </div>
            </div>

            <div className={cardClass}>
              <h3 className="mb-3 text-xl font-bold">
                Submit Batch for Approval
              </h3>

              <p className="mb-4 text-sm text-gray-600">
                Upload candidates before submitting.
              </p>

              <button
                onClick={submitBatch}
                disabled={
                  busy ||
                  !batchId.trim() ||
                  (batchStatus !== "" &&
                    batchStatus !== "DRAFT" &&
                    batchStatus !== "RETURNED")
                }
                className="rounded bg-orange-600 px-5 py-3 text-white disabled:opacity-50"
              >
                Submit Batch
              </button>
            </div>

            <div className={cardClass}>
              <h3 className="mb-3 text-xl font-bold">
                Batch Certificates
              </h3>

              <button
                onClick={loadCertificates}
                disabled={busy || !batchId.trim()}
                className="rounded bg-gray-700 px-5 py-3 text-white disabled:opacity-50"
              >
                View Certificates
              </button>
            </div>
          </>
        )}

        {/* OFFICER DASHBOARD */}
        {user.role !== "CENTRE" && (
          <div className={cardClass}>
            <h3 className="mb-4 text-xl font-bold">
              {user.role} Dashboard
            </h3>

            <label className="mb-2 block font-medium">
              Batch ID
            </label>

            <input
              type="text"
              placeholder="Select or enter batch ID"
              value={batchId}
              onChange={(e) => {
                setBatchId(e.target.value);
                setBatchStatus("");
                setCertificates([]);
              }}
              className={`mb-4 ${inputClass}`}
            />

            <label className="mb-2 block font-medium">
              Decision
            </label>

            <select
              value={decision}
              onChange={(e) =>
                setDecision(e.target.value)
              }
              className={`mb-4 ${inputClass}`}
            >
              <option value="APPROVED">
                Approve
              </option>

              <option value="RETURNED">
                Return for Correction
              </option>

              <option value="REJECTED">
                Reject
              </option>
            </select>

            {decision !== "APPROVED" && (
              <textarea
                placeholder="Enter reason"
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value)
                }
                className={`mb-4 ${inputClass}`}
              />
            )}

            <button
              onClick={reviewBatch}
              disabled={
                busy ||
                !batchId.trim() ||
                (batchStatus !== "" &&
                  batchStatus !==
                    (user.role === "DISTRICT"
                      ? "DISTRICT_REVIEW"
                      : user.role === "QUALITY"
                      ? "QUALITY_REVIEW"
                      : "STATE_REVIEW"))
              }
              className={blueButton}
            >
              Submit Decision
            </button>

            {batchStatus && (
              <p className="mt-4">
                <strong>Batch Status:</strong>{" "}
                {batchStatus}
              </p>
            )}
          </div>
        )}

        {/* STATE CERTIFICATE MANAGEMENT */}
        {user.role === "STATE" && (
          <div className={cardClass}>
            <h3 className="mb-4 text-xl font-bold">
              Certificate Management
            </h3>

            <div className="flex flex-wrap gap-3">
              <button
                onClick={generateBatchCertificates}
                disabled={
                  busy ||
                  !batchId.trim() ||
                  (batchStatus !== "" &&
                    batchStatus !== "APPROVED")
                }
                className={greenButton}
              >
                Generate Certificates
              </button>

              <button
                onClick={loadCertificates}
                disabled={busy || !batchId.trim()}
                className="rounded bg-gray-700 px-5 py-3 text-white disabled:opacity-50"
              >
                View Certificates
              </button>
            </div>
          </div>
        )}

        {/* CERTIFICATE VERIFICATION */}
        <div
          id="verification-section"
          className={cardClass}
        >
          <h3 className="mb-4 text-xl font-bold">
            Certificate Verification
          </h3>

          <p className="mb-3 text-sm text-gray-500">
            Enter a verification token or select a
            certificate below.
          </p>

          <input
            type="text"
            placeholder="Enter verification token"
            value={verificationToken}
            onChange={(e) =>
              setVerificationToken(e.target.value)
            }
            className={`mb-4 ${inputClass}`}
          />

          <button
            onClick={() =>
              void verifyCertificate()
            }
            disabled={busy}
            className={blueButton}
          >
            {busy
              ? "Processing..."
              : "Verify Certificate"}
          </button>

          {verificationResult && (
            <VerificationDetails
              result={verificationResult}
            />
          )}

          {message && (
            <p className="mt-4 rounded bg-gray-100 p-3 text-sm">
              {message}
            </p>
          )}
        </div>

        {/* GENERATED CERTIFICATES */}
        {certificates.length > 0 && (
          <div className={cardClass}>
            <h3 className="mb-4 text-xl font-bold">
              Generated Certificates
            </h3>

            <div className="space-y-4">
              {certificates.map((certificate) => (
                <div
                  key={certificate.id}
                  className="rounded border p-4"
                >
                  <p className="font-semibold">
                    {certificate.candidate.fullName}
                  </p>

                  <p className="mt-1 text-sm text-gray-600">
                    Enrollment:{" "}
                    {certificate.candidate.enrollmentNo}
                  </p>

                  <p className="mt-1 break-all text-sm text-gray-600">
                    {certificate.certificateNumber}
                  </p>

                  <p
                    className={`mt-2 font-semibold ${
                      certificate.revokedAt
                        ? "text-red-600"
                        : "text-green-700"
                    }`}
                  >
                    {certificate.revokedAt
                      ? "REVOKED"
                      : "VALID"}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-3">
                    {/* DOWNLOAD PDF */}
                    <button
                      onClick={() =>
                        downloadCertificate(certificate)
                      }
                      disabled={
                        busy ||
                        Boolean(certificate.revokedAt)
                      }
                      className={blueButton}
                    >
                      Download PDF
                    </button>

                    {/* SHARE ON WHATSAPP */}
                    <button
                      onClick={() =>
                        shareOnWhatsApp(certificate)
                      }
                      disabled={
                        busy ||
                        Boolean(certificate.revokedAt)
                      }
                      className="rounded bg-green-600 px-4 py-2 text-white disabled:opacity-50"
                    >
                      Share on WhatsApp
                    </button>

                    {/* SELECT FOR VERIFICATION */}
                    <button
                      onClick={() =>
                        selectCertificateForVerification(
                          certificate
                        )
                      }
                      disabled={busy}
                      className="rounded border border-blue-700 px-4 py-2 text-blue-700 disabled:opacity-50"
                    >
                      Select for Verification
                    </button>
                  </div>

                  {/* STATE OFFICER REVOCATION */}
                  {user.role === "STATE" &&
                    !certificate.revokedAt && (
                      <div className="mt-4 rounded border border-red-200 bg-red-50 p-4">
                        <h4 className="mb-2 font-semibold text-red-700">
                          Revoke Certificate
                        </h4>

                        <input
                          type="text"
                          placeholder="Enter revocation reason"
                          value={
                            revokeReasons[
                              certificate.id
                            ] || ""
                          }
                          onChange={(e) =>
                            setRevokeReasons(
                              (previous) => ({
                                ...previous,
                                [certificate.id]:
                                  e.target.value,
                              })
                            )
                          }
                          className={`mb-3 ${inputClass}`}
                        />

                        <button
                          onClick={() =>
                            revokeCertificate(
                              certificate.id
                            )
                          }
                          disabled={
                            busy ||
                            !revokeReasons[
                              certificate.id
                            ]?.trim()
                          }
                          className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
                        >
                          Revoke Certificate
                        </button>
                      </div>
                    )}

                  {certificate.revokedAt && (
                    <p className="mt-3 text-sm text-red-600">
                      This certificate has been revoked
                      and is no longer valid.
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function App() {
  const pathname = window.location.pathname;

  if (pathname.startsWith("/verify/")) {
    const token = decodeURIComponent(
      pathname.slice("/verify/".length)
    );

    return (
      <PublicVerificationPage token={token} />
    );
  }

  return <Dashboard />;
}

export default App;
