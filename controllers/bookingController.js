import { inngest } from "../inngest/index.js";
import booking from "../models/booking.js";
import show from "../models/show.js";
import stripe from "stripe";

// Function to check availability of selected seats for a movie
export const checkSeatsAvailability = async (showId, selectedSeats) => {
  try {
    const showData = await show.findById(showId);
    if (!showData) {
      return false;
    }
    const occupiedSeats = showData.occupiedSeats;
    const isAnySeatTaken = selectedSeats.some((seat) => occupiedSeats[seat]);
    return !isAnySeatTaken;
  } catch (error) {
    console.log(error.message);
    return false;
  }
};

// Function to create a booking
export const createBooking = async (req, res) => {
  try {
    const { userId } = req.auth();
    const { showId, selectedSeats } = req.body;
    const { origin } = req.headers;
    // check if the seat is available for the selected show
    const isAvailable = await checkSeatsAvailability(showId, selectedSeats);
    if (!isAvailable) {
      return res.json({
        success: false,
        message: "Selected Seats Are Not Available",
      });
    }
    // get show details
    const showData = await show.findById(showId).populate("movie");
    // create a new booking
    const newBooking = await booking.create({
      user: userId,
      show: showId,
      amount: showData.showPrice * selectedSeats.length,
      bookedSeats: selectedSeats,
    });

    selectedSeats.forEach((seat) => {
      showData.occupiedSeats[seat] = userId;
    });
    showData.markModified("occupiedSeats");
    await showData.save();
    // stripe gateway payment
    const stripeInstance = new stripe(process.env.STRIPE_SECRET_KEY);
    // creating line items for stripe
    const lineItems = [
      {
        quantity: 1,
        price_data: {
          currency: "cad",
          product_data: {
            name: showData.movie.title,
          },
          unit_amount: Math.floor(newBooking.amount) * 100,
        },
      },
    ];
    const session = await stripeInstance.checkout.sessions.create({
      success_url: `${origin}/loading/my-bookings`,
      cancel_url: `${origin}/my-bookings`,
      line_items: lineItems,
      mode: "payment",
      metadata: {
        bookingId: newBooking._id.toString(),
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    });

    newBooking.paymentLink = session.url;
    await newBooking.save();

    // Run inngest scheduler function to check payment status after 10 minutes
    await inngest.send({
      name: "app/checkPayment",
      data: {
        bookingId: newBooking._id.toString(),
      },
    });

    res.json({ success: true, url: session.url });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// get occupied seat list
export const fetchOccupiedSeats = async (req, res) => {
  try {
    const { showId } = req.params;
    const showData = await show.findById(showId);
    const occupiedSeats = Object.keys(showData.occupiedSeats);
    res.json({ success: true, occupiedSeats });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
