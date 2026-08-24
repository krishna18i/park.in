import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Car,
  CheckCircle2,
  LayoutDashboard,
  LogOut,
  MapPin,
  MessageSquareHeart,
  Navigation,
  PencilLine,
} from "lucide-react";
import { api } from "../lib/api";
import { directionsUrl } from "../lib/maps";
import { useI18n } from "../context/I18nContext";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import FeedbackPrompt, { wasPromptDismissed } from "../components/FeedbackPrompt";
import StarRating from "../components/StarRating";
import { Badge, Button, Card, Spinner } from "../components/ui";
import { STATUS_STYLES, duration, money, when } from "../lib/format";

export default function Ticket() {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { t } = useI18n();

  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [prompting, setPrompting] = useState(false);
  const previousStatus = useRef(null);

  const load = useCallback(async () => {
    try {
      setTicket(await api.ticket(bookingId));
    } catch (error) {
      toast.error(error.message);
      navigate("/dashboard", { replace: true });
    } finally {
      setLoading(false);
    }
  }, [bookingId, navigate, toast]);

  useEffect(() => {
    load();
  }, [load]);

  /**
   * Ask for feedback the moment the visit ends -- whether the driver tapped
   * "check out" here or the operator scanned them out at the gate (which
   * arrives over the live feed). Watching the transition rather than the
   * button covers both, and only fires once per visit.
   */
  useEffect(() => {
    const status = ticket?.booking?.status;
    if (!status) return;
    const previous = previousStatus.current;
    previousStatus.current = status;
    if (previous === "active" && status === "completed" && !ticket.booking.rating) {
      setPrompting(true);
    }
  }, [ticket]);

  // The operator can scan this same ticket at the gate. When that frees the
  // bay, refresh so the pass stops offering a check-out that already happened.
  const slotId = ticket?.booking?.slot_id;
  useLiveEvent("slot.updated", (slot) => {
    if (slot.id === slotId) load();
  });

  const act = async (action, successMessage) => {
    setWorking(true);
    try {
      await action(bookingId);
      toast.success(successMessage);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorking(false);
    }
  };

  /**
   * Checking out ends the visit, so this is the one moment the driver still
   * has the whole thing fresh in mind -- ask for the rating right here rather
   * than hoping they come back for it.
   */
  const checkOut = async () => {
    setWorking(true);
    try {
      await api.checkOut(bookingId);
      toast.success(`Checked out - bay ${ticket.booking.slot_code} released`);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setWorking(false);
    }
  };

  if (loading) return <Spinner label="Fetching your ticket" />;
  if (!ticket) return null;

  const { booking, qr_data_uri: qr, holder_name: holder } = ticket;
  const style = STATUS_STYLES[booking.status] ?? STATUS_STYLES.completed;

  return (
    <div className="mx-auto max-w-lg space-y-4 px-6 py-10">
      <div className="text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-teal-50 text-teal-600">
          <CheckCircle2 className="h-6 w-6" />
        </span>
        <h1 className="mt-3 font-display text-3xl font-bold text-ink-900">{t("ticket.title")}</h1>
        <p className="mt-1 text-sm text-ink-700">{t("ticket.lead")}</p>
      </div>

      {/* Perforated stub styling: a solid head, a notched tear line, then the
          QR. Reads as a physical parking ticket. */}
      <Card className="overflow-hidden">
        <div className="bg-brand-500 px-6 py-5 text-white">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest opacity-80">
                Parking pass
              </p>
              <h2 className="mt-0.5 truncate font-display text-2xl font-bold">
                {booking.location_name}
              </h2>
              <p className="mt-1 flex items-center gap-1.5 text-xs opacity-90">
                <MapPin className="h-3.5 w-3.5" />
                Bay {booking.slot_code}
              </p>
            </div>
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-white/20 font-display text-xl font-extrabold backdrop-blur-sm">
              {booking.slot_code}
            </span>
          </div>
        </div>

        <div className="relative h-5 bg-brand-500">
          <div className="absolute inset-x-0 bottom-0 h-5 rounded-t-2xl bg-white" />
          <div className="absolute -left-2.5 bottom-2.5 h-5 w-5 rounded-full bg-sand-50" />
          <div className="absolute -right-2.5 bottom-2.5 h-5 w-5 rounded-full bg-sand-50" />
        </div>

        <div className="space-y-4 px-6 pb-6">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-2xl border-2 border-sand-200 bg-white p-3">
              <img src={qr} alt={`QR code for ticket ${booking.ticket_code}`} className="h-44 w-44" />
            </div>
            <p className="font-mono text-lg font-bold tracking-[0.2em] text-ink-900">
              {booking.ticket_code}
            </p>
            <Badge className={style.className}>{style.label}</Badge>
          </div>

          <dl className="divide-y divide-sand-200 rounded-xl border border-sand-200">
            {[
              ["Holder", holder],
              ["Vehicle", booking.vehicle_number],
              ["From", when(booking.start_time)],
              ["Until", when(booking.end_time)],
              ["Duration", duration(booking.hours)],
              ["Paid", money(booking.amount)],
              ...(booking.valet ? [["Valet", money(booking.valet_fee)]] : []),
            ].map(([label, value]) => (
              <div key={label} className="flex items-center justify-between px-4 py-2.5 text-sm">
                <dt className="text-ink-500">{label}</dt>
                <dd className="font-semibold text-ink-900">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </Card>

      {/* Self-service gate actions. In the real product the operator scans the
          QR; these buttons make the same transitions demoable on one laptop. */}
      {booking.status === "confirmed" && (
        <Button
          busy={working}
          size="lg"
          className="w-full"
          onClick={() => act(api.checkIn, `Checked in - bay ${booking.slot_code} is yours`)}
        >
          <Car className="h-5 w-5" />
          Arrive and check in
        </Button>
      )}

      {booking.status === "active" && (
        <Button
          busy={working}
          size="lg"
          variant="secondary"
          className="w-full"
          onClick={() => checkOut()}
        >
          <LogOut className="h-5 w-5" />
          {t("ticket.leave")}
        </Button>
      )}

      {/* The visit is over: either invite the rating or show the one already
          given, with a way back into the full feedback screen. */}
      {booking.status === "completed" && !booking.rating && (
        <Card className="p-5">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600">
              <MessageSquareHeart className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-lg font-bold text-ink-900">{t("ticket.rate")}</h3>
              <p className="mt-0.5 text-xs text-ink-500">{t("fb.prompt.why")}</p>
            </div>
          </div>
          <Button className="mt-4 w-full" onClick={() => navigate(`/feedback/${booking.id}`)}>
            {t("fb.prompt.cta")}
          </Button>
        </Card>
      )}

      {booking.status === "completed" && booking.rating > 0 && (
        <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
              {t("fb.yourReport")}
            </p>
            <div className="mt-1.5">
              <StarRating value={booking.rating} size="sm" label={t("fb.overall")} />
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => navigate(`/feedback/${booking.id}`)}>
            <PencilLine className="h-3.5 w-3.5" />
            {t("fb.sent.edit")}
          </Button>
        </Card>
      )}

      <Button variant="ghost" className="w-full" onClick={() => navigate("/dashboard")}>
        <LayoutDashboard className="h-4 w-4" />
        All my bookings
      </Button>

      <a
        href={directionsUrl({ address: `${booking.location_name}, Jaipur` })}
        target="_blank"
        rel="noreferrer"
        className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-teal-700 hover:bg-teal-50"
      >
        <Navigation className="h-4 w-4" />
        Navigate to {booking.location_name}
      </a>

      <FeedbackPrompt
        open={prompting && !booking.rating && !wasPromptDismissed(booking.id)}
        booking={booking}
        onClose={() => setPrompting(false)}
      />
    </div>
  );
}
