import Stripe from "stripe";
import booking from "../models/booking.js";

export const stripeWebhooks = async (req, res) => {
  const stripeInstance = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers["stripe-signature"];
  let event;
  try {
    event = stripeInstance.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (error) {
    return res.status(400).send(`Webhooks error: ${error.message}`);
  }
  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const paymentIntent = event.data.object;
        const sessionList = await stripeInstance.checkout.sessions.list({
          payment_intent: paymentIntent.id,
        });
        const session = sessionList.data[0];
        const { bookingId } = session.metadata;

        await booking.findByIdAndUpdate(bookingId, {
          isPaid: true,
          paymentLink: "",
        });
        break;
      }

      default:
        console.log("unhandled event type", event.type);
    }
    res.json({ received: true });
  } catch (error) {
    console.log("Webhook processing error", error);
    res.status(500).send("Internal server error");
  }
};
