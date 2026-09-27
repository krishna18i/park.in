import { useEffect, useRef, useState } from "react";

export default function AnimatedNumber({ value, prefix = "", suffix = "", duration = 1350, className = "" }) {
  const [display, setDisplay] = useState(0);
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node || !Number.isFinite(Number(value))) return undefined;
    let frame;
    let visible = false;
    const run = () => {
      cancelAnimationFrame(frame);
      setDisplay(0);
      const target = Number(value);
      const began = performance.now();
      const tick = (now) => {
        const progress = Math.min(1, (now - began) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        setDisplay(Math.round(target * eased));
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !visible) run();
      visible = entry.isIntersecting;
    }, { threshold: 0.45 });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [duration, value]);

  return <span ref={ref} className={className}>{prefix}{display.toLocaleString()}{suffix}</span>;
}
