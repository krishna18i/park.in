import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Banknote, Clock, CreditCard, MapPin, Navigation, ShieldCheck, Smartphone, TriangleAlert } from "lucide-react";
import { api } from "../lib/api";
import { directionsUrl } from "../lib/maps";
import { openRazorpay } from "../lib/razorpay";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { Button, Card, Spinner } from "../components/ui";
import { duration, money, timeLeft, when } from "../lib/format";

const METHODS = [
  { id: "upi", icon: Smartphone, label: "UPI", note: "GPay, PhonePe, Paytm" },
  { id: "card", icon: CreditCard, label: "Card", note: "Credit or debit" },
  { id: "cash", icon: Banknote, label: "Cash", note: "Pay at the gate" },
];

/** Counts down the hold window so the pressure to finish is visible. */
function HoldTimer({ until, onExpire }) {
  const [label, setLabel] = useState(() => timeLeft(until));

  useEffect(() => {
    if (!until) return;
    const tick = () => {
      const next = timeLeft(until);
      setLabel(next);
      if (!next) onExpire();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [until, onExpire]);

  if (!until || !label) return null;

  return (
    <div className="flex items-center justify-center gap-2 rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-800">
      <Clock className="h-4 w-4" />
      Bay held for {label}
    </div>
  );
}

export default function Checkout() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();

  const { user } = useAuth();
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [method, setMethod] = useState("upi");
  const [paying, setPaying] = useState(false);
  const [expired, setExpired] = useState(false);
  const [gateway, setGateway] = useState("simulated");

  useEffect(() => {
    let cancelled = false;
    api
      .booking(bookingId)
      .then((data) => {
        if (cancelled) return;
        setBooking(data);
        if (data.status !== "pending") navigate(`/ticket/${data.id}`, { replace: true });
      })
      .catch((error) => !cancelled && toast.error(error.message))
      .finally(() => !cancelled && setLoading(false));
    api.paymentConfig().then((data) => {
      if (!cancelled) setGateway(data.provider);
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [bookingId, navigate, toast]);

  const pay = async () => {
    setPaying(true);
    try {
      const live = gateway === "razorpay" && method !== "cash";
      if (live) {
        const order = await api.paymentOrder({ booking_id: booking.id, method });
        const result = await openRazorpay({
          key: order.key_id,
          orderId: order.order_id,
          amount: booking.amount,
          name: user?.name,
          email: user?.email,
          description: `${booking.location_name} · bay ${booking.slot_code}`,
        });
        if (!result) return;
        await api.pay({
          booking_id: booking.id,
          method,
          razorpay_order_id: result.razorpay_order_id,
          razorpay_payment_id: result.razorpay_payment_id,
          razorpay_signature: result.razorpay_signature,
        });
      } else {
        await api.pay({ booking_id: booking.id, method });
      }
      toast.success("Payment received - your ticket is ready");
      navigate(`/ticket/${booking.id}`, { replace: true });
    } catch (error) {
      toast.error(error.message);
      if (error.status === 409) setExpired(true);
    } finally {
      setPaying(false);
    }
  };

  if (loading) return <Spinner label="Loading your booking" />;
  if (!booking) return null;

  if (expired) {
    return (
      <div className="mx-auto max-w-md px-6 py-20 text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-amber-50 text-amber-600">
          <TriangleAlert className="h-7 w-7" />
        </span>
        <h2 className="mt-4 font-display text-2xl font-bold text-ink-900">Your hold ran out</h2>
        <p className="mt-2 text-sm text-ink-700">
          Bay {booking.slot_code} went back into the pool because payment wasn't completed in
          time. Nothing was charged.
        </p>
        <Button className="mt-6" onClick={() => navigate(`/lot/${booking.location_id}`)}>
          Pick another bay
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-6 py-10">
      <div className="text-center">
        <h1 className="font-display text-3xl font-bold text-ink-900">Confirm and pay</h1>
        <p className="mt-1 text-sm text-ink-700">
          Your bay is reserved. Complete payment to get your gate ticket.
        </p>
      </div>

      <HoldTimer until={booking.reserved_until} onExpire={() => setExpired(true)} />

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-sand-200 bg-sand-50 px-5 py-4">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-ink-900">
              {booking.location_name}
            </h2>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-500">
              <MapPin className="h-3.5 w-3.5" />
              Bay {booking.slot_code}
            </p>
            <a
              href={directionsUrl({ address: `${booking.location_name}, Jaipur` })}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:text-teal-800"
            >
              <Navigation className="h-3 w-3" />
              Directions
            </a>
          </div>
          <span className="rounded-xl bg-brand-500 px-3.5 py-2 font-display text-lg font-bold text-white">
            {booking.slot_code}
          </span>
        </div>

        <dl className="divide-y divide-sand-200">
          {[
            ["Vehicle", <span className="font-mono tracking-wider">{booking.vehicle_number}</span>],
            ["From", when(booking.start_time)],
            ["Until", when(booking.end_time)],
            ["Duration", duration(booking.hours)],
            ["Rate", `${money(booking.rate_per_hour)} / hour`],
            ...(booking.valet
              ? [["Valet", money(booking.valet_fee)]]
              : []),
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between px-5 py-3 text-sm">
              <dt className="text-ink-500">{label}</dt>
              <dd className="font-semibold text-ink-900">{value}</dd>
            </div>
          ))}
          <div className="flex items-center justify-between bg-sand-50 px-5 py-4">
            <dt className="font-semibold text-ink-900">Total payable</dt>
            <dd className="font-display text-2xl font-bold text-brand-600">
              {money(booking.amount)}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-5">
        <h3 className="font-display text-lg font-bold text-ink-900">How would you like to pay?</h3>
        <div className="mt-3 grid gap-2.5 sm:grid-cols-3">
          {METHODS.map(({ id, icon: Icon, label, note }) => (
            <button
              key={id}
              type="button"
              onClick={() => setMethod(id)}
              aria-pressed={method === id}
              className={`flex flex-col items-center gap-1 rounded-xl border-2 px-3 py-4 transition ${
                method === id
                  ? "border-brand-500 bg-brand-50"
                  : "border-sand-200 hover:border-brand-200 hover:bg-sand-50"
              }`}
            >
              <Icon className={`h-5 w-5 ${method === id ? "text-brand-500" : "text-ink-500"}`} />
              <span className="text-sm font-semibold text-ink-900">{label}</span>
              <span className="text-[11px] text-ink-500">{note}</span>
            </button>
          ))}
        </div>

        <Button busy={paying} onClick={pay} size="lg" className="mt-5 w-full">
          <ShieldCheck className="h-5 w-5" />
          {paying ? "Processing" : `Pay ${money(booking.amount)}`}
        </Button>

        <p className="mt-3 text-center text-[11px] leading-snug text-ink-500">
          {gateway === "razorpay" && method !== "cash"
            ? "UPI and card go through Razorpay Checkout. Cash is collected at the gate."
            : "Local mode — checkout is simulated so you can demo without a merchant account. Add Razorpay keys to go live."}
        </p>
      </Card>
    </div>
  );
}
