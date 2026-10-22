import type { Experience } from "@/features/catalog/types";
export function BookingPolicy({
  experience,
  date,
  time,
}: {
  experience: Experience;
  date?: string;
  time?: string;
}) {
  const deadline =
    date && time
      ? new Date(Date.parse(`${date}T${time}:00+05:30`) - 86400000)
      : undefined;
  return (
    <div className="flex flex-col gap-2 text-sm text-muted-foreground">
      <p>
        {experience.freeCancellation
          ? `Free cancellation until 24 hours before the experience${deadline ? `: ${deadline.toLocaleString("en-GB", { timeZone: "Asia/Colombo" })} (Sri Lanka time)` : ""}. After that, the booking is non-refundable.`
          : "This experience is non-refundable once paid or confirmed for payment on arrival."}
      </p>
      <p>
        {experience.payLater
          ? "Pay online with PayHere, or pay the full balance directly to your Buddy at the meeting/pickup point. No deposit is required for pay on arrival."
          : "Online payment is required through PayHere. Unpaid places are held for 15 minutes."}
      </p>
      <p>
        Eligible online cancellations are refunded to the original payment
        method. A refund remains pending until the gateway confirms it.
      </p>
    </div>
  );
}
