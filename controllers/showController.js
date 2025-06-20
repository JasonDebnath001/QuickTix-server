import axios from "axios";
import movie from "../models/movie.js";
import show from "../models/show.js";

// API to get now playing movies from TMDB API
export const getNowPlayingMovies = async (req, res) => {
  try {
    const response = await axios.get(
      "https://api.themoviedb.org/3/movie/now_playing",
      {
        headers: {
          Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
        },
      }
    );
    const movies = response.data.results;
    res.json({ success: true, movies });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to add a new show to the database
export const addShow = async (req, res) => {
  try {
    const { movieId, showsInput, showPrice } = req.body;
    let Movie = await movie.findById(movieId);
    if (!Movie) {
      // fetch movie details and credits from TMDB API
      const [movieDetailsResponse, movieCreditsResponse] = await Promise.all([
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}`, {
          headers: {
            Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
          },
        }),
        axios.get(`https://api.themoviedb.org/3/movie/${movieId}/credits`, {
          headers: {
            Authorization: `Bearer ${process.env.TMDB_API_KEY}`,
          },
        }),
      ]);
      const movieApiData = movieDetailsResponse.data;
      const movieCreditsData = movieCreditsResponse.data;

      const movieDetails = {
        _id: movieId,
        title: movieApiData.title,
        overview: movieApiData.overview,
        poster_path: movieApiData.poster_path,
        backdrop_path: movieApiData.backdrop_path,
        release_date: movieApiData.release_date,
        original_language: movieApiData.original_language,
        tagline: movieApiData.tagline || "",
        vote_average: movieApiData.vote_average,
        runtime: movieApiData.runtime,
        genres: movieApiData.genres,
        cast: movieCreditsData.cast.slice(0, 10).map((actor) => ({
          name: actor.name,
          character: actor.character,
          profile_path: actor.profile_path,
        })),
      };
      //   add movie to the database
      const movies = await movie.create(movieDetails);
    }
    const showsToCreate = [];
    showsInput.forEach((show) => {
      const showDate = show.date;
      show.time.forEach((time) => {
        const dateTimeString = `${showDate}T${time}`;
        showsToCreate.push({
          movie: movieId, // Changed from Movie to movie
          showDateTime: new Date(dateTimeString),
          showPrice,
          occupiedSeats: {},
        });
      });
    });
    if (showsToCreate.length > 0) {
      await show.insertMany(showsToCreate);
    }
    res.json({ success: true, message: "Show Added Successfully" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get all shows from the database
export const getAllShows = async (req, res) => {
  try {
    const shows = await show
      .find({ showDateTime: { $gte: new Date() } })
      .populate("movie")
      .sort({ showDateTime: 1 });
    // filter unique shows
    const uniqueShows = new Set(shows.map((show) => show.movie));
    res.json({ success: true, shows: Array.from(uniqueShows) });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get a single show from the database
export const getShows = async (req, res) => {
  try {
    const { movieId } = req.params;
    const shows = await show.find({
      movie: movieId,
      showDateTime: { $gte: new Date() },
    });
    const Movie = await movie.findById(movieId);
    const dateTime = {};
    shows.forEach((show) => {
      const data = show.showDateTime.toISOString().split("T")[0];
      if (!dateTime[data]) {
        dateTime[data] = [];
      }
      dateTime[data].push({ time: show.showDateTime, showId: show._id });
    });
    res.json({ success: true, Movie, dateTime });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
