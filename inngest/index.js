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
  { id: "send-booking-confirmation-email" },
  { event: "app/show.booked" },
  async ({ event, step }) => {
    const { bookingId } = event.data;
    const Booking = await booking
      .findById(bookingId)
      .populate({ path: "show", populate: { path: "movie", model: "movie" } })
      .populate("user");
    const emailBody = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
      <h2 style="color: #333;">Booking Confirmation</h2>
      <p>Dear ${Booking.user.name},</p>
      <p>Thank you for booking your tickets with QuickTix!</p>
      <p>Here are your booking details:</p>
      <ul>
        <li><strong>Movie:</strong> ${Booking.show.movie.title}</li>
        <li><strong>Show Time:</strong> ${new Date(
          Booking.show.time
        ).toLocaleString()}</li>
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
);

// inngest function to send reminders
const sendShowReminders = inngest.createFunction(
  { id: "send-show-reminders" },
  { cron: "0 */8 * * *" }, //every 8 hours
  async ({ step }) => {
    const now = new Date();
    const in8Hours = new Date(now.getTime() + 8 * 60 * 60 * 1000);
    const windowStart = new Date(in8Hours.getTime() - 10 * 60 * 1000);
    // prepare reminder task
    const reminderTask = await step.run("prepare-reminder-task", async () => {
      const shows = await show
        .find({
          showTime: { $gte: windowStart, $lte: in8Hours },
        })
        .populate("movie");
      const task = [];
      for (const show of shows) {
        if (!show.movie || !show.occupiedSeats) continue;
        const userIds = [...new set(Object.values(show.occupiedSeats))];
        if (userIds.length === 0) continue;
        const users = await user
          .find({ _id: { $in: userIds } })
          .select("name email");
        for (const user of users) {
          task.push({
            userEmail: user.email,
            userName: user.name,
            movieTitle: show.movie.title,
            showTime: show.showTime,
          });
        }
      }
      return task;
    });
    if (reminderTask.length === 0) {
      return { sent: 0, message: "No reminders to send" };
    }
    // send reminder emails
    const result = await step.run("send-all-reminders", async () => {
      return await Promise.allSettled(
        reminderTask.map((task) =>
          sendEmail({
            to: task.userEmail,
            subject: `Reminder - Your Movie ${task.movieTitle} Starts Soon!`,
            body: `
          <div style="font-family: Arial, sans-serif; line-height: 1.6;">
            <h2 style="color: #333;">Movie Reminder</h2>
            <p>Dear ${task.userName},</p>
            <p>This is a friendly reminder that your movie <strong>${
              task.movieTitle
            }</strong> is starting soon!</p>
            <p>Here are the details:</p>
            <ul>
          <li><strong>Movie:</strong> ${task.movieTitle}</li>
          <li><strong>Show Time:</strong> ${new Date(
            task.showTime
          ).toLocaleString()}</li>
            </ul>
            <p>We hope you enjoy the show!</p>
            <p style="margin-top: 20px;">Best regards,<br>QuickTix Team</p>
          </div>
        `,
          })
        )
      );
    });
    const sent = result.filter((r) => r.status === "fulfilled").length;
    const failed = result.length - sent;
    return {
      sent,
      failed,
      message: `Sent ${sent} reminders, ${failed} failed`,
    };
  }
);

// send new show notification email
const sendNewShowNotification = inngest.createFunction(
  { id: "send-new-show-notification" },
  { event: "app/show.added" },
  async ({ event }) => {
    const { movieTitle, movieId } = event.data;
    const users = await user.find({});
    for (const user of users) {
      const userEmail = user.email;
      const userName = user.name;
      const subject = `🎥 New Movie Added: ${movieTitle}`;
      const body = `
        <div style="font-family: Arial, sans-serif; line-height: 1.6;">
          <h2 style="color: #333;">New Movie Released!</h2>
          <p>Dear ${userName},</p>
          <p>We're excited to announce that a new movie, <strong>${movieTitle}</strong>, has just been released and is now available for booking on QuickTix!</p>
          <p>Don't miss your chance to be among the first to watch it. Check out the showtimes and book your tickets now!</p>
          <a href="https://your-quicktix-site.com/movies/${movieId}" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: #fff; text-decoration: none; border-radius: 4px; margin-top: 10px;">View Showtimes & Book</a>
          <p style="margin-top: 20px;">See you at the movies!<br>QuickTix Team</p>
        </div>
      `;
      await sendEmail({
        to: userEmail,
        subject,
        body,
      });
    }
    return { message: "Notification sent" };
  }
);

export const functions = [
  syncUserCreation,
  syncUserDeletion,
  syncUserUpdation,
  releaseSeatsAndDeleteBooking,
  sendBookingConfirmationEmail,
  sendShowReminders,
  sendNewShowNotification,
];
