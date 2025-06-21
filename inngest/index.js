import { Inngest } from "inngest";
import user from "../models/user.js";
import booking from "../models/booking.js";
import show from "../models/show.js";
import sendEmail from "../config/nodemailer.js";

export const inngest = new Inngest({ id: "quicktix" });

const syncUserCreation = inngest.createFunction(
  { id: "sync-user-from-clerk" },
  { event: "clerk/user.created" },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;
    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      name: first_name + " " + last_name,
      image: image_url,
    };
    await user.create(userData);
  }
);

const syncUserDeletion = inngest.createFunction(
  { id: "delete-user-with-clerk" },
  { event: "clerk/user.deleted" },
  async ({ event }) => {
    const { id } = event.data;
    await user.findByIdAndDelete(id);
  }
);

const syncUserUpdation = inngest.createFunction(
  { id: "update-user-from-clerk" },
  { event: "clerk/user.updated" },
  async ({ event }) => {
    const { id, first_name, last_name, email_addresses, image_url } =
      event.data;
    const userData = {
      _id: id,
      email: email_addresses[0].email_address,
      name: first_name + " " + last_name,
      image: image_url,
    };
    await user.findByIdAndUpdate(id, userData);
  }
);

// Inngest function to cancel booking and release seats of show after 10 minutes of booking created if payment is not made
const releaseSeatsAndDeleteBooking = inngest.createFunction(
  { id: "release-seats-delete-booking" },
  { event: "app/checkPayment" },
  async ({ event, step }) => {
    const tenMinutesLater = new Date(Date.now() + 10 * 60 * 1000);
    await step.sleepUntil("wait-for-10-minutes", tenMinutesLater);
    await step.run("check-payment-status", async () => {
      const bookingId = event.data.bookingId;
      const Booking = await booking.findById(bookingId);
      // If payment is not made, release seats and delete booking
      if (!Booking.isPaid) {
        const Show = await show.findById(Booking.show);
        Booking.bookedSeats.forEach((seat) => {
          delete Show.occupiedSeats[seat];
        });
        Show.markModified("occupiedSeats");
        await Show.save();
        await booking.findByIdAndDelete(Booking._id);
      }
    });
  }
);

// inngest function to send email when user booked a show
const sendBookingConfirmationEmail = inngest.createFunction(
  {id: "send=booking-confirmation-email"},
  {event: 'app/show.booked'},
  async ({event,step}) => {
    const {bookingId} = event.data
    const Booking = await booking.findById(bookingId).populate({path: 'show', populate: {path: 'movie', model: 'movie'}}).populate('user')
    const emailBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color: #333;">Booking Confirmation</h2>
      <p>Dear ${Booking.user.name},</p>
      <p>Thank you for booking your tickets with QuickTix!</p>
      <p>Here are your booking details:</p>
      <ul>
        <li><strong>Movie:</strong> ${Booking.show.movie.title}</li>
        <li><strong>Show Time:</strong> ${new Date(Booking.show.time).toLocaleString()}</li>
        <li><strong>Seats:</strong> ${Booking.bookedSeats.join(", ")}</li>
      </ul>
      <p>We hope you enjoy the show!</p>
      <p style="margin-top: 20px;">Best regards,<br>QuickTix Team</p>
      </div>
    `;

    await sendEmail({
      to: Booking.user.email,
      subject: `Payment Confirmation: "${Booking.show.movie.title}" Booked`,
      body: emailBody,
    });
  }
)

export const functions = [syncUserCreation, syncUserDeletion, syncUserUpdation, releaseSeatsAndDeleteBooking, sendBookingConfirmationEmail];
