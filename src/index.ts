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
  });

  // Get All Job Post
  app.get("/jobs", (req, res) => {
    const { category, employmentType, status } = req.query;
    let jobs = jobsStorage.values();

    if (category) {
      jobs = jobs.filter((job) => job.category === category);
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
      res.status(404).send(`Job with id=${jobId} not found`);
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
      res.status(404).send(`Job with id=${jobId} not found`);
      return;
    }

    const job = jobOpt.Some;
    if (job.status !== "ACTIVE") {
      res
        .status(400)
        .send("This job posting is no longer accepting applications");
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
