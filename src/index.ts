import { v4 as uuidv4 } from "uuid";
import { Server, StableBTreeMap, ic } from "azle";
import express from "express";

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

  // Post new Job Post
  app.post("/jobs", (req, res) => {
  const { title, company, location, description, requirements, salary, employmentType, category, contactEmail } = req.body;

  // Input validation
  if (!title || !company || !location || !description || !Array.isArray(requirements) || !contactEmail) {
    return res.status(400).send("All required fields must be provided.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return res.status(400).send("Invalid email format.");
  }

  if (salary.min < 0 || salary.max < salary.min || !["USD", "EUR"].includes(salary.currency)) {
    return res.status(400).send("Invalid salary information.");
  }

  const jobPost: JobPost = {
    id: uuidv4(),
    title,
    company,
    location,
    description,
    requirements,
    salary,
    employmentType,
    category,
    contactEmail,
    createdAt: getCurrentDate(),
    updatedAt: null,
    status: "ACTIVE",
    applicants: [],
  };

  jobsStorage.insert(jobPost.id, jobPost);
  res.json(jobPost);
});
  // Get All Job Post
  app.get("/jobs", (req, res) => {
  const category = req.query.category?.toString().trim().toLowerCase();
  const employmentType = req.query.employmentType?.toString().trim().toUpperCase();
  const status = req.query.status?.toString().trim().toUpperCase();

  let jobs = jobsStorage.values();

  if (category) {
    jobs = jobs.filter((job) => job.category.toLowerCase() === category);
  }
  if (employmentType) {
    jobs = jobs.filter((job) => job.employmentType === employmentType);
  }
  if (status) {
    jobs = jobs.filter((job) => job.status === status);
  }

  res.json(jobs);
});

  // Get Job Post by Id
  app.get("/jobs/:id", (req, res) => {
    const jobId = req.params.id;
    const jobOpt = jobsStorage.get(jobId);
    if ("None" in jobOpt) {
      res.status(404).send(`Job with id=${jobId} not found`);
    } else {
      res.json(jobOpt.Some);
    }
  });

  // Update Job Post by Id
  app.put("/jobs/:id", (req, res) => {
  const jobId = req.params.id;
  const jobOpt = jobsStorage.get(jobId);

  if ("None" in jobOpt) {
    return res.status(404).send(`Job with id=${jobId} not found`);
  }

  const job = jobOpt.Some;

  // Only allowed fields to be updated
  const { title, description, requirements, salary, status } = req.body;

  // Validate allowed fields
  if (title && typeof title !== 'string') return res.status(400).send("Invalid title format.");
  if (description && typeof description !== 'string') return res.status(400).send("Invalid description format.");
  if (status && !["ACTIVE", "CLOSED", "DRAFT"].includes(status)) return res.status(400).send("Invalid status value.");

  const updatedJob = {
    ...job,
    title: title || job.title,
    description: description || job.description,
    requirements: requirements || job.requirements,
    salary: salary || job.salary,
    status: status || job.status,
    updatedAt: getCurrentDate(),
  };

  jobsStorage.insert(job.id, updatedJob);
  res.json(updatedJob);
});

  // Delete Job Post by Id
  app.delete("/jobs/:id", (req, res) => {
    const jobId = req.params.id;
    const deletedJob = jobsStorage.remove(jobId);
    if ("None" in deletedJob) {
      res.status(404).send(`Job with id=${jobId} not found`);
    } else {
      res.json(deletedJob.Some);
    }
  });

  // Apply Job
  app.post("/jobs/:jobId/apply", (req, res) => {
  const jobId = req.params.jobId;
  const jobOpt = jobsStorage.get(jobId);

  if ("None" in jobOpt) {
    return res.status(404).send(`Job with id=${jobId} not found`);
  }

  const job = jobOpt.Some;

  if (job.status !== "ACTIVE") {
    return res.status(400).send("This job posting is no longer accepting applications.");
  }

  const { applicantName, email, phone, resumeUrl, coverLetter } = req.body;

  // Input validation
  if (!applicantName || !email || !resumeUrl) {
    return res.status(400).send("Applicant name, email, and resume URL are required.");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).send("Invalid email format.");
  }

  // Prevent duplicate applications
  const existingApplications = applicationsStorage.values().filter(
    (app) => app.jobId === jobId && app.email === email
  );
  if (existingApplications.length > 0) {
    return res.status(400).send("You have already applied for this job.");
  }

  const application: JobApplication = {
    id: uuidv4(),
    jobId,
    applicantName,
    email,
    phone,
    resumeUrl,
    coverLetter,
    status: "PENDING",
    createdAt: getCurrentDate(),
    updatedAt: null,
  };

  applicationsStorage.insert(application.id, application);

  // Update job with new applicant
  job.applicants.push(application.id);
  jobsStorage.insert(jobId, job);

  res.json(application);
});

    // Update job with new applicant
    const updatedJob = {
      ...job,
      applicants: [...job.applicants, application.id],
    };

    applicationsStorage.insert(application.id, application);
    jobsStorage.insert(jobId, updatedJob);

    res.json(application);
  });

  // Get Application by Id
  app.get("/applications/:id", (req, res) => {
    const applicationId = req.params.id;
    const applicationOpt = applicationsStorage.get(applicationId);
    if ("None" in applicationOpt) {
      res.status(404).send(`Application with id=${applicationId} not found`);
    } else {
      res.json(applicationOpt.Some);
    }
  });

  // Get Application by Job
  app.get("/jobs/:jobId/applications", (req, res) => {
    const jobId = req.params.jobId;
    const jobOpt = jobsStorage.get(jobId);

    if ("None" in jobOpt) {
      res.status(404).send(`Job with id=${jobId} not found`);
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
      res.status(404).send(`Application with id=${applicationId} not found`);
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

  return app.listen();
});

function getCurrentDate() {
  const timestamp = new Number(ic.time());
  return new Date(timestamp.valueOf() / 1000_000);
}
