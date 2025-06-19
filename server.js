import e from "express";
import cors from "cors";
import "dotenv/config";
import connectDb from "./config/db.js";
import { clerkMiddleware } from '@clerk/express'
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js"

const app = e();
const port = 3000;

await connectDb();

// middleware
app.use(e.json());
app.use(cors());
app.use(clerkMiddleware())

// api routes
app.get("/", (req, res) => {
  res.send("Server is live");
});
app.use("/api/inngest", serve({ client: inngest, functions }))

app.listen(port, () =>
  console.log(`Server is listening at http://localhost:${port}`)
);
