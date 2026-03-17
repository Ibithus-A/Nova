"use client";

export function HomeLogoLink() {
  return (
    <button
      aria-label="Nova home"
      className="inline-flex items-center"
      type="button"
      onClick={() => {
        window.location.assign("/");
      }}
    >
      <span className="text-lg font-semibold tracking-[-0.03em]">Nova</span>
    </button>
  );
}
