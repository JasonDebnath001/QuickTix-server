import e from "express";
import cors from "cors";
import "dotenv/config";
import connectDb from "./config/db.js";
import { clerkMiddleware } from "@clerk/express";
import { serve } from "inngest/express";
import { inngest, functions } from "./inngest/index.js";
import showRouter from "./routes/showRoutes.js";
import bookingRouter from "./routes/bookingRoutes.js";
import adminRouter from "./routes/adminRoutes.js";
import userRouter from "./routes/userRoutes.js";
import { stripeWebhooks } from "./controllers/stripeWebhooks.js";

const app = e();
const port = 3000;

await connectDb();

// stripe webhooks route
app.use("/api/stripe", e.raw({ type: "application/json" }), stripeWebhooks);

// middleware
app.use(e.json());
app.use(cors());
app.use(clerkMiddleware());

// api routes
app.get("/", (req, res) => {
  res.send("Server is live");
});
app.use("/api/inngest", serve({ client: inngest, functions }));
app.use("/api/show", showRouter);
app.use("/api/booking", bookingRouter);
app.use("/api/admin", adminRouter);
app.use("/api/user", userRouter);

app.listen(port, () =>
  console.log(`Server is listening at http://localhost:${port}`)
);
