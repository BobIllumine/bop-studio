import { useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

export interface SliderProps {
  label: string;
  /** Shown right of the label, e.g. `0.60 m`. */
  display?: ReactNode;
  /** One value, or two for a range; handles stay ordered. */
  values: number[];
  min: number;
  max: number;
  step: number;
  onChange: (values: number[]) => void;
}

/** Pointer-handle slider used for every numeric range in the studio. */
export function Slider({ label, display, values, ...rest }: SliderProps) {
  const fill =
    values.length > 1
      ? { left: pct(values[0]!, rest), width: pct(values[1]!, rest) - pct(values[0]!, rest) }
      : { left: 0, width: pct(values[0]!, rest) };
  return (
    <div className="field" style={{ gap: 4 }}>
      <div className="row">
        <span className="lbl">{label}</span>
        <span className="val">{display}</span>
      </div>
      <Track
        values={values}
        names={values.length > 1 ? [`${label} minimum`, `${label} maximum`] : [label]}
        segments={<div className="fill" style={{ left: `${fill.left}%`, width: `${fill.width}%` }} />}
        {...rest}
      />
    </div>
  );
}

export interface MixBarProps {
  /** Whole percentages per entry, summing to 100. */
  shares: number[];
  colors: string[];
  names: string[];
  onChange: (shares: number[]) => void;
}

/**
 * One bar split into one coloured segment per asset; the n-1 dividers trade
 * share between neighbours, so the total always stays 100 %.
 */
export function MixBar({ shares, colors, names, onChange }: MixBarProps) {
  const edges: number[] = [];
  shares.slice(0, -1).reduce((sum, share) => {
    edges.push(sum + share);
    return sum + share;
  }, 0);
  const bounds = [0, ...edges, 100];
  return (
    <Track
      className="mix"
      values={edges}
      min={0}
      max={100}
      step={1}
      names={edges.map((_, i) => `Divider between ${names[i]} and ${names[i + 1]}`)}
      valueText={(i) => `${names[i]} ${shares[i]}%, ${names[i + 1]} ${shares[i + 1]}%`}
      onChange={(next) => {
        const b = [0, ...next, 100];
        onChange(shares.map((_, i) => b[i + 1]! - b[i]!));
      }}
      segments={shares.map((share, i) => {
        const radius = `${i === 0 ? "6px" : "0"} ${i === shares.length - 1 ? "6px 6px" : "0 0"} ${i === 0 ? "6px" : "0"}`;
        return (
          <div
            key={names[i]}
            className="fill"
            style={{ left: `${bounds[i]}%`, width: `${share}%`, background: colors[i], borderRadius: radius }}
          >
            {share >= 9 ? `${share}%` : ""}
          </div>
        );
      })}
    />
  );
}

interface TrackProps {
  values: number[];
  min: number;
  max: number;
  step: number;
  names: string[];
  segments: ReactNode;
  className?: string;
  valueText?: (index: number) => string;
  onChange: (values: number[]) => void;
}

function Track({ values, min, max, step, names, segments, className, valueText, onChange }: TrackProps) {
  const drag = useRef<{ index: number; rect: DOMRect } | null>(null);
  const apply = (index: number, raw: number) => {
    const snapped = Math.round(raw / step) * step;
    const low = index > 0 ? values[index - 1]! : min;
    const high = index < values.length - 1 ? values[index + 1]! : max;
    const value = Number(Math.min(high, Math.max(low, snapped)).toFixed(6));
    if (value !== values[index]) onChange(values.map((v, i) => (i === index ? value : v)));
  };
  const at = (clientX: number, rect: DOMRect) => min + Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * (max - min);

  const down = (event: PointerEvent<HTMLDivElement>) => {
    if (!values.length) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = at(event.clientX, rect);
    // Nearest handle; among stacked handles, the one on the side being dragged towards.
    let best = Infinity;
    let picks: number[] = [];
    values.forEach((v, i) => {
      const d = Math.abs(v - x);
      if (d < best - 1e-9) {
        best = d;
        picks = [i];
      } else if (Math.abs(d - best) < 1e-9) picks.push(i);
    });
    const index = x >= values[picks[0]!]! ? picks[picks.length - 1]! : picks[0]!;
    drag.current = { index, rect };
    event.currentTarget.setPointerCapture(event.pointerId);
    apply(index, x);
  };
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current) apply(drag.current.index, at(event.clientX, drag.current.rect));
  };
  const up = () => {
    drag.current = null;
  };
  const key = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    const delta = step * (event.shiftKey ? 10 : 1);
    if (event.key === "ArrowLeft" || event.key === "ArrowDown") apply(index, values[index]! - delta);
    else if (event.key === "ArrowRight" || event.key === "ArrowUp") apply(index, values[index]! + delta);
    else if (event.key === "Home") apply(index, min);
    else if (event.key === "End") apply(index, max);
    else return;
    event.preventDefault();
  };

  return (
    <div
      className={className ? `track ${className}` : "track"}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <div className="rail" />
      {segments}
      {values.map((value, i) => (
        <button
          key={i}
          type="button"
          role="slider"
          className="knob"
          aria-label={names[i]}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          aria-valuetext={valueText?.(i)}
          onKeyDown={key(i)}
          style={{ left: `${pct(value, { min, max })}%` }}
        />
      ))}
    </div>
  );
}

function pct(value: number, { min, max }: { min: number; max: number }) {
  return ((value - min) / (max - min)) * 100;
}
