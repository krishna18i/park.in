function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    document.body.appendChild(script);
  });
}

/** Open Razorpay Checkout and resolve with the payment payload, or null if dismissed. */
export async function openRazorpay({ key, orderId, amount, name, description, email }) {
  await loadScript("https://checkout.razorpay.com/v1/checkout.js");
  if (!window.Razorpay) throw new Error("Razorpay Checkout did not load");

  return new Promise((resolve, reject) => {
    const checkout = new window.Razorpay({
      key,
      amount: Math.round(amount * 100),
      currency: "INR",
      name: "Park.in",
      description,
      order_id: orderId,
      prefill: { email, name },
      theme: { color: "#c45c26" },
      handler: (response) => resolve(response),
      modal: { ondismiss: () => resolve(null) },
    });
    checkout.on("payment.failed", (response) => {
      reject(new Error(response?.error?.description || "Payment failed"));
    });
    checkout.open();
  });
}
