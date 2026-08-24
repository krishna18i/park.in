/** Star row used for the overall rating, the aspect scores and read-only recaps. */
import { useState } from "react";
import { Star } from "lucide-react";

const SIZES = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-9 w-9",
};

export default function StarRating({
  value = 0,
  onChange,
  size = "md",
  label,
  name,
  clearable = false,
}) {
  const [hovered, setHovered] = useState(0);
  const readOnly = typeof onChange !== "function";
  const shown = hovered || value;

  return (
    <div
      className="flex items-center gap-0.5"
      role={readOnly ? "img" : "radiogroup"}
      aria-label={label}
      onMouseLeave={() => setHovered(0)}
    >
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= shown;
        const starLabel = `${star} ${star === 1 ? "star" : "stars"}${label ? ` for ${label}` : ""}`;

        if (readOnly) {
          return (
            <Star
              key={star}
              aria-hidden="true"
              className={`${SIZES[size]} ${
                filled ? "fill-brand-500 text-brand-500" : "text-sand-300"
              }`}
            />
          );
        }

        return (
          <button
            key={star}
            type="button"
            role="radio"
            aria-checked={value === star}
            aria-label={starLabel}
            name={name}
            onMouseEnter={() => setHovered(star)}
            onFocus={() => setHovered(star)}
            onBlur={() => setHovered(0)}
            // Tapping the current star again clears it, so a mis-tap on an
            // optional score is recoverable.
            onClick={() => onChange(clearable && value === star ? 0 : star)}
            className="rounded-md p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          >
            <Star
              className={`${SIZES[size]} transition-colors ${
                filled ? "fill-brand-500 text-brand-500" : "text-sand-300"
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}
