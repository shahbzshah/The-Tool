interface ISensitivitySliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}

/** Slider for flow/stress detection sensitivity calibration (US-018). */
export default function SensitivitySlider({ label, value, min, max, step = 1, onChange }: ISensitivitySliderProps) {
  return (
    <label className="block space-y-1">
      <span className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-mono text-primary">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
        aria-label={label}
      />
    </label>
  );
}
