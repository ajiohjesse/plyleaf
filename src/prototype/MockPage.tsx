// A drawn stand-in for a rendered PDF page, so the prototype needs no engine.
import { cx } from "./ui";

const LINES = [92, 88, 95, 60, 0, 90, 94, 85, 91, 40, 0, 93, 89, 72];

export function MockPage({ n = 1, className, large = false }: { n?: number; className?: string; large?: boolean }) {
  return (
    <div
      className={cx(
        "relative aspect-[1/1.414] overflow-hidden bg-white shadow-[0_1px_2px_rgb(15_13_46/0.12),0_8px_24px_-12px_rgb(15_13_46/0.3)]",
        large ? "rounded-sm p-[8%]" : "rounded-[3px] p-[10%]",
        className,
      )}
    >
      <div className="h-[3.5%] w-1/2 rounded-full bg-[#2b2a45]" />
      <div className="mt-[2%] h-[2%] w-1/3 rounded-full bg-[#9a99b0]" />
      <div className="mt-[8%] grid gap-[2.2%]">
        {LINES.map((width, i) =>
          width ? (
            <div
              key={i}
              className="h-[1.1vmin] max-h-2 min-h-[2px] rounded-full bg-[#cfcfdc]"
              style={{ width: `${width}%` }}
            />
          ) : (
            <div key={i} className="h-[1.1vmin] max-h-2 min-h-[2px]" />
          ),
        )}
      </div>
      {n === 1 && <div className="mt-[8%] h-[22%] w-full rounded-sm bg-[#e8e8f0]" />}
      <span className="absolute right-[6%] bottom-[3%] text-[clamp(6px,1.2vmin,11px)] text-[#9a99b0] tabular-nums">
        {n}
      </span>
    </div>
  );
}
