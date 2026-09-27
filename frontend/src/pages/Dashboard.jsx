import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  Car,
  CreditCard,
  MessageSquareHeart,
  QrCode,
  Ticket as TicketIcon,
  Truck,
  X,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useI18n } from "../context/I18nContext";
import { useLiveEvent } from "../context/LiveContext";
import { useToast } from "../context/ToastContext";
import StarRating from "../components/StarRating";
import { Badge, Button, Card, EmptyState, Spinner } from "../components/ui";
import { STATUS_STYLES, duration, money, when } from "../lib/format";

const LIVE = new Set(["pending", "confirmed", "active"]);

function BookingRow({ booking, onCancel, busy }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const style = STATUS_STYLES[booking.status] ?? STATUS_STYLES.completed;
  const cancellable = booking.status === "pending" || booking.status === "confirmed";
  const finished = booking.status === "completed";

  return (
    <Card className="p-4 transition-shadow hover:shadow-md">
      <div className="flex flex-wrap items-start gap-4">
        <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sand-100 font-display text-sm font-extrabold text-ink-900">
          {booking.slot_code}
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-display text-lg font-bold text-ink-900">
              {booking.location_name}
            </h3>
            <Badge className={style.className}>{style.label}</Badge>
            {booking.booking_type === "logistics" && (
              <Badge className="bg-orange-100 text-orange-700"><Truck className="h-3 w-3" /> Logistics</Badge>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <Car className="h-3.5 w-3.5" />
              <span className="font-mono">{booking.vehicle_number}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" />
              {when(booking.start_time)} - {duration(booking.hours)}
            </span>
          </p>
          {booking.booking_type === "logistics" && (
            <p className="mt-1.5 text-xs font-medium text-orange-700">
              {booking.cargo_type}{booking.delivery_reference ? ` · ${booking.delivery_reference}` : ""}
            </p>
          )}
          {finished && booking.rating > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5">
              <StarRating value={booking.rating} size="sm" label={t("fb.overall")} />
              <button
                type="button"
                onClick={() => navigate(`/feedback/${booking.id}`)}
                className="text-[11px] font-semibold text-teal-700 hover:text-teal-800"
              >
                {t("fb.sent.edit")}
              </button>
            </div>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          <span className="font-display text-lg font-bold text-ink-900">
            {money(booking.amount)}
          </span>
          <div className="flex gap-2">
            {booking.status === "pending" ? (
              <Button size="sm" onClick={() => navigate(`/checkout/${booking.id}`)}>
                <CreditCard className="h-3.5 w-3.5" />
                Pay
              </Button>
            ) : (
              LIVE.has(booking.status) && (
                <Button size="sm" variant="outline" onClick={() => navigate(`/ticket/${booking.id}`)}>
                  <QrCode className="h-3.5 w-3.5" />
                  Ticket
                </Button>
              )
            )}
            {finished && !booking.rating && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/feedback/${booking.id}`)}
              >
                <MessageSquareHeart className="h-3.5 w-3.5" />
                {t("fb.rateVisit")}
              </Button>
            )}
            {cancellable && (
              <Button
                size="sm"
                variant="danger"
                busy={busy}
                onClick={() => onCancel(booking)}
                aria-label={`Cancel booking for bay ${booking.slot_code}`}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(null);
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const load = useCallback(async () => {
    try {
      setBookings(await api.myBookings());
    } catch (error) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // The sweeper can expire a pending booking while this page is open; refresh
  // so the row doesn't keep offering a Pay button for a dead hold.
  useLiveEvent("slot.updated", () => load());

  const cancel = async (booking) => {
    setCancelling(booking.id);
    try {
      await api.cancelBooking(booking.id);
      toast.success(`Cancelled - bay ${booking.slot_code} released`);
      await load();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setCancelling(null);
    }
  };

  if (loading) return <Spinner label="Loading your bookings" />;

  const live = bookings.filter((b) => LIVE.has(b.status));
  const past = bookings.filter((b) => !LIVE.has(b.status));

  return (
    <div className="mx-auto max-w-4xl space-y-8 px-6 py-10">
      <div>
        <h1 className="font-display text-3xl font-bold text-ink-900">
          Hello, {user?.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-sm text-ink-700">
          {live.length
            ? `${live.length} booking${live.length > 1 ? "s" : ""} in progress.`
            : "Nothing booked at the moment."}
        </p>
      </div>

      {bookings.length === 0 ? (
        <Card>
          <EmptyState
            icon={TicketIcon}
            title="No bookings yet"
            action={
              <Button className="mt-2" onClick={() => navigate("/")}>
                Find a bay
              </Button>
            }
          >
            Reserve a bay anywhere on the Park.in network and it will show up here.
          </EmptyState>
        </Card>
      ) : (
        <>
          {live.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-ink-900">In progress</h2>
              {live.map((booking) => (
                <BookingRow
                  key={booking.id}
                  booking={booking}
                  onCancel={cancel}
                  busy={cancelling === booking.id}
                />
              ))}
            </section>
          )}

          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-lg font-bold text-ink-900">History</h2>
              {past.map((booking) => (
                <BookingRow key={booking.id} booking={booking} onCancel={cancel} busy={false} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}
