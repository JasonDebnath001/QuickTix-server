import e from "express";
import {
  addShow,
  getAllShows,
  getNowPlayingMovies,
  getShows,
} from "../controllers/showController.js";
import { protectAdmin } from "../middleware/auth.js";

const showRouter = e.Router();

showRouter.get("/now-playing", protectAdmin, getNowPlayingMovies);
showRouter.post("/add", protectAdmin, addShow);
showRouter.get("/all", getAllShows);
showRouter.get("/:movieId", getShows);

export default showRouter;
