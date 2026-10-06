"use client";

import { useMemo, useState, type KeyboardEvent } from "react";
import { buildRequestHistogram } from "./request-histogram";
import "./styles/RequestHistogram.css";

function dateTime(timestamp: number) {
  return new Date(timestamp).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

export default function RequestHistogram({
  requests,
  loading,
  error,
}: {
  requests: readonly { timestamp: string }[];
  loading: boolean;
  error: string;
}) {
  const histogram = useMemo(() => buildRequestHistogram(requests), [requests]);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const activeIndex = histogram
    ? Math.min(selectedIndex ?? 0, histogram.buckets.length - 1)
    : 0;
  const selected =
    selectedIndex === null ? null : histogram?.buckets[activeIndex];

  function moveBucket(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!histogram) return;
    let next: number;
    switch (event.key) {
      case "ArrowLeft":
        next = Math.max(0, index - 1);
        break;
      case "ArrowRight":
        next = Math.min(histogram.buckets.length - 1, index + 1);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = histogram.buckets.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    event.currentTarget.parentElement
      ?.querySelectorAll<HTMLButtonElement>("button")
      [next]?.focus();
  }

  if (loading) return <p className="empty">{"Loading request histogram…"}</p>;
  if (error) return <p className="empty error">{error}</p>;
  if (!histogram)
    return (
      <section className="request-histogram histogram-empty">
        <p>
          {
            "No captured requests yet. The histogram will appear when requests arrive."
          }
        </p>
      </section>
    );

  const peak = Math.max(...histogram.buckets.map((bucket) => bucket.count));
  const middle = Math.floor(peak / 2);
  const minutes = histogram.bucketMs / 60_000;
  const first = histogram.buckets[0].start;
  const last = histogram.buckets[histogram.buckets.length - 1].end;

  return (
    <section className="request-histogram" aria-label="Request histogram">
      <div className="histogram-summary">
        <strong>{`${histogram.total.toLocaleString()} request${histogram.total === 1 ? "" : "s"}`}</strong>
        <span>{`${histogram.buckets.length} bucket${histogram.buckets.length === 1 ? "" : "s"} · ${minutes.toLocaleString()} minute${minutes === 1 ? "" : "s"} per bucket`}</span>
      </div>
      <p className="histogram-range">{`${dateTime(histogram.earliest)} – ${dateTime(histogram.latest)}`}</p>
      <p className="histogram-help">
        {
          "All retained requests, grouped by capture time. Hover or select a bucket for details; use the arrow keys to move between buckets."
        }
      </p>
      <div className="histogram-axis-title">{"Requests"}</div>
      <div className="histogram-chart">
        <div className="histogram-y-axis" aria-hidden="true">
          <span className="histogram-y-max">{peak}</span>
          {middle > 0 ? (
            <span style={{ bottom: `${(middle / peak) * 100}%` }}>
              {middle}
            </span>
          ) : null}
          <span className="histogram-y-zero">{"0"}</span>
        </div>
        <div className="histogram-plot">
          <div className="histogram-grid-line histogram-grid-top" />
          {middle > 0 ? (
            <div
              className="histogram-grid-line"
              style={{ bottom: `${(middle / peak) * 100}%` }}
            />
          ) : null}
          <div
            className="histogram-bars"
            role="group"
            aria-label="Request counts by time bucket"
            style={{
              gridTemplateColumns: `repeat(${histogram.buckets.length}, minmax(0, 1fr))`,
            }}
          >
            {histogram.buckets.map((bucket, index) => {
              const label = `${dateTime(bucket.start)} to ${dateTime(bucket.end)} (end exclusive): ${bucket.count} request${bucket.count === 1 ? "" : "s"}`;
              return (
                <button
                  key={bucket.start}
                  type="button"
                  className={
                    selected && index === activeIndex
                      ? "histogram-bucket selected"
                      : "histogram-bucket"
                  }
                  aria-label={label}
                  title={label}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onFocus={() => setSelectedIndex(index)}
                  onClick={() => setSelectedIndex(index)}
                  onKeyDown={(event) => moveBucket(event, index)}
                >
                  <span style={{ height: `${(bucket.count / peak) * 100}%` }} />
                </button>
              );
            })}
          </div>
        </div>
        <div className="histogram-x-axis" aria-hidden="true">
          <span>{dateTime(first)}</span>
          <span>{dateTime(last)}</span>
        </div>
      </div>
      <div className="histogram-detail">
        {selected ? (
          <>
            <strong>{`${selected.count.toLocaleString()} request${selected.count === 1 ? "" : "s"}`}</strong>
            <span>{`${dateTime(selected.start)} – ${dateTime(selected.end)} (end exclusive)`}</span>
          </>
        ) : (
          <span>
            {"Select a bucket to see its time range and request count."}
          </span>
        )}
      </div>
    </section>
  );
}
