"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

export default function Reveal({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "section" | "li";
}) {
  const ref = useRef<HTMLElement>(null);
  const [jsReady, setJsReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setJsReady(true);
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const revealClass = jsReady
    ? `reveal ${visible ? "is-visible" : ""}`
    : "reveal is-visible";

  return (
    <Tag
      // @ts-expect-error — polymorphic ref across a small union of tags
      ref={ref}
      className={`${revealClass} ${className}`}
      style={jsReady && !visible ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
