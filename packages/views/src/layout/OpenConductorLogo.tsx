import ocLogo from "../assets/oc-logo.png";

export function OpenConductorLogo({
  className,
  size = 22,
  title = "Open Conductor",
}: {
  className?: string;
  /** CSS pixel width/height; image is square */
  size?: number;
  /** Accessible name when used alone */
  title?: string;
}) {
  return (
    <img
      src={ocLogo}
      alt=""
      width={size}
      height={size}
      title={title}
      className={`pointer-events-none shrink-0 select-none object-contain ${className ?? ""}`}
      draggable={false}
    />
  );
}
