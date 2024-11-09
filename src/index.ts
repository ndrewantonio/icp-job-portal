import { v4 as uuidv4 } from "uuid";
import { Server, StableBTreeMap, ic } from "azle";
import express from "express";
import rateLimit from "express-rate-limit";
import { body, query, validationResult } from "express-validator";

interface JobPost {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  requirements: string[];
  salary: {
    min: number;
    max: number;
    currency: string;
  };
  employmentType: "FULL_TIME" | "PART_TIME" | "CONTRACT" | "INTERNSHIP";
  category: string;
  contactEmail: string;
  createdAt: Date;
  updatedAt: Date | null;
  status: "ACTIVE" | "CLOSED" | "DRAFT";
  applicants: string[];
}

interface JobApplication {
  id: string;
  jobId: string;
  applicantName: string;
  email: string;
  phone: string;
  resumeUrl: string;
  coverLetter: string;
  status: "PENDING" | "REVIEWED" | "SHORTLISTED" | "REJECTED";
  createdAt: Date;
  updatedAt: Date | null;
}

const jobsStorage = StableBTreeMap<string, JobPost>(0);
const applicationsStorage = StableBTreeMap<string, JobApplication>(1);

export default Server(() => {
  const app = express();
  app.use(express.json());

  // Rate limiting middleware
  const applyRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
  });

  app.use(applyRateLimiter);

  // Post new Job Post with input validation
  app.post(
    "/jobs",
    [
      body("title").isString().trim().notEmpty(),
      body("company").isString().trim().notEmpty(),
      body("location").isString().trim().notEmpty(),
      body("contactEmail").isEmail(),
    ],
    (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const jobPost: JobPost = {
        id: uuidv4(),
        createdAt: getCurrentDate(),
        updatedAt: null,
        applicants: [],
        status: "ACTIVE",
        ...req.body,
      };
      jobsStorage.insert(jobPost.id, jobPost);
      res.json(jobPost);
    }
  );

  // Get All Job Posts with dynamic filtering
  app.get(
    "/jobs",
    [
      query("category").optional().isString(),
      query("employmentType").optional().isString(),
      query("status").optional().isString(),
    ],
    (req, res) => {
      const { category, employmentType, status } = req.query;
      let jobs = jobsStorage.values();

      jobs = jobs.filter((job) => {
        return (
          (!category || job.category === category) &&
          (!employmentType || job.employmentType === employmentType) &&
          (!status || job.status === status)
        );
      });

      res.json(jobs);
    }
  );

  // Get Job Post by Id with improved error response
  app.get("/jobs/:id", (req, res) => {
    const jobId = req.params.id;
    const jobOpt = jobsStorage.get(jobId);
    if ("None" in jobOpt) {
      res.status(404).json({ error: `Job with id=${jobId} not found` });
    } else {
      res.json(jobOpt.Some);
    }
  });

  // Update Job Post by Id
  app.put("/jobs/:id", (req, res) => {
    const jobId = req.params.id;
    const jobOpt = jobsStorage.get(jobId);
    if ("None" in jobOpt) {
      res.status(404).json({ error: `Job with id=${jobId} not found` });
    } else {
      const job = jobOpt.Some;
      const updatedJob = {
        ...job,
        ...req.body,
        updatedAt: getCurrentDate(),
      };
      jobsStorage.insert(job.id, updatedJob);
      res.json(updatedJob);
    }
  });

  // Delete Job Post by Id
  app.delete("/jobs/:id", (req, res) => {
    const jobId = req.params.id;
    const deletedJob = jobsStorage.remove(jobId);
    if ("None" in deletedJob) {
      res.status(404).json({ error: `Job with id=${jobId} not found` });
    } else {
      res.json(deletedJob.Some);
    }
  });

  // Apply to a Job Post with input validation
  app.post(
    "/jobs/:jobId/apply",
    [
      body("applicantName").isString().trim().notEmpty(),
      body("email").isEmail(),
      body("phone").isString().trim().notEmpty(),
      body("resumeUrl").isURL(),
      body("coverLetter").isString().trim().notEmpty(),
    ],
    (req, res) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const jobId = req.params.jobId;
      const jobOpt = jobsStorage.get(jobId);

      if ("None" in jobOpt) {
        res.status(404).json({ error: `Job with id=${jobId} not found` });
        return;
      }

      const job = jobOpt.Some;
      if (job.status !== "ACTIVE") {
        res
          .status(400)
          .json({ error: "This job posting is no longer accepting applications" });
        return;
      }

      const application: JobApplication = {
        id: uuidv4(),
        jobId,
        status: "PENDING",
        createdAt: getCurrentDate(),
        updatedAt: null,
        ...req.body,
      };

      // Update job with new applicant
      const updatedJob = {
        ...job,
        applicants: [...job.applicants, application.id],
      };

      applicationsStorage.insert(application.id, application);
      jobsStorage.insert(jobId, updatedJob);

      res.json(application);
    }
  );

  // Get Application by Id with improved error response
  app.get("/applications/:id", (req, res) => {
    const applicationId = req.params.id;
    const applicationOpt = applicationsStorage.get(applicationId);
    if ("None" in applicationOpt) {
      res.status(404).json({ error: `Application with id=${applicationId} not found` });
    } else {
      res.json(applicationOpt.Some);
    }
  });

  // Get Applications by Job Id
  app.get("/jobs/:jobId/applications", (req, res) => {
    const jobId = req.params.jobId;
    const jobOpt = jobsStorage.get(jobId);

    if ("None" in jobOpt) {
      res.status(404).json({ error: `Job with id=${jobId} not found` });
      return;
    }

    const applications = applicationsStorage
      .values()
      .filter((app) => app.jobId === jobId);
    res.json(applications);
  });

  // Update Application Status by Id
  app.put("/applications/:id/status", (req, res) => {
    const applicationId = req.params.id;
    const { status } = req.body;
    const applicationOpt = applicationsStorage.get(applicationId);

    if ("None" in applicationOpt) {
      res.status(404).json({ error: `Application with id=${applicationId} not found` });
      return;
    }

    const application = applicationOpt.Some;
    const updatedApplication = {
      ...application,
      status,
      updatedAt: getCurrentDate(),
    };

    applicationsStorage.insert(applicationId, updatedApplication);
    res.json(updatedApplication);
  });

  return app.listen(process.env.PORT || 3000);
});

// Improved getCurrentDate function using BigInt for precision
function getCurrentDate() {
  const timestamp = BigInt(ic.time());
  return new Date(Number(timestamp / 1_000_000n));
}
