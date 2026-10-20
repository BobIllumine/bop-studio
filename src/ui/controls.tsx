import { useEffect, useState, type ReactNode } from "react";

import { ChevronDown, CloseIcon, PlusIcon } from "./icons";

export interface Option<T extends string> {
  value: T;
  label: ReactNode;
  disabled?: boolean;
  /** Tooltip, e.g. why the option is disabled. */
  title?: string;
}

/** Segmented toggle group. */
export function Seg<T extends string>({
  label,
  options,
  value,
  onChange,
  full,
  className,
}: {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  full?: boolean;
  className?: string;
}) {
  return (
    <div className={`ctl seg${full ? " full" : ""}${className ? ` ${className}` : ""}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Native select with the studio's chevron. */
export function Select<T extends string>({
  id,
  label,
  value,
  options,
  onChange,
  style,
}: {
  id?: string;
  label?: string;
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  style?: React.CSSProperties;
}) {
  return (
    <span className="selwrap" style={style}>
      <select
        id={id}
        aria-label={id ? undefined : label}
        className="ctl"
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled}>
            {option.label as string}
          </option>
        ))}
      </select>
      <ChevronDown size={10} style={{ color: "var(--subtle)" }} />
    </span>
  );
}

/**
 * Integer or decimal field that commits on blur or Enter, so typing a
 * half-finished number never writes an invalid value.
 */
export function NumberField({
  id,
  value,
  onCommit,
  min,
  max,
  step = 1,
  integer = true,
  style,
  label,
}: {
  id?: string;
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  style?: React.CSSProperties;
  label?: string;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const parsed = integer ? parseInt(text, 10) : parseFloat(text);
    if (Number.isNaN(parsed)) return setText(String(value));
    const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, parsed));
    setText(String(clamped));
    if (clamped !== value) onCommit(clamped);
  };
  return (
    <input
      id={id}
      aria-label={id ? undefined : label}
      className="ctl"
      type="number"
      inputMode={integer ? "numeric" : "decimal"}
      min={min}
      max={max}
      step={step}
      value={text}
      style={style}
      onChange={(event) => setText(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") commit();
      }}
    />
  );
}

/** Wrapping chips with an optional remove button on the selected one and an Add chip. */
export function ChipRow<T extends string | number>({
  label,
  items,
  selected,
  onSelect,
  onRemove,
  onAdd,
  addLabel = "Add",
}: {
  label: string;
  items: { key: T; label: ReactNode; color?: string }[];
  selected?: T;
  onSelect?: (key: T) => void;
  onRemove?: (key: T) => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  const removable = Boolean(onRemove) && items.length > 1;
  return (
    <div className="chips" role="group" aria-label={label}>
      {items.map((item) => {
        const on = item.key === selected;
        // Without onSelect every chip shows its remove button.
        const showRemove = removable && (onSelect ? on : true);
        return (
          <span key={String(item.key)} className={`chip${on ? " on" : ""}${showRemove ? " has-x" : ""}`}>
            <button
              type="button"
              className="chip-main"
              aria-pressed={onSelect ? on : undefined}
              onClick={() => onSelect?.(item.key)}
              style={onSelect ? undefined : { cursor: "default", color: "var(--ink)" }}
            >
              {item.color && <span style={{ width: 8, height: 8, borderRadius: 2, background: item.color }} />}
              {item.label}
            </button>
            {showRemove && (
              <button type="button" className="chip-x" aria-label={`Remove ${String(item.key)}`} onClick={() => onRemove!(item.key)}>
                <CloseIcon size={10} />
              </button>
            )}
          </span>
        );
      })}
      {onAdd && (
        <button type="button" className="chip add" onClick={onAdd}>
          <PlusIcon size={11} />
          {addLabel}
        </button>
      )}
    </div>
  );
}

/** Small values separated by hairlines. */
export function Parts({ items, className, style }: { items: ReactNode[]; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={className ? `parts ${className}` : "parts"} style={style}>
      {items.map((item, i) => (
        <span key={i}>{item}</span>
      ))}
    </span>
  );
}

/** Section with the uppercase title and a config-table tag. */
export function Section({
  title,
  tag,
  children,
  style,
}: {
  title: string;
  tag?: ReactNode;
  children: ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <section className="sec" style={style}>
      <div className="sec-h">
        <h2 className="sec-t">{title}</h2>
        {tag !== undefined && <span className="sec-k">{tag}</span>}
      </div>
      {children}
    </section>
  );
}

/** A sphere-like swatch for a material, drawn with CSS. */
export function Swatch({
  base,
  metallic,
  roughness,
  size = 40,
}: {
  base: [number, number, number];
  metallic: number;
  roughness: number;
  size?: number;
}) {
  const metal = metallic > 0.5;
  const mix = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i]! - v) * t);
  const css = (c: number[]) => `rgb(${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255)).join(",")})`;
  const lit = metal ? base.map((v) => v * 0.85) : mix(base, [1, 1, 1], 0.08);
  const highlight = metal ? mix(base, [1, 1, 1], 0.55) : [1, 1, 1];
  const shine = Math.pow(1 - roughness, 1.5) * (metal ? 0.95 : 0.6);
  return (
    <span
      className="swatch"
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        background: `radial-gradient(circle at 36% 32%, ${css(mix(lit, highlight, shine))} 0%, ${css(lit)} ${
          (0.06 + roughness * 0.34) * 100
        }%, ${css(base.map((v) => v * (metal ? 0.45 : 0.6)))} 72%, ${css(base.map((v) => v * (metal ? 0.3 : 0.2)))} 100%)`,
      }}
    />
  );
}
